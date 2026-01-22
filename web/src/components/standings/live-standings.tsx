"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSupabase } from "@/components/supabase-provider";
import Link from "next/link";
import type { AgentRow } from "@/components/agents/agent-utils";
import { AgentLabel } from "@/components/agents/agent-label";

export type StandingRow = {
  id: number;
  player_id: number;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  bergvizer_score: number | null;
  championship_id: number;
};

type View = "all" | "white" | "black";

export function LiveStandings({
  initial,
  champId,
  lng,
  perPage,
  page,
  total,
  counts,
  view,
  championships,
  agents,
  favoriteIds = [],
  favoritesOnly = false,
  showFavoritesToggle = false,
  rankMap,
}: {
  initial: StandingRow[];
  champId: number | null;
  lng: string;
  perPage: number;
  page: number;
  total: number;
  counts: { all: number; white: number; black: number };
  view: View;
  championships: Array<{ id: number; status?: string | null; start_date?: string | null }>;
  agents: Record<number, AgentRow>;
  favoriteIds?: number[];
  favoritesOnly?: boolean;
  showFavoritesToggle?: boolean;
  rankMap?: Record<number, number>;
}) {
  const { client } = useSupabase();
  const mapRef = useRef<Map<number, StandingRow>>(new Map(initial.map((r) => [r.player_id, r])));
  const [, setVersion] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [agentMap, setAgentMap] = useState<Record<number, AgentRow>>(agents);
  const agentMapRef = useRef<Record<number, AgentRow>>(agents);
  const hasAppliedStoredChamp = useRef(false);

  useEffect(() => {
    agentMapRef.current = agentMap;
  }, [agentMap]);

  const [roundInput, setRoundInput] = useState<string>("");
  const [champSelector, setChampSelector] = useState<number | null>(champId);

  // Helper: fetch current page slice from Supabase with same ordering/filters
  async function refreshPage() {
    const allView: View = view;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    let scoped = client
      .from("sf_standings")
      .select(
        "id, player_id, games_played, wins, draws, losses, points, bergvizer_score, championship_id",
      );
    if (champId) scoped = scoped.eq("championship_id", champId);
    if (favoritesOnly && favoriteIds.length === 0) {
      mapRef.current = new Map();
      setVersion((v) => v + 1);
      return;
    }
    if (favoritesOnly) scoped = scoped.in("player_id", favoriteIds);
    if (allView === "white") scoped = scoped.gte("player_id", 1001).lte("player_id", 1960);
    if (allView === "black") scoped = scoped.gte("player_id", 2001).lte("player_id", 2960);
    scoped = scoped
      .order("points", { ascending: false })
      .order("bergvizer_score", { ascending: false, nullsFirst: false })
      .order("games_played", { ascending: false })
      .order("player_id", { ascending: true })
      .range(from, to);

    const { data } = await scoped;
    if (Array.isArray(data)) {
      mapRef.current = new Map((data as StandingRow[]).map((r) => [r.player_id, r]));
      setVersion((v) => v + 1);
      // Ensure agent metadata present for this slice
      const ids = (data as StandingRow[]).map((r) => r.player_id);
      const missing = ids.filter((id) => !agentMapRef.current[id]);
      if (missing.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < missing.length; i += CHUNK) {
          const slice = missing.slice(i, i + CHUNK);
          const { data: aData } = await client
            .from("sf_agents")
            .select("id, sp_id, mini_fen, color")
            .in("id", slice);
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
  }

  useEffect(() => {
    const channel = client
      .channel("realtime-standings")
      .on("postgres_changes", { event: "*", schema: "public", table: "sf_standings" }, (payload) => {
        const row = (payload.new || payload.old) as StandingRow | undefined;
        if (row && champId && row.championship_id !== champId) return;
        // Debounce refresh to coalesce bursts
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
  }, [client, champId, view, page, perPage, favoritesOnly, favoriteIds]);

  useEffect(() => {
    mapRef.current = new Map(initial.map((r) => [r.player_id, r]));
    setVersion((v) => v + 1);
    setAgentMap(agents);
  }, [initial, agents]);

  const { t } = useTranslation();
  const allRows = Array.from(mapRef.current.values());
  const favSet = useMemo(() => new Set<number>(favoriteIds), [favoriteIds]);
  const favoriteLabel = t("dashboard.favorites", { defaultValue: "Favorites" });
  const favoritesEmptyLabel = t("dashboard.favoritesEmpty", {
    defaultValue: "No favorites yet. Browse positions to add some.",
  });

  function cmp(a: StandingRow, b: StandingRow) {
    if (b.points !== a.points) return b.points - a.points;
    const aB = a.bergvizer_score ?? 0;
    const bB = b.bergvizer_score ?? 0;
    if (bB !== aB) return bB - aB;
    if (b.games_played !== a.games_played) return b.games_played - a.games_played;
    return a.player_id - b.player_id;
  }

  const rows = useMemo(() => allRows.slice().sort(cmp), [allRows]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  function linkFor(nextView?: View, p?: number | null, nextFavoritesOnly?: boolean) {
    const useFavorites = typeof nextFavoritesOnly === "boolean" ? nextFavoritesOnly : favoritesOnly;
    return {
      pathname: `/${lng}/standings`,
      query: {
        view: String(nextView ?? view),
        page: String(p ?? page),
        perPage: String(perPage),
        ...(champId ? { champ: String(champId) } : {}),
        ...(useFavorites ? { favorites: "1" } : {}),
      },
    } as const;
  }

  useEffect(() => {
    // On first load, honor any stored selection for this browser session (but not beyond reboot)
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
      // Trigger a hard refresh of data via navigation to keep server data in sync
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
            href={linkFor(view, 1, !favoritesOnly)}
          >
            {favoriteLabel}
          </Link>
        ) : null}
        <div className="tabs tabs-boxed w-fit">
          <Link className={`tab ${view === "all" ? "tab-active" : ""}`} href={linkFor("all", 1)}>
            {t("standings.tabs.all")} ({counts.all})
          </Link>
          <Link className={`tab ${view === "white" ? "tab-active" : ""}`} href={linkFor("white", 1)}>
            {t("standings.tabs.white")} ({counts.white})
          </Link>
          <Link className={`tab ${view === "black" ? "tab-active" : ""}`} href={linkFor("black", 1)}>
            {t("standings.tabs.black")} ({counts.black})
          </Link>
        </div>
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

      <div className="flex items-center gap-2 text-sm">
        <label className="opacity-70">{t("standings.viewRound")}</label>
        <input
          type="number"
          min={1}
          className="input input-bordered input-sm w-28"
          value={roundInput}
          onChange={(e) => setRoundInput(e.target.value)}
          placeholder="e.g. 1"
        />
        <a
          className={`btn btn-sm ${roundInput ? "btn-outline" : "btn-disabled"}`}
          aria-disabled={!roundInput}
          href={roundInput ? `/${lng}/results/round/${roundInput}` : undefined}
        >
          {t("standings.open")}
        </a>
      </div>

      <div className="overflow-x-auto">
        <table className="table table-zebra w-full text-center min-w-max">
          <thead>
            <tr>
              <th className="text-center">{t("standings.headers.rank")}</th>
              <th className="text-center">{t("standings.headers.agentId")}</th>
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
                <td className="text-center py-6 opacity-70" colSpan={8}>
                  {favoritesOnly ? favoritesEmptyLabel : t("positions.empty", { defaultValue: "No positions to display" })}
                </td>
              </tr>
            ) : null}
            {rows.map((r, idx) => (
              <tr key={r.player_id}>
                <td className="text-center">
                  {favoritesOnly && rankMap?.[r.player_id]
                    ? rankMap[r.player_id]
                    : (page - 1) * perPage + idx + 1}
                </td>
                <td className="text-center">
                  <div className="flex justify-center">
                    <a className="link link-primary" href={`/${lng}/results/player/${r.player_id}`}>
                      {agentMap[r.player_id] ? (
                        <AgentLabel agent={agentMap[r.player_id]} isFavorited={favSet.has(r.player_id)} />
                      ) : (
                        <span className="font-mono">{r.player_id}</span>
                      )}
                    </a>
                  </div>
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
            href={page === 1 ? linkFor(view, page) : linkFor(view, 1)}
          >
            {t("results.first", { defaultValue: "First" })}
          </Link>
          <Link
            className={`btn btn-sm ${!prevPage ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={!prevPage}
            href={!prevPage ? linkFor(view, page) : linkFor(view, prevPage)}
          >
            {t("results.previous")}
          </Link>
          <span className="px-3 py-1 text-sm rounded-md bg-base-200">
            {t("results.pageStatus", { page, totalPages, total })}
          </span>
          <Link
            className={`btn btn-sm ${!nextPage ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={!nextPage}
            href={!nextPage ? linkFor(view, page) : linkFor(view, nextPage)}
          >
            {t("results.next")}
          </Link>
          <Link
            className={`btn btn-sm ${page === totalPages ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={page === totalPages}
            href={page === totalPages ? linkFor(view, page) : linkFor(view, totalPages)}
          >
            {t("results.last", { defaultValue: "Last" })}
          </Link>
        </div>
      </div>
    </div>
  );
}
