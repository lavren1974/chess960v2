"use client";

// All Results (client): renders a paginated, live-updating table of finished
// matches. The server provides the initial slice; the client subscribes to
// realtime INSERT/UPDATE events and updates page 1 in place. Agent labels are
// displayed using `AgentLabel`, and missing agent rows are fetched lazily to
// avoid flicker (showing a subtle placeholder until data arrives).

import { useEffect, useMemo, useRef, useState } from "react";
import { useSupabase } from "@/components/supabase-provider";
import type { MatchRow } from "@/components/results/live-results";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import type { AgentRow } from "@/components/agents/agent-utils";
import { AgentLabel } from "@/components/agents/agent-label";

// Keep pagination sizes explicit to control server load and UX.
const ALLOWED_PAGE_SIZES = [50, 100, 1000] as const;

// Guard for rows that represent completed games.
function isFinished(row: MatchRow) {
  return Boolean(row.result);
}

export function AllResultsLive({
  initial,
  lng,
  perPage,
  page,
  total,
  agents,
}: {
  initial: MatchRow[];
  lng: string;
  perPage: number;
  page: number;
  total: number;
  agents: Record<number, AgentRow>;
}) {
  const { client } = useSupabase();
  const { t } = useTranslation();
  // Items shown in the table; seeded from the server slice.
  const [items, setItems] = useState<MatchRow[]>(initial);
  // Cache of agent metadata for labels; seeded from server.
  const [agentMap, setAgentMap] = useState<Record<number, AgentRow>>(agents);
  const [totalCount, setTotalCount] = useState<number>(total);
  const seenIds = useRef<Set<number>>(new Set(initial.map((r) => r.id)));
  const agentMapRef = useRef<Record<number, AgentRow>>(agents);

  // Keep internal ref in sync to avoid stale closures inside handlers.
  useEffect(() => {
    agentMapRef.current = agentMap;
  }, [agentMap]);

  // Realtime subscription: listen for new/updated matches. Only page 1 is
  // updated in place to preserve paging invariants.
  useEffect(() => {
    const channel = client
      .channel("realtime-results-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, (payload) => {
        // We only update page 1 in place.
        if (page !== 1) return;

        const row = (payload.new || payload.old) as MatchRow;
        if (!row || !isFinished(row)) return;

        if (payload.eventType === 'DELETE') {
          if (seenIds.current.has(row.id)) {
            setItems((prev) => prev.filter((r) => r.id !== row.id));
            seenIds.current.delete(row.id);
            setTotalCount((c) => c - 1);
          }
        } else {
          // This handles both INSERT and UPDATE
          setItems((prev) => {
            const idx = prev.findIndex((r) => r.id === row.id);
            if (idx !== -1) {
              const next = [...prev];
              next[idx] = row;
              return next;
            }
            // If it's a new row, add it to the top.
            if (!seenIds.current.has(row.id)) {
              seenIds.current.add(row.id);
              setTotalCount((c) => c + 1);
              return [row, ...prev].slice(0, perPage);
            }
            return prev;
          });
        }
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, page, perPage]);

  // Reset local cache when server-provided slice changes (page/perPage change
  // or hard refresh). Also sync total and agent map.
  useEffect(() => {
    setItems(initial);
    seenIds.current = new Set(initial.map((r) => r.id));
    setTotalCount(total);
    setAgentMap(agents);
  }, [initial, total, perPage, page, agents]);

  // Ensure agent details are available for all rows in view. Fetch any missing
  // agents in small batches to avoid URL-length limits and rate spikes.
  useEffect(() => {
    const missing = new Set<number>();
    for (const m of items) {
      if (!agentMap[m.player_white]) missing.add(m.player_white);
      if (!agentMap[m.player_black]) missing.add(m.player_black);
    }
    if (missing.size === 0) return;
    const CHUNK = 200;
    const ids = Array.from(missing);
    let cancelled = false;
    (async () => {
      for (let i = 0; i < ids.length && !cancelled; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data } = await client
          .from("agents")
          .select("id, sp_id, mini_fen, color")
          .in("id", slice);
        if (Array.isArray(data) && !cancelled) {
          setAgentMap((prev) => {
            const next = { ...prev };
            for (const a of data as unknown as AgentRow[]) next[a.id] = a as AgentRow;
            return next;
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, client, agentMap]);

  const rows = useMemo(() => items, [items]);

  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  function linkFor(p?: number | null, ps?: number) {
    return {
      pathname: `/${lng}/results/all`,
      query: {
        page: String(p ?? page),
        perPage: String(ps ?? perPage),
      },
    } as const;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span>{t("results.perPage")}</span>
        {ALLOWED_PAGE_SIZES.map((ps) => (
          <Link
            key={ps}
            href={linkFor(1, ps)}
            aria-current={ps === perPage ? "page" : undefined}
            className={`btn btn-xs ${ps === perPage ? "btn-primary" : "btn-ghost"}`}
          >
            {ps}
          </Link>
        ))}
        <span className="badge badge-outline">{perPage}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="table table-zebra w-full text-center min-w-max">
          <thead>
            <tr>
              <th className="text-center">{t("results.headers.white")}</th>
              <th className="text-center">{t("results.headers.black")}</th>
              <th className="text-center">{t("results.headers.round")}</th>
              <th className="text-center">{t("results.headers.result")}</th>
              <th className="text-center">{t("results.headers.game")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/player/${m.player_white}`}>
                    {agentMap[m.player_white] ? (
                      <AgentLabel agent={agentMap[m.player_white]} />
                    ) : (
                      <span className="opacity-60">…</span>
                    )}
                  </a>
                </td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/player/${m.player_black}`}>
                    {agentMap[m.player_black] ? (
                      <AgentLabel agent={agentMap[m.player_black]} />
                    ) : (
                      <span className="opacity-60">…</span>
                    )}
                  </a>
                </td>
                <td className="text-center">
                  {m.round != null ? (
                    <a className="link link-primary" href={`/${lng}/results/round/${m.round}`}>
                      {m.round}
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="text-center font-medium">{m.result}</td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/game/${m.id}`}>
                    {t("viewer.pgn")} #{m.id}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Link
          className={`btn ${prevPage ? "btn-outline" : "btn-disabled"}`}
          aria-disabled={!prevPage}
          href={prevPage ? linkFor(prevPage) : { pathname: `/${lng}/results/all`, query: { page: String(page), perPage: String(perPage) } }}
        >
          {t("results.previous")}
        </Link>
        <div className="text-sm opacity-70">{t("results.pageStatus", { page, totalPages, total: totalCount })}</div>
        <Link
          className={`btn ${nextPage ? "btn-outline" : "btn-disabled"}`}
          aria-disabled={!nextPage}
          href={nextPage ? linkFor(nextPage) : { pathname: `/${lng}/results/all`, query: { page: String(page), perPage: String(perPage) } }}
        >
          {t("results.next")}
        </Link>
      </div>
    </div>
  );
}
