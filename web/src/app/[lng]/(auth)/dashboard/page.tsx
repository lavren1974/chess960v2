import { getServerClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { DashboardClient } from "./page-client";
import type { AgentRow } from "@/components/agents/agent-utils";
import type { Metadata } from "next";
import { getServerTranslation } from "@/app/i18n";
import { languages } from "@/app/i18n/settings";

export default async function Dashboard({
  params,
}: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = await params;
  const supabase = await getServerClient();
  const service = getServiceRoleClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return (
      <div className="space-y-8">
        <div className="alert alert-error">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <h3 className="font-bold">Authentication Required</h3>
            <div className="text-xs">Please log in to access your dashboard.</div>
          </div>
        </div>
      </div>
    );
  }

  // Load user's favorite starting positions, newest first, max 100
  let favorites: AgentRow[] = [];
  let favoriteIds: number[] = [];
  try {
    const { data: favRows } = await service
      .from("sf_agent_favorites")
      .select("agent_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    const ids = Array.isArray(favRows) ? favRows.map((f) => f.agent_id) : [];
    favoriteIds = ids as number[];
    if (ids.length > 0) {
      const { data: agents } = await service
        .from("sf_agents")
        .select("id, sp_id, mini_fen, color")
        .in("id", ids);
      const byId = new Map((agents ?? []).map((a: any) => [a.id, a]));
      favorites = ids
        .map((id) => byId.get(id))
        .filter(Boolean) as unknown as AgentRow[];
    }
  } catch {
    // best-effort, ignore errors
  }

  // Preload first Positions page (White and Black first pages), 60 rows
  const perPage = 60;
  const page = 1;
  const from1 = 0;
  const to1 = perPage - 1;
  const from2 = perPage;
  const to2 = perPage * 2 - 1;
  let initialPositions: {
    view: "white" | "black";
    page: number;
    perPage: number;
    rows: AgentRow[];
    total: number;
    favoriteIds: number[];
    counts: { white: number; black: number };
    initialPages?: Partial<Record<"white" | "black", { page: number; perPage: number; rows: AgentRow[]; total: number }>>;
    initialExtra?: Array<{ view: "white" | "black"; page: number; perPage: number; rows: AgentRow[]; total: number }>;
  } = {
    view: "white",
    page,
    perPage,
    rows: [],
    total: 0,
    favoriteIds,
    counts: { white: 0, black: 0 },
    initialPages: {},
    initialExtra: [],
  };
  try {
    // Counts
    const [cw, cb] = await Promise.all([
      service.from("sf_agents").select("id", { count: "planned", head: true }).eq("color", "w"),
      service.from("sf_agents").select("id", { count: "planned", head: true }).eq("color", "b"),
    ]);
    initialPositions.counts = {
      white: typeof cw.count === "number" ? cw.count : 0,
      black: typeof cb.count === "number" ? cb.count : 0,
    };

    // First page (white)
    const { data: dataW } = await service
      .from("sf_agents")
      .select("id, sp_id, mini_fen, color")
      .eq("color", "w")
      .order("color", { ascending: true })
      .order("sp_id", { ascending: true })
      .order("id", { ascending: true })
      .range(from1, to1);
    initialPositions.rows = (Array.isArray(dataW) ? (dataW as any) : []) as AgentRow[];
    initialPositions.total = initialPositions.counts.white;
    initialPositions.initialPages!.white = {
      page,
      perPage,
      rows: initialPositions.rows,
      total: initialPositions.total,
    };

    // First page (black)
    const { data: dataB } = await service
      .from("sf_agents")
      .select("id, sp_id, mini_fen, color")
      .eq("color", "b")
      .order("color", { ascending: true })
      .order("sp_id", { ascending: true })
      .order("id", { ascending: true })
      .range(from1, to1);
    initialPositions.initialPages!.black = {
      page,
      perPage,
      rows: (Array.isArray(dataB) ? (dataB as any) : []) as AgentRow[],
      total: initialPositions.counts.black,
    };

    // Second page (white)
    const { data: dataW2 } = await service
      .from("sf_agents")
      .select("id, sp_id, mini_fen, color")
      .eq("color", "w")
      .order("color", { ascending: true })
      .order("sp_id", { ascending: true })
      .order("id", { ascending: true })
      .range(from2, to2);
    initialPositions.initialExtra!.push({ view: "white", page: 2, perPage, rows: (Array.isArray(dataW2) ? (dataW2 as any) : []) as AgentRow[], total: initialPositions.counts.white });

    // Second page (black)
    const { data: dataB2 } = await service
      .from("sf_agents")
      .select("id, sp_id, mini_fen, color")
      .eq("color", "b")
      .order("color", { ascending: true })
      .order("sp_id", { ascending: true })
      .order("id", { ascending: true })
      .range(from2, to2);
    initialPositions.initialExtra!.push({ view: "black", page: 2, perPage, rows: (Array.isArray(dataB2) ? (dataB2 as any) : []) as AgentRow[], total: initialPositions.counts.black });
  } catch {
    // ignore errors; client will fetch
  }

  return (
    <div className="space-y-8">
      <DashboardClient
        lng={lng}
        favorites={favorites}
        initialPositions={initialPositions}
      />
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ lng: string }> }): Promise<Metadata> {
  const { lng } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "common");
  return { title: t("nav.dashboard", { defaultValue: "Dashboard" }) as string };
}

