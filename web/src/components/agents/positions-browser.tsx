"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSupabase, useUser } from "@/components/supabase-provider";
import type { AgentRow } from "@/components/agents/agent-utils";
import { AgentLabel } from "@/components/agents/agent-label";
// Using PNG piece sprites from /public/pieces via rewrite

type View = "white" | "black";

export function PositionsBrowser({
  lng,
  initial,
  onFavoriteToggle,
}: {
  lng: string;
  initial?: {
    // default view and pagination
    view: View;
    page: number;
    perPage: number;
    rows: AgentRow[];
    total: number;
    favoriteIds: number[];
    counts: { white: number; black: number };
    // optional cache for instant switch
    initialPages?: Partial<Record<View, { page: number; perPage: number; rows: AgentRow[]; total: number }>>;
    // additional cached pages
    initialExtra?: Array<{ view: View; page: number; perPage: number; rows: AgentRow[]; total: number }>;
  };
  onFavoriteToggle?: (agent: AgentRow, isFav: boolean) => void;
}) {
  const { client } = useSupabase();
  const user = useUser();
  const { t } = useTranslation();

  const [view, setView] = useState<View>(initial?.view ?? "white");
  const [page, setPage] = useState(initial?.page ?? 1);
  const [perPage] = useState(initial?.perPage ?? 60);
  const [rows, setRows] = useState<AgentRow[]>(initial?.rows ?? []);
  const [loading, setLoading] = useState<boolean>(!initial);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(initial?.total ?? 0);
  const [counts] = useState<{ white: number; black: number }>(initial?.counts ?? { white: 0, black: 0 });
  const [favoriteIds, setFavoriteIds] = useState<number[]>(initial?.favoriteIds ?? []);
  const [reloadToken, setReloadToken] = useState(0);
  const cacheRef = useRef<Map<string, { rows: AgentRow[]; total: number }>>(new Map());

  // Piece placement filters (per-view)
  type Piece = "K" | "Q" | "B" | "N" | "R";
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [placementsByView, setPlacementsByView] = useState<Record<View, Array<Piece | null>>>(
    () => ({ white: Array(8).fill(null), black: Array(8).fill(null) }) as Record<View, Array<Piece | null>>,
  );
  const placements = placementsByView[view];
  const usedCounts = useMemo(() => {
    const counts: Record<Piece, number> = { K: 0, Q: 0, B: 0, N: 0, R: 0 };
    for (const p of placements) if (p) counts[p]++;
    return counts;
  }, [placements]);
  const allowCounts: Record<Piece, number> = { K: 1, Q: 1, B: 2, N: 2, R: 2 };
  const canPlace = (p: Piece) => usedCounts[p] < allowCounts[p];
  const pieceSrc = (p: Piece, c: "w" | "b") => `/pieces/${c}${p}.png`;
  const clearPlacements = () => {
    setPlacementsByView((prev) => ({ ...prev, [view]: Array(8).fill(null) }));
    setSelectedPiece(null);
    setPage(1);
    setReloadToken((v) => v + 1);
  };

  // seed cache from initial
  useEffect(() => {
    cacheRef.current.clear();
    if (initial) {
      const key = `${initial.view}:${initial.page}:${initial.perPage}`;
      cacheRef.current.set(key, { rows: initial.rows, total: initial.total });
      if (initial.initialPages) {
        for (const v of Object.keys(initial.initialPages) as View[]) {
          const p = initial.initialPages[v]!;
          if (!p) continue;
          cacheRef.current.set(`${v}:${p.page}:${p.perPage}`, { rows: p.rows, total: p.total });
        }
      }
      if (Array.isArray(initial.initialExtra)) {
        for (const entry of initial.initialExtra) {
          cacheRef.current.set(`${entry.view}:${entry.page}:${entry.perPage}`, { rows: entry.rows, total: entry.total });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const favSet = useMemo(() => new Set<number>(favoriteIds), [favoriteIds]);

  // Note: counts are provided by server; avoid client count queries for speed

  useEffect(() => {
    let alive = true;
    async function loadFavorites() {
      if (!user) {
        setFavoriteIds([]);
        return;
      }
      const { data } = await client
        .from("sf_agent_favorites")
        .select("agent_id")
        .eq("user_id", user.id);
      if (!alive) return;
      setFavoriteIds(Array.isArray(data) ? data.map((r: any) => r.agent_id as number) : []);
    }
    loadFavorites();
    return () => {
      alive = false;
    };
  }, [client, user]);

  const skipFirstFetch = useRef<boolean>(!!initial);
  const reqIdRef = useRef(0);

  useEffect(() => {
    let alive = true;
    async function loadPage() {
      if (skipFirstFetch.current) {
        skipFirstFetch.current = false;
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const myId = ++reqIdRef.current;
        const TIMEOUT_MS = 10000; // 10s safety timeout
        const from = (page - 1) * perPage;
        const to = from + perPage - 1;
        // Use cache first, if available
        const mask = placements
          .map((p, idx) => (p ? `${idx}:${p}` : ""))
          .filter(Boolean)
          .join(",");
        const cacheKey = `${view}:${page}:${perPage}:${mask}`;
        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
          setRows(cached.rows);
          setTotal(cached.total);
          setLoading(false);
          return;
        }
        const params: Record<string, string> = { view, page: String(page), perPage: String(perPage) };
        if (mask) params.mask = mask;
        const qs = new URLSearchParams(params).toString();
        const timed = new Promise<{ rows?: AgentRow[]; error?: any }>((resolve, reject) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              reject(new Error("Request timed out"));
            }
          }, TIMEOUT_MS);
          fetch(`/api/agents/list?${qs}`, { method: "GET", cache: "no-store" })
            .then(async (res) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              if (!res.ok) {
                let msg = `HTTP ${res.status}`;
                try {
                  const j = await res.json();
                  if (j?.error) msg = String(j.error);
                } catch {}
                reject(new Error(msg));
                return;
              }
              const j = (await res.json()) as { rows?: AgentRow[]; total?: number };
              resolve(j);
            }, (e: any) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              reject(e);
            });
        });
        const { rows, total: totalOverride } = (await timed) as any;
        if (!alive) return;
        if (myId !== reqIdRef.current) return; // newer request in-flight; ignore stale
        const newRows = (Array.isArray(rows) ? rows : []) as AgentRow[];
        const newTotal = typeof totalOverride === "number" ? totalOverride : view === "white" ? counts.white : counts.black;
        setRows(newRows);
        setTotal(newTotal);
        cacheRef.current.set(cacheKey, { rows: newRows, total: newTotal });
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Failed to load positions");
      } finally {
        if (alive) setLoading(false);
      }
    }
    loadPage();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, view, page, perPage, reloadToken, placements]);

  // Keyboard navigation
  const [selectedIdx, setSelectedIdx] = useState(0);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  useEffect(() => {
    setSelectedIdx(0);
  }, [rows, page, view]);

  return (
    <div
      className="space-y-4"
      tabIndex={0}
      onKeyDown={(e) => {
        if (rows.length === 0) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIdx((i) => Math.min(rows.length - 1, i + 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIdx((i) => Math.max(0, i - 1));
        } else if (e.key === "Home") {
          e.preventDefault();
          setSelectedIdx(0);
        } else if (e.key === "End") {
          e.preventDefault();
          setSelectedIdx(rows.length - 1);
        } else if (e.key === "Enter") {
          e.preventDefault();
          const r = rows[selectedIdx];
          if (r) window.location.href = `/${lng}/results/player/${r.id}`;
        } else if (e.key === " " || e.key.toLowerCase() === "f") {
          e.preventDefault();
          const rowEl = rowRefs.current[selectedIdx];
          const btn = rowEl?.querySelector<HTMLButtonElement>("button[aria-pressed]");
          btn?.click();
        }
      }}
    >
      <div className="flex gap-3 w-fit">
        <button
          className={`btn ${view === "white" ? "btn-primary text-primary-content" : "btn-outline"}`}
          onClick={() => { setView("white"); setPage(1); }}
          type="button"
        >
          {t("playPage.white", "White")}
        </button>
        <button
          className={`btn ${view === "black" ? "btn-primary text-primary-content" : "btn-outline"}`}
          onClick={() => { setView("black"); setPage(1); }}
          type="button"
        >
          {t("playPage.black", "Black")}
        </button>
      </div>

      {/* Guidance */}
      <div className="alert alert-success">
        <div>
          <ul className="list-disc pl-5 text-sm">
            <li>{t("positions.guidance.bishops", "Bishops must be placed on squares of different colors (one on white, one on black).")}</li>
            <li>{t("positions.guidance.kingRooks", "The king must be placed between two rooks. This allows castling both sides.")}</li>
          </ul>
        </div>

        {/* Palette (duplicates per piece; remaining only) */}
        <div className="hidden">
          {(["K","Q","B","N","R"] as Piece[])
            .flatMap((p) => {
              const remaining = Math.max(0, allowCounts[p] - usedCounts[p]);
              return Array.from({ length: remaining }, (_, i) => ({ p, i }));
            })
            .map(({ p, i }) => {
              const colorCode = view === "white" ? "w" : "b";
              const isSelected = selectedPiece === p;
              return (
                <button
                  key={`pal2-${view}-${p}-${i}`}
                  className={`btn btn-sm ${isSelected ? "btn-primary" : "btn-outline"}`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedPiece(isSelected ? null : p)}
                  title={`${p}${allowCounts[p] > 1 ? ` #${i + 1}` : ""}`}
                >
                  <span className="inline-flex items-center justify-center h-8 w-8 md:h-9 md:w-9 rounded-sm" style={{ backgroundColor: '#B58863' }}>
                    <img
                      src={pieceSrc(p, colorCode)}
                      alt={`${colorCode === 'w' ? 'White' : 'Black'} ${p}`}
                      className="h-7 w-7 md:h-8 md:w-8 select-none object-contain"
                      draggable={false}
                    />
                  </span>
                </button>
              );
            })}
          <button className="hidden" />
        </div>
      </div>

      <div className="text-sm opacity-70 -mt-2">{t("positions.hint", "Select a piece, then click a square to place or remove it. Use Clear to reset.")}</div>

      {/* Rank board + palette */}
      <div className="overflow-x-auto pb-2">
      <div className="inline-flex flex-col gap-3 min-w-[23rem] sm:min-w-0">
        {/* Rank board: 8 squares. White = a1..h1 left->right; Black = a8..h8 but displayed reversed */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="grid grid-cols-8 gap-0 w-fit select-none mx-auto sm:mx-0">
          {(() => {
            const order = view === "white" ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
            const rankIdx = view === "white" ? 0 : 7; // rank 1 (white) vs rank 8 (black)
            return order.map((fileIdx, i) => {
              const p = placements[fileIdx];
              const colorCode = view === "white" ? "w" : "b";
              // Use standard chess coloring: dark if (file + rank) % 2 == 0 with a1 dark
              const isDark = ((fileIdx + rankIdx) % 2) === 0;
              const files = "abcdefgh";
              const fileLetter = files[fileIdx];
              const light = "#F0D9B5";
              const dark = "#B58863";
              // Board coloring should not change when a piece is placed
              const bgColor = isDark ? dark : light;
              return (
                <button
                  key={`${view}-sq-${i}`}
                  className={`h-9 w-9 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center text-xl transition duration-100 border-0 p-0 m-0 outline-none focus:outline-none focus:ring-0 hover:brightness-105 active:brightness-95`}
                  style={{ backgroundColor: bgColor }}
                  title={p ? `${p} on ${fileLetter}${view === 'white' ? '1' : '8'}` : `${fileLetter}${view === 'white' ? '1' : '8'}`}
                  onClick={() => {
                    setError(null);
                    setPage(1);
                    let didChange = false;
                    setPlacementsByView((prev) => {
                      const next = prev[view].slice();
                      if (!selectedPiece) {
                        if (next[fileIdx] != null) {
                          next[fileIdx] = null;
                          didChange = true;
                        } else {
                          return prev; // no change
                        }
                      } else {
                        if (next[fileIdx] === selectedPiece) {
                          next[fileIdx] = null;
                          didChange = true;
                        } else {
                          const current = next[fileIdx];
                          next[fileIdx] = selectedPiece;
                          const tempCounts: Record<Piece, number> = { K:0,Q:0,B:0,N:0,R:0 } as any;
                          for (const v of next) if (v) tempCounts[v]!++;
                          let ok = true;
                          (Object.keys(allowCounts) as Piece[]).forEach((pc) => {
                            if (tempCounts[pc] > allowCounts[pc]) ok = false;
                          });
                          if (!ok) {
                            next[fileIdx] = current ?? null;
                            return prev; // no change
                          }
                          didChange = true;
                        }
                      }
                      return { ...prev, [view]: next };
                    });
                    if (didChange) {
                      if (selectedPiece) setSelectedPiece(null); // remove the palette piece being placed
                      setReloadToken((v) => v + 1);
                    }
                  }}
                >
                  {p ? (
                    <img
                      src={pieceSrc(p, colorCode)}
                      alt={`${colorCode === 'w' ? 'White' : 'Black'} ${p}`}
                      className="h-7 w-7 md:h-9 md:w-9 select-none"
                      draggable={false}
                    />
                  ) : null}
                </button>
              );
            });
          })()}
          </div>
          <div className="self-start sm:self-auto sm:pt-2">
            <button className="btn btn-outline w-full sm:w-auto" onClick={clearPlacements} title={t("common.clear", "Clear") as string}>
              {t("common.clear", "Clear")}
            </button>
          </div>
        </div>

        {/* File labels */}
        <div className="grid grid-cols-8 gap-0 w-fit select-none mx-auto sm:mx-0">
          {(() => {
            const files = "abcdefgh".split("");
            const list = view === "white" ? files : files.slice().reverse();
            return list.map((f) => (
              <div key={`lbl-${view}-${f}`} className="h-5 w-9 sm:w-10 md:w-12 text-center text-xs opacity-70">
                {f}
              </div>
            ));
          })()}
        </div>

        {/* Palette */}
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {(["K", "Q", "B", "N", "R"] as Piece[])
            .flatMap((p) => {
              const rem = Math.max(0, allowCounts[p] - usedCounts[p]);
              return Array.from({ length: rem }, (_, i) => ({ p, i }));
            })
            .map(({ p, i }) => {
              const colorCode = view === "white" ? "w" : "b";
              return (
                <button
                  key={`pal-${view}-${p}-${i}`}
                  className="inline-flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11 rounded-md border border-base-content/60 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                  onClick={() => setSelectedPiece(p)}
                  title={`${p}${allowCounts[p] > 1 ? ` #${i + 1}` : ""}`}
                >
                  <span
                    className="inline-flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 rounded-sm"
                    style={{ backgroundColor: '#B58863' }}
                  >
                    <img
                      src={pieceSrc(p, colorCode)}
                      alt={`${colorCode === 'w' ? 'White' : 'Black'} ${p}`}
                      className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 select-none object-contain"
                      draggable={false}
                    />
                  </span>
                </button>
              );
          })}
        </div>
      </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table table-zebra w-full text-center min-w-max">
          <thead>
            <tr>
              <th className="text-center">#</th>
              <th className="text-center">{t("ratings.headers.agentId", "Player")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={2} className="text-center p-6">
                  <span className="loading loading-spinner loading-md" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="text-center p-6 text-base-content/60">
                  <div className="flex items-center justify-center gap-3">
                    <span>{error || t("positions.empty", "No positions to display")}</span>
                    {error ? (
                      <button className="btn btn-sm btn-outline" onClick={() => setReloadToken((v) => v + 1)}>
                        {t("results.retry", "Retry")}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr
                  key={r.id}
                  ref={(el) => {
                    rowRefs.current[idx] = el;
                  }}
                  className={selectedIdx === idx ? "bg-base-200" : ""}
                >
                  <td className="text-center">{(page - 1) * perPage + idx + 1}</td>
                  <td className="text-center">
                    <a className="link link-primary" href={`/${lng}/results/player/${r.id}`}>
                      <AgentLabel
                        agent={r}
                        isFavorited={favSet.has(r.id)}
                        onFavoriteChange={(_id, isFav) => {
                          setFavoriteIds((prev) => {
                            const has = prev.includes(r.id);
                            if (isFav && !has) return [...prev, r.id];
                            if (!isFav && has) return prev.filter((x) => x !== r.id);
                            return prev;
                          });
                          onFavoriteToggle?.(r, isFav);
                        }}
                      />
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button className={`btn ${prevPage ? "btn-outline" : "btn-disabled"}`} disabled={!prevPage} onClick={() => prevPage && setPage(prevPage)}>
          {t("results.previous", "Previous")}
        </button>
        <div className="text-sm opacity-70">
          {t("results.pageStatus", { page, totalPages, total })}
        </div>
        <button className={`btn ${nextPage ? "btn-outline" : "btn-disabled"}`} disabled={!nextPage} onClick={() => nextPage && setPage(nextPage)}>
          {t("results.next", "Next")}
        </button>
      </div>
    </div>
  );
}
