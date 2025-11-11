import { getServerClient } from "@/lib/supabase/server";
import { getServerTranslation } from "@/app/i18n";
import { AllResultsLive } from "@/components/results/all-results-live";
import type { MatchRow } from "@/components/results/live-results";
import { redirect } from "next/navigation";
import type { AgentRow } from "@/components/agents/agent-utils";
import type { Metadata } from "next";

type SearchParams = Record<string, string | string[]>;

// Server-side pagination controls. `ALLOWED_PAGE_SIZES` caps how many rows the
// client is allowed to request per page.
const DEFAULT_PAGE_SIZE = 50;
const ALLOWED_PAGE_SIZES = [50, 100, 1000] as const;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lng: string }> }): Promise<Metadata> {
  const { lng } = await params;
  const { t } = await getServerTranslation(lng, "common");
  return { title: t("results.allTitle") };
}

// Parse a strictly positive integer or return a fallback.
function parsePositiveInt(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default async function AllResultsPage(props: {
  params: Promise<{ lng: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { lng } = await props.params;
  const { t } = await getServerTranslation(lng, "common");
  const sp = (props.searchParams ? await props.searchParams : {}) as SearchParams;

  // Normalize `perPage` accepting malformed concatenations like `page=1perPage=100`.
  const pageSizeRaw = sp.perPage ?? String(DEFAULT_PAGE_SIZE);
  const perPageInput = Array.isArray(pageSizeRaw) ? pageSizeRaw[0] : pageSizeRaw;
  const perPageFromConcat = typeof perPageInput === "string" ? /perPage=(\d+)/i.exec(perPageInput)?.[1] : undefined;
  const pageRawForPer = sp.page ?? "";
  const pageInputForPer = Array.isArray(pageRawForPer) ? pageRawForPer[0] : pageRawForPer;
  const perPageFromPageRaw = typeof pageInputForPer === "string" ? /perPage=(\d+)/i.exec(pageInputForPer)?.[1] : undefined;
  let needsRedirect = false;
  const perPageCandidate = parsePositiveInt(
    perPageFromConcat ?? perPageFromPageRaw ?? perPageInput,
    DEFAULT_PAGE_SIZE,
  );
  const perPage = (ALLOWED_PAGE_SIZES as readonly number[]).includes(perPageCandidate)
    ? perPageCandidate
    : DEFAULT_PAGE_SIZE;

  // Normalize `page` accepting similar malformed concatenations.
  const pageRaw = sp.page ?? "1";
  const pageInput = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw;
  // Extract page from messy inputs without matching `perPage=` erroneously
  const pageMatch =
    typeof pageInput === "string" ? /(^|[^a-zA-Z])page=(\d+)/i.exec(pageInput) : null;
  const pageFromConcat = pageMatch?.[2];
  // If someone passed `perPage=50page=2`, pull page from perPageRaw too (with safe boundary)
  const pageMatchFromPer =
    typeof perPageInput === "string" ? /(^|[^a-zA-Z])page=(\d+)/i.exec(perPageInput) : null;
  const pageFromPerRaw = pageMatchFromPer?.[2];
  const page = Math.max(1, parsePositiveInt(pageFromConcat ?? pageFromPerRaw ?? pageInput, 1));
  if (
    (typeof pageInput === "string" && ((/perPage=/.test(pageInput)) || ((/page=/.test(pageInput)) && pageInput !== String(page)))) ||
    (typeof perPageInput === "string" && ((/page=/.test(perPageInput)) || ((/perPage=/.test(perPageInput)) && perPageInput !== String(perPage))))
  ) {
    needsRedirect = true;
  }

  if (needsRedirect) {
    const q = new URLSearchParams();
    q.set("page", String(page));
    q.set("perPage", String(perPage));
    redirect(`/${lng}/results/all?${q.toString()}`);
  }

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const supabase = await getServerClient();

  // Some PostgREST deployments cap a single response to 50 rows.
  // Fetch in chunks until we reach the desired perPage, preserving order.
  async function fetchChunk(start: number, end: number, withCount = false) {
    const sel = supabase
      .from("matches")
      .select(
        "id, created_at, player_white, player_black, round, championship_id, result",
        withCount ? { count: "planned" } : {},
      )
      .eq("status", true)
      .not("result", "is", null)
      .order("id", { ascending: false })
      .range(start, end);
    return sel;
  }

  let initial: MatchRow[] = [];
  let total = 0;
  let error: { message: string } | null = null;

  // First attempt: request the full window in one go
  {
    const { data, error: e, count } = await fetchChunk(from, to, true);
    if (e) error = e as { message: string };
    total = typeof count === "number" && count >= 0 ? count : 0;
    if (Array.isArray(data)) initial = data as unknown as MatchRow[];
  }

  // If server limited the rows (e.g., 50), fetch remaining rows in subsequent chunked requests.
  if (initial.length < Math.min(perPage, total)) {
    const observedChunk = initial.length > 0 ? initial.length : 50;
    let nextFrom = from + initial.length;
    const target = Math.min(perPage, total);
    while (initial.length < target) {
      const nextTo = nextFrom + observedChunk - 1;
      const { data, error: e2 } = await fetchChunk(nextFrom, nextTo, false);
      if (e2 && !error) error = e2 as { message: string };
      const batch = Array.isArray(data) ? (data as unknown as MatchRow[]) : [];
      if (batch.length === 0) break;
      initial = initial.concat(batch);
      nextFrom += batch.length;
      // Guard against unexpected server behavior
      if (batch.length < observedChunk) break;
    }
  }

  // Fetch agents for current slice (chunked to avoid URL length limits).
  const agentsMap: Record<number, AgentRow> = {};
  if (initial.length > 0) {
    const idSet = new Set<number>();
    for (const m of initial) {
      idSet.add(m.player_white);
      idSet.add(m.player_black);
    }
    const ids = Array.from(idSet);
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data: agents } = await supabase
        .from("agents")
        .select("id, sp_id, mini_fen, color")
        .in("id", slice);
      if (Array.isArray(agents)) {
        for (const a of agents as unknown as AgentRow[]) {
          agentsMap[a.id] = a;
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("results.allTitle")}</h1>
      <AllResultsLive initial={initial} lng={lng} perPage={perPage} page={page} total={total} agents={agentsMap} />
      {error ? (
        <p className="text-sm text-warning">
          Unable to fetch results ({error.message}). Check RLS and permissions.
        </p>
      ) : null}
    </div>
  );
}
