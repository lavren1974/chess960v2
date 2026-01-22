"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { RealtimePostgresUpdatePayload } from "@supabase/supabase-js";
import { useSupabase } from "@/components/supabase-provider";
import type { AgentRow } from "@/components/agents/agent-utils";
import { AgentLabel } from "@/components/agents/agent-label";

export type RatingRow = AgentRow & {
  current_elo: number;
};

type View = "all" | "white" | "black";

export function LiveRatings({
  initial,
  lng,
  perPage,
  page,
  total,
  counts,
  view,
  deltas,
  favoriteIds = [],
  favoritesOnly = false,
  showFavoritesToggle = false,
  rankMap,
}: {
  initial: RatingRow[];
  lng: string;
  perPage: number;
  page: number;
  total: number;
  counts: { all: number; white: number; black: number };
  view: View;
  deltas: Record<number, number>;
  favoriteIds?: number[];
  favoritesOnly?: boolean;
  showFavoritesToggle?: boolean;
  rankMap?: Record<number, number>;
}) {
  const { client } = useSupabase();
  const mapRef = useRef<Map<number, RatingRow>>(new Map(initial.map((r) => [r.id, r])));
  const [, setVersion] = useState(0);

  // Realtime: keep ELO up to date for rows already in the current page
  useEffect(() => {
    const channel = client
      .channel("realtime-ratings")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sf_agents" },
        (payload: RealtimePostgresUpdatePayload<RatingRow>) => {
          const row = payload.new as RatingRow | undefined;
          if (!row) return;
          if (mapRef.current.has(row.id)) {
            mapRef.current.set(row.id, row);
            setVersion((v) => v + 1);
          }
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client]);

  const { t } = useTranslation();

  // Reset when a new slice arrives from server
  useEffect(() => {
    mapRef.current = new Map(initial.map((r) => [r.id, r]));
    setVersion((v) => v + 1);
  }, [initial]);

  function cmp(a: RatingRow, b: RatingRow) {
    if (b.current_elo !== a.current_elo) return b.current_elo - a.current_elo;
    if (a.color !== b.color) return a.color < b.color ? -1 : 1;
    if (a.sp_id !== b.sp_id) return a.sp_id - b.sp_id;
    return a.id - b.id;
  }

  const allRows = Array.from(mapRef.current.values());
  const rows = useMemo(() => allRows.slice().sort(cmp), [allRows]);
  const favSet = useMemo(() => new Set<number>(favoriteIds), [favoriteIds]);
  const favoriteLabel = t("dashboard.favorites", { defaultValue: "Favorites" });
  const favoritesEmptyLabel = t("dashboard.favoritesEmpty", {
    defaultValue: "No favorites yet. Browse positions to add some.",
  });

  // Pagination helpers
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  function linkFor(nextView?: View, p?: number | null, nextFavoritesOnly?: boolean) {
    const useFavorites = typeof nextFavoritesOnly === "boolean" ? nextFavoritesOnly : favoritesOnly;
    return {
      pathname: `/${lng}/ratings`,
      query: {
        view: String(nextView ?? view),
        page: String(p ?? page),
        perPage: String(perPage),
        ...(useFavorites ? { favorites: "1" } : {}),
      },
    } as const;
  }

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
            {t("ratings.tabs.all")} ({counts.all})
          </Link>
          <Link className={`tab ${view === "white" ? "tab-active" : ""}`} href={linkFor("white", 1)}>
            {t("ratings.tabs.white")} ({counts.white})
          </Link>
          <Link className={`tab ${view === "black" ? "tab-active" : ""}`} href={linkFor("black", 1)}>
            {t("ratings.tabs.black")} ({counts.black})
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table table-zebra w-full text-center min-w-max">
          <thead>
            <tr>
              <th className="text-center">{t("ratings.headers.rank")}</th>
              <th className="text-center">{t("ratings.headers.agentId")}</th>
              <th className="text-center">{t("ratings.headers.elo")}</th>
              <th className="text-center">{t("ratings.headers.delta")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="text-center py-6 opacity-70" colSpan={4}>
                  {favoritesOnly
                    ? favoritesEmptyLabel
                    : t("positions.empty", { defaultValue: "No positions to display" })}
                </td>
              </tr>
            ) : null}
            {rows.map((r, idx) => (
              <tr key={r.id}>
                <td className="text-center">
                  {favoritesOnly && rankMap?.[r.id]
                    ? rankMap[r.id]
                    : (page - 1) * perPage + idx + 1}
                </td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/player/${r.id}`}>
                    <AgentLabel agent={r} isFavorited={favSet.has(r.id)} />
                  </a>
                </td>
                <td className="text-center font-semibold">{r.current_elo}</td>
                <td className="text-center">
                  {(() => {
                    const d = deltas[r.id];
                    if (d == null) return <span className="badge badge-ghost badge-sm">-</span>;
                    const sign = d > 0 ? "+" : "";
                    const cls = d > 0 ? "badge-success" : d < 0 ? "badge-error" : "badge-neutral";
                    return <span className={`badge badge-sm ${cls}`}>{`${sign}${d}`}</span>;
                  })()}
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

