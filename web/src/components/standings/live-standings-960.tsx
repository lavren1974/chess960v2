"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSupabase } from "@/components/supabase-provider";
import Link from "next/link";
import type { AgentRow } from "@/components/agents/agent-utils";
import { AgentLabel } from "@/components/agents/agent-label";
import {
  combineStandings960,
  sortCombinedStandings,
  type CombinedStandingRow,
  type StandingRow,
} from "@/components/standings/standings-960-utils";

const STANDINGS_SELECT =
  "id, player_id, games_played, wins, draws, losses, points, bergvizer_score, championship_id";

export function LiveStandings960({
  initial,
  champId,
  lng,
  perPage,
  page,
  total,
  championships,
  agents,
  favoriteIds = [],
  favoritesOnly = false,
  showFavoritesToggle = false,
  rankMap,
}: {
  initial: CombinedStandingRow[];
  champId: number | null;
  lng: string;
  perPage: number;
  page: number;
  total: number;
  championships: Array<{ id: number; status?: string | null; start_date?: string | null }>;
  agents: Record<number, AgentRow>;
  favoriteIds?: number[];
  favoritesOnly?: boolean;
  showFavoritesToggle?: boolean;
  rankMap?: Record<number, number>;
}) {
  const { client } = useSupabase();
  const [rows, setRows] = useState<CombinedStandingRow[]>(initial);
  const [totalCount, setTotalCount] = useState(total);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [agentMap, setAgentMap] = useState<Record<number, AgentRow>>(agents);
  const agentMapRef = useRef<Record<number, AgentRow>>(agents);
  const hasAppliedStoredChamp = useRef(false);
  const favSet = useMemo(() => new Set<number>(favoriteIds), [favoriteIds]);
  const [rankMapState, setRankMapState] = useState<Record<number, number> | undefined>(rankMap);

  useEffect(() => {
    agentMapRef.current = agentMap;
  }, [agentMap]);

  const [champSelector, setChampSelector] = useState<number | null>(champId);

  function buildRankMap(combined: CombinedStandingRow[]) {
    const map: Record<number, number> = {};
    combined.forEach((row, idx) => {
      map[row.slot] = idx + 1;
    });
    return map;
  }

  async function fetchRange(min: number, max: number) {
    let scoped = client.from("sf_standings").select(STANDINGS_SELECT);
    if (champId) scoped = scoped.eq("championship_id", champId);
    scoped = scoped.gte("player_id", min).lte("player_id", max);
    const { data } = await scoped;
    return Array.isArray(data) ? (data as StandingRow[]) : [];
  }

  async function refreshPage() {
    const from = (page - 1) * perPage;
    const to = from + perPage;

    const [whiteRows, blackRows] = await Promise.all([
      fetchRange(1001, 1960),
      fetchRange(2001, 2960),
    ]);

    const combinedAll = sortCombinedStandings(combineStandings960([...whiteRows, ...blackRows]));
    setRankMapState(buildRankMap(combinedAll));
    let combined = combinedAll;
    if (favoritesOnly && favoriteIds.length === 0) {
      setRows([]);
      setTotalCount(0);
      return;
    }
    if (favoritesOnly) {
      combined = combined.filter(
        (row) => favSet.has(row.white_id) || favSet.has(row.black_id),
      );
    }
    const slice = combined.slice(from, to);
    setRows(slice);
    setTotalCount(combined.length);

    const ids = Array.from(new Set(slice.flatMap((r) => [r.white_id, r.black_id])));
    const missing = ids.filter((id) => !agentMapRef.current[id]);
    if (missing.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < missing.length; i += CHUNK) {
        const chunk = missing.slice(i, i + CHUNK);
        const { data: aData } = await client
          .from("sf_agents")
          .select("id, sp_id, mini_fen, color")
          .in("id", chunk);
        if (Array.isArray(aData)) {
          setAgentMap((prev) => {
            const next = { ...prev } as Record<number, AgentRow>;
            for (const a of aData as unknown as AgentRow[]) next[a.id] = a as AgentRow;
            return next;
          });
        }
      }
    }
  }

  useEffect(() => {
    const channel = client
      .channel("realtime-standings-960")
      .on("postgres_changes", { event: "*", schema: "public", table: "sf_standings" }, (payload) => {
        const row = (payload.new || payload.old) as StandingRow | undefined;
        if (row && champId && row.championship_id !== champId) return;
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => {
          void refreshPage();
        }, 250);
      })
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void client.removeChannel(channel);
    };
  }, [client, champId, page, perPage, favoritesOnly, favoriteIds, favSet]);

  useEffect(() => {
    setRows(initial);
    setTotalCount(total);
    setAgentMap(agents);
    setRankMapState(rankMap);
  }, [initial, agents, total, rankMap]);

  const { t } = useTranslation();
  const favoriteLabel = t("dashboard.favorites", { defaultValue: "Favorites" });
  const favoritesEmptyLabel = t("dashboard.favoritesEmpty", {
    defaultValue: "No favorites yet. Browse positions to add some.",
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  function linkFor(p?: number | null, nextFavoritesOnly?: boolean) {
    const useFavorites = typeof nextFavoritesOnly === "boolean" ? nextFavoritesOnly : favoritesOnly;
    return {
      pathname: `/${lng}/standings960`,
      query: {
        page: String(p ?? page),
        perPage: String(perPage),
        ...(champId ? { champ: String(champId) } : {}),
        ...(useFavorites ? { favorites: "1" } : {}),
      },
    } as const;
  }

  useEffect(() => {
    if (hasAppliedStoredChamp.current) return;
    hasAppliedStoredChamp.current = true;
    if (!championships.length) return;
    const stored = sessionStorage.getItem("standingsChampId");
    const parsed = stored ? parseInt(stored, 10) : NaN;
    const match = championships.some((c) => c.id === parsed);
    if (match && parsed !== champId) {
      const params = new URLSearchParams(window.location.search);
      params.set("champ", String(parsed));
      params.set("page", "1");
      const next = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, "", next);
      window.location.href = next;
    }
  }, [champId, championships]);

  function handleChampChange(value: string) {
    const nextId = parseInt(value, 10);
    if (!Number.isFinite(nextId)) return;
    sessionStorage.setItem("standingsChampId", String(nextId));
    setChampSelector(nextId);
    const params = new URLSearchParams(window.location.search);
    params.set("champ", String(nextId));
    params.set("page", "1");
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", next);
    window.location.href = next;
  }

  useEffect(() => {
    setChampSelector(champId);
  }, [champId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {showFavoritesToggle ? (
          <Link
            className={`btn btn-sm ${favoritesOnly ? "btn-primary" : "btn-outline"}`}
            href={linkFor(1, !favoritesOnly)}
          >
            {favoriteLabel}
          </Link>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="label-text text-sm opacity-70">
            {t("standings.championshipLabel", { defaultValue: "Championship" })}:{" "}
          </span>
          <select
            className="select select-bordered select-sm w-16"
            value={champSelector ?? ""}
            onChange={(e) => handleChampChange(e.target.value)}
            disabled={!championships.length}
          >
            {!championships.length ? (
              <option value="">
                {t("standings.noChampionships", { defaultValue: "No championships available" })}
              </option>
            ) : null}
            {championships.map((c) => {
              const label = String(c.id);
              return (
                <option key={c.id} value={c.id}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table table-zebra w-full text-center min-w-max">
          <thead>
            <tr>
              <th className="text-center">{t("standings.headers.rank")}</th>
              <th className="text-center">{t("results.headers.white", { defaultValue: "White" })}</th>
              <th className="text-center">{t("results.headers.black", { defaultValue: "Black" })}</th>
              <th className="text-center">{t("standings.headers.played")}</th>
              <th className="text-center">{t("standings.headers.wins")}</th>
              <th className="text-center">{t("standings.headers.draws")}</th>
              <th className="text-center">{t("standings.headers.losses")}</th>
              <th className="text-center">{t("standings.headers.points")}</th>
              <th className="text-center">{t("standings.headers.bergvizer")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="text-center py-6 opacity-70" colSpan={9}>
                  {favoritesOnly
                    ? favoritesEmptyLabel
                    : t("positions.empty", { defaultValue: "No positions to display" })}
                </td>
              </tr>
            ) : null}
            {rows.map((r, idx) => (
              <tr key={`${r.white_id}-${r.black_id}`}>
                <td className="text-center">
                  {favoritesOnly && rankMapState?.[r.slot]
                    ? rankMapState[r.slot]
                    : (page - 1) * perPage + idx + 1}
                </td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/player/${r.white_id}`}>
                    {agentMap[r.white_id] ? (
                      <AgentLabel
                        agent={agentMap[r.white_id]}
                        isFavorited={favSet.has(r.white_id)}
                      />
                    ) : (
                      <span className="font-mono">{r.white_id}</span>
                    )}
                  </a>
                </td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/player/${r.black_id}`}>
                    {agentMap[r.black_id] ? (
                      <AgentLabel
                        agent={agentMap[r.black_id]}
                        isFavorited={favSet.has(r.black_id)}
                      />
                    ) : (
                      <span className="font-mono">{r.black_id}</span>
                    )}
                  </a>
                </td>
                <td className="text-center">{r.games_played}</td>
                <td className="text-center">{r.wins}</td>
                <td className="text-center">{r.draws}</td>
                <td className="text-center">{r.losses}</td>
                <td className="text-center font-semibold">{Number(r.points).toFixed(1)}</td>
                <td className="text-center">
                  {r.bergvizer_score != null ? Number(r.bergvizer_score).toFixed(2) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Link
            className={`btn btn-sm ${page === 1 ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={page === 1}
            href={page === 1 ? linkFor(page) : linkFor(1)}
          >
            {t("results.first", { defaultValue: "First" })}
          </Link>
          <Link
            className={`btn btn-sm ${!prevPage ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={!prevPage}
            href={!prevPage ? linkFor(page) : linkFor(prevPage)}
          >
            {t("results.previous")}
          </Link>
          <span className="px-3 py-1 text-sm rounded-md bg-base-200">
            {t("results.pageStatus", { page, totalPages, total: totalCount })}
          </span>
          <Link
            className={`btn btn-sm ${!nextPage ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={!nextPage}
            href={!nextPage ? linkFor(page) : linkFor(nextPage)}
          >
            {t("results.next")}
          </Link>
          <Link
            className={`btn btn-sm ${page === totalPages ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={page === totalPages}
            href={page === totalPages ? linkFor(page) : linkFor(totalPages)}
          >
            {t("results.last", { defaultValue: "Last" })}
          </Link>
        </div>
      </div>
    </div>
  );
}
