"use client";

// PGN viewer: renders a static chessboard + move list for a single game.
// Key goals:
// - Parse PGN (headers + moves) with tolerance for comments/NAGs/variations.
// - Build a timeline of FENs and expose per‑ply Move objects.
// - Provide snappy navigation (keyboard, slider, mouse) without selection flicker.
// - Highlight last move (from/to squares) using configurable colors.
// - Support board flipping, persisted in localStorage.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { Chess, type Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { siteConfig } from "@/config/site";

// Extracts PGN header tags (e.g., [Event "..."]) into a key/value map.
function extractHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerRe = /^\s*\[([^\s\]]+)\s+"([^"]*)"\]\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(pgn))) {
    headers[m[1]] = m[2];
  }
  // Fallback for tag pairs without brackets (e.g., `FEN "..."` lines)
  const looseTags = ["Event", "Site", "Date", "Round", "White", "Black", "Result", "FEN", "Variant", "Termination"];
  for (const tag of looseTags) {
    if (headers[tag]) continue;
    const re = new RegExp(`^\\s*${tag}\\s+"([^"]*)"\\s*$`, "m");
    const match = re.exec(pgn);
    if (match && match[1] != null) headers[tag] = match[1];
  }
  return headers;
}

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const rankFromRow = (row: number) => 8 - row;
const squareFromIdx = (row: number, col: number) => `${files[col] ?? "a"}${rankFromRow(row)}`;

// chess.js 1.4.0 does not fully support Chess960 castling from arbitrary rook
// start squares. As a fallback, detect SAN castling tokens, move king+rook to
// standard destinations (g/f for O-O, c/d for O-O-O), and re-instantiate the
// engine from the resulting FEN so subsequent moves continue to parse.
function manualCastle(engine: any, token: string, is960: boolean, EngineCtor: any): { engine: any; move: Move } | null {
  const preFen = engine.fen();
  const parts = preFen.split(/\s+/);
  if (parts.length < 6) return null;
  type BoardSquare = { type: string; color: "w" | "b" } | null;
  const board: BoardSquare[][] = engine.board(); // 8x8 array, row 0 = 8th rank
  const color = parts[1] === "w" ? "w" : "b";
  const isQueenside = token.startsWith("O-O-O");
  let kingSq: string | null = null;
  const rooks: string[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r]?.[c];
      if (!piece) continue;
      if (piece.type === "k" && piece.color === color) kingSq = squareFromIdx(r, c);
      if (piece.type === "r" && piece.color === color) rooks.push(squareFromIdx(r, c));
    }
  }
  if (!kingSq || rooks.length === 0) return null;
  const kingFile = kingSq.charCodeAt(0);
  const rookSq = rooks
    .map((sq) => ({ sq, file: sq.charCodeAt(0) }))
    .filter((r) => (isQueenside ? r.file < kingFile : r.file > kingFile))
    .sort((a, b) => (isQueenside ? b.file - a.file : a.file - b.file))[0]?.sq;
  if (!rookSq) return null;
  const rank = color === "w" ? "1" : "8";
  const kingTo = `${isQueenside ? "c" : "g"}${rank}`;
  const rookTo = `${isQueenside ? "d" : "f"}${rank}`;

  // Build a new board representation for the post-castle position.
  const newBoard: BoardSquare[][] = board.map((row) => row.map((sq) => (sq ? { ...sq } : null)));
  const clearSquare = (sq: string) => {
    const fileIdx = sq.charCodeAt(0) - "a".charCodeAt(0);
    const rankIdx = 8 - Number(sq[1]);
    if (newBoard[rankIdx]) newBoard[rankIdx][fileIdx] = null;
  };
  const setSquare = (sq: string, piece: { type: string; color: "w" | "b" }) => {
    const fileIdx = sq.charCodeAt(0) - "a".charCodeAt(0);
    const rankIdx = 8 - Number(sq[1]);
    if (newBoard[rankIdx]) newBoard[rankIdx][fileIdx] = piece;
  };
  clearSquare(kingSq);
  clearSquare(rookSq);
  setSquare(kingTo, { type: "k", color });
  setSquare(rookTo, { type: "r", color });

  const boardToPlacement = () => {
    const rows: string[] = [];
    for (let r = 0; r < 8; r++) {
      let rowStr = "";
      let empties = 0;
      for (let c = 0; c < 8; c++) {
        const sq = newBoard[r]?.[c];
        if (!sq) {
          empties += 1;
        } else {
          if (empties > 0) {
            rowStr += String(empties);
            empties = 0;
          }
          rowStr += sq.color === "w" ? sq.type.toUpperCase() : sq.type;
        }
      }
      if (empties > 0) rowStr += String(empties);
      rows.push(rowStr);
    }
    return rows.join("/");
  };

  const placement = boardToPlacement();
  const newActive = color === "w" ? "b" : "w";
  const newCastling = (parts[2] || "").replace(color === "w" ? /[KQ]/g : /[kq]/g, "") || "-";
  const newEp = "-";
  const newHalf = "0";
  const newFull = color === "b" ? String(Number(parts[5] || "1") + 1) : parts[5] || "1";
  const newFen = `${placement} ${newActive} ${newCastling} ${newEp} ${newHalf} ${newFull}`;
  try {
    const newEngine = new EngineCtor(newFen, { chess960: is960 });
    const move: Move = {
      color: color === "w" ? "w" : "b",
      from: kingSq,
      to: kingTo,
      san: token,
      flags: isQueenside ? "q" : "k",
      piece: "k",
    } as Move;
    return { engine: newEngine, move };
  } catch {
    return null;
  }
}

// Some PGNs (especially Chess960 exports) use generic KQkq castling rights even
// when rooks aren't on a/h. chess.js expects rook-file letters (e.g., CH for
// rooks on c/h). Normalize those cases so castling remains legal.
function normalizeChess960Castling(fen: string, is960: boolean): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return fen;
  const [placement, active, castling, ...rest] = parts;
  const rows = placement.split("/");
  if (rows.length !== 8) return fen;
  const expandRow = (row: string) => {
    let out = "";
    for (const ch of row) {
      if (/[1-8]/.test(ch)) out += " ".repeat(Number(ch));
      else out += ch;
    }
    return out;
  };
  const whiteRow = expandRow(rows[7] ?? "");
  const blackRow = expandRow(rows[0] ?? "");
  const fileFromIdx = (idx: number) => String.fromCharCode("a".charCodeAt(0) + idx);
  const whiteRooks: string[] = [];
  const blackRooks: string[] = [];
  [...whiteRow].forEach((ch, idx) => {
    if (ch === "R") whiteRooks.push(fileFromIdx(idx));
  });
  [...blackRow].forEach((ch, idx) => {
    if (ch === "r") blackRooks.push(fileFromIdx(idx));
  });
  const hasWhite = /[KQ]/.test(castling);
  const hasBlack = /[kq]/.test(castling);
  const needs960Conversion = is960 && /^[KQkq]+$/.test(castling);
  const hasFileNotation = castling && !/^[KQkq-]+$/.test(castling);
  if (!needs960Conversion && !hasFileNotation) {
    // Leave standard chess castling untouched when not in 960 mode.
    return fen;
  }
  const normalized = [
    hasWhite ? whiteRooks.map((f) => f.toUpperCase()).join("") : "",
    hasBlack ? blackRooks.map((f) => f.toLowerCase()).join("") : "",
  ].join("");
  parts[2] = normalized || "-";
  return [placement, active, parts[2], ...rest].join(" ");
}

// Removes headers/comments/variations/NAGs and returns a sequence of SAN tokens
// (or UCI-like tokens if present). Also drops the terminal result token.
function stripAndTokenizeSAN(pgn: string): string[] {
  // Remove headers
  let body = pgn.replace(/^\s*\[[^\]]*\]\s*$/gm, "").trim();
  // If headers were provided without brackets, drop everything before the first move number.
  const firstMoveIdx = body.search(/\b\d+\.(?:\s|\.)/);
  if (firstMoveIdx > 0) {
    body = body.slice(firstMoveIdx);
  }
  // Remove comments {...}
  let text = body.replace(/\{[^}]*\}/g, " ");
  // Remove line comments starting with ;
  text = text.replace(/;.*$/gm, " ");
  // Remove variations (...) (non-greedy, best-effort)
  text = text.replace(/\([^()]*\)/g, " ");
  // Remove NAGs like $1
  text = text.replace(/\$\d+/g, " ");
  // Remove move numbers like 1. or 34... and ellipses
  text = text.replace(/\b\d+\.(\.{1,3})?/g, " ");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  // Split
  const tokens = text.split(" ");
  // Filter out results and empties
  const results = new Set(["1-0", "0-1", "1/2-1/2", "*"]);
  return tokens.filter((t) => t && !results.has(t));
}

// Converts PGN into a list of FENs (one per ply, starting at initial) and a
// parallel list of Move objects as produced by chess.js. FENs and Moves share
// the same indexing (0 = initial state; i>0 indicates move i).
function buildFenTimeline(pgn: string) {
  const headers = extractHeaders(pgn);
  const initialFenRaw = headers.FEN || undefined;
  const has960Variant = (headers.Variant || headers.VARIANT || "").toLowerCase() === "chess960";
  const initialFenProvisional = initialFenRaw ? normalizeChess960Castling(initialFenRaw, has960Variant || Boolean(initialFenRaw)) : undefined;
  const is960 = has960Variant || Boolean(initialFenProvisional);
  const initialFen = initialFenRaw ? normalizeChess960Castling(initialFenRaw, is960) : undefined;
  // Extract SAN tokens directly from PGN to avoid parser quirks
  const sanMoves = stripAndTokenizeSAN(pgn);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const EngineCtor: any = Chess as unknown as any;
  const fallbackFen = (fen: string | undefined) => {
    if (!fen) return undefined;
    const parts = fen.split(/\s+/);
    if (parts.length < 4) return fen;
    parts[2] = "-"; // strip castling rights if they appear invalid
    return parts.join(" ");
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let engine: any;
  try {
    const construct = (fen?: string) => (fen ? new EngineCtor(fen, { chess960: is960 }) : new EngineCtor(undefined, { chess960: is960 }));
    engine = construct(initialFen) ?? construct(fallbackFen(initialFen)) ?? construct();
  } catch {
    const stripped = fallbackFen(initialFen);
    try {
      engine = stripped ? new EngineCtor(stripped, { chess960: is960 }) : new EngineCtor(undefined, { chess960: is960 });
    } catch {
      engine = new EngineCtor(undefined, { chess960: is960 });
    }
  }
  const fens: string[] = [engine.fen()];
  const moves: Array<Move | null> = [null];
  // Supports UCI-like tokens alongside SAN when present in PGN body.
  const uciRe = /^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/;
  for (const tok of sanMoves) {
    // Normalize castling tokens that may use zeros instead of letter O so chess.js can parse them.
    const dashNormalized = tok.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-"); // normalize various dash characters to hyphen
    const zeroNormalized = dashNormalized.replace(/０/g, "0"); // normalize full-width zero
    const normTok = zeroNormalized
      .replace(/^([0oO])-([0oO])-([0oO])([+#]?)$/i, "O-O-O$4")
      .replace(/^([0oO])-([0oO])([+#]?)$/i, "O-O$3");
    const finalTok = normTok.replace(/[!?]+$/, ""); // strip annotations that chess.js can't parse in castling
    try {
      let ok = false;
      let res: Move | null = null;
      if (uciRe.test(finalTok)) {
        const from = finalTok.slice(0, 2) as string;
        const to = finalTok.slice(2, 4) as string;
        const promo = finalTok.length === 5 ? finalTok.slice(4).toLowerCase() as "q" | "r" | "b" | "n" : undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res = (engine as any).move({ from, to, promotion: promo });
        ok = Boolean(res);
      } else {
        res = (engine as unknown as { move: (san: string, opts?: unknown) => Move | null }).move(finalTok, { sloppy: true });
        ok = Boolean(res);
      }
      // Fallback: if castling SAN failed, pick the legal castling move directly (helps with exotic notations)
      if (!ok && /^O-O(-O)?[+#]?$/.test(finalTok)) {
        const wantsQueenside = finalTok.startsWith("O-O-O");
        const candidates = (engine.moves({ verbose: true }) as unknown as Array<Move & { flags?: string }>);
        const cand = candidates.find((m) => typeof m.flags === "string" && m.flags.includes(wantsQueenside ? "q" : "k"));
        if (cand) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          res = (engine as any).move({ from: (cand as any).from, to: (cand as any).to, promotion: (cand as any).promotion });
          ok = Boolean(res);
        }
        // If chess.js cannot generate a castling move (common with Chess960 FEN), manually relocate king+rook.
        if (!ok) {
          const manual = manualCastle(engine, finalTok, is960, EngineCtor);
          if (manual) {
            engine = manual.engine;
            moves.push(manual.move);
            fens.push(engine.fen());
            continue;
          }
        }
      }
      if (ok && res) moves.push(res);
      if (!ok) break;
      fens.push(engine.fen());
    } catch {
      // Final fallback: handle castling that throws in chess.js by applying manual move.
      if (/^O-O(-O)?[+#]?$/.test(finalTok)) {
        const manual = manualCastle(engine, finalTok, is960, EngineCtor);
        if (manual) {
          engine = manual.engine;
          moves.push(manual.move);
          fens.push(engine.fen());
          continue;
        }
      }
      break;
    }
  }
  
  // Ensure moves length aligns with fens (both start with initial state)
  while (moves.length < fens.length) moves.push(null);
  return { fens, initialFen: initialFen ?? null, sans: sanMoves, headers, moves };
}

export function PgnViewer({ pgn, asideTop }: { pgn: string; asideTop?: ReactNode }) {
  const { t } = useTranslation();
  const { fens, sans, moves } = useMemo(() => buildFenTimeline(pgn), [pgn]);
  // Start at the initial position by default
  const initialPly = 0;
  // Board state
  const [ply, setPly] = useState(initialPly);
  // UI-selected state (updates immediately for snappy selection)
  const [selPly, setSelPly] = useState(initialPly);
  // Autoplay controls (disabled by default to preserve user control)
  const [auto, setAuto] = useState(false);
  const [speedMs] = useState(1000);
  const timerRef = useRef<number | null>(null);
  const boardIdRef = useRef<string>(`pgn-viewer-${Math.random().toString(36).slice(2)}`);
  const [prevSelPly, setPrevSelPly] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const movesContainerRef = useRef<HTMLDivElement | null>(null);
  const [orientation, setOrientation] = useState<"white" | "black">(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("pgnViewer.orientation") : null;
      return saved === "black" || saved === "white" ? (saved as "white" | "black") : "white";
    } catch {
      return "white";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("pgnViewer.orientation", orientation);
    } catch {}
  }, [orientation]);

  // Queue a ply change transition while updating the selection immediately for
  // responsive UI feedback (used by buttons/keyboard/slider).
  const gotoPly = useCallback((target: number) => {
    setPrevSelPly(selPly);
    setSelPly(target);
    startTransition(() => setPly(target));
  }, [selPly, startTransition]);

  // Scroll helper to keep current move row centered
  // Keeps the current move row centered within the scroll container.
  const scrollMoveIntoView = useCallback((targetSelPly: number) => {
    const container = movesContainerRef.current;
    if (!container) return;
    const idx = targetSelPly - 1;
    if (idx < 0) return;
    const rowNo = Math.floor(idx / 2) + 1; // 1-based
    const el = rowRefs.current.get(rowNo);
    if (!el) return;
    const cRect = container.getBoundingClientRect();
    const rRect = el.getBoundingClientRect();
    const diff = rRect.top - cRect.top; // row top relative to container
    const target = container.scrollTop + diff - (container.clientHeight / 2 - el.clientHeight / 2);
    container.scrollTop = Math.max(0, Math.min(target, container.scrollHeight - container.clientHeight));
  }, []);

  // Immediate selection for pointer interactions to avoid visual delay/flicker.
  const gotoPlyImmediate = useCallback((target: number) => {
    flushSync(() => {
      setPrevSelPly(selPly);
      setSelPly(target);
    });
    // Synchronously adjust scroll so highlight appears instantly under the pointer
    scrollMoveIntoView(target);
    startTransition(() => setPly(target));
  }, [selPly, startTransition, scrollMoveIntoView]);

  // Autoplay timer (advances ply every `speedMs`). Ensures cleanup on changes.
  useEffect(() => {
    if (!auto) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = window.setInterval(() => {
      setSelPly((sp) => (sp + 1 < fens.length ? sp + 1 : 0));
      startTransition(() => {
        setPly((p) => (p + 1 < fens.length ? p + 1 : 0));
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [auto, fens.length, speedMs]);
  
  const turn = Math.floor((selPly + 1) / 2);
  // Compute current FEN truncated to placement (drop counters/turns for board)
  const boardFen = useMemo(() => {
    const fen = fens[Math.min(Math.max(0, ply), Math.max(0, fens.length - 1))] ?? fens[0] ?? "";
    return typeof fen === "string" ? fen.split(" ")[0] : "";
  }, [fens, ply]);

  // Highlight last move squares (from/to) for the selected ply
  // Compute square styles for the last move (from/to) at the selected ply.
  // Colors are sourced from siteConfig.highlight.
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    const mv = moves[selPly] as Move | null | undefined;
    if (mv && typeof mv.from === "string" && typeof mv.to === "string") {
      styles[mv.from] = { boxShadow: `inset 0 0 0 3px ${siteConfig.highlight.from}` };
      styles[mv.to] = { boxShadow: `inset 0 0 0 3px ${siteConfig.highlight.to}` };
    }
    return styles;
  }, [moves, selPly]);

  // Auto-scroll current move row into view (centered) within the moves container only
  // Keep the selected move centered within the moves list on selection change.
  useEffect(() => {
    const container = movesContainerRef.current;
    if (!container) return;
    const idx = selPly - 1;
    if (idx < 0) return;
    const rowNo = Math.floor(idx / 2) + 1; // 1-based
    const el = rowRefs.current.get(rowNo);
    if (!el) return;
    const cRect = container.getBoundingClientRect();
    const rRect = el.getBoundingClientRect();
    const diff = rRect.top - cRect.top; // row top relative to container
    const target = container.scrollTop + diff - (container.clientHeight / 2 - el.clientHeight / 2);
    container.scrollTop = Math.max(0, Math.min(target, container.scrollHeight - container.clientHeight));
  }, [selPly]);

  // Keyboard shortcuts
  // Keyboard support: ArrowLeft/Right to navigate; Home/End; Space toggles autoplay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        gotoPly(Math.max(0, selPly - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        gotoPly(Math.min(fens.length - 1, selPly + 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        gotoPly(0);
      } else if (e.key === "End") {
        e.preventDefault();
        gotoPly(fens.length - 1);
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setAuto((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fens.length, gotoPly, selPly]);

  const movePairs = useMemo(() => {
    const pairs: Array<{ n: number; w: string | null; b: string | null; wi: number; bi: number | null }> = [];
    for (let i = 0; i < sans.length; i += 2) {
      const n = i / 2 + 1;
      pairs.push({ n, w: sans[i] ?? null, b: sans[i + 1] ?? null, wi: i, bi: i + 1 < sans.length ? i + 1 : null });
    }
    return pairs;
  }, [sans]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div className="rounded-xl border border-base-300 p-3">
          <div className="w-full max-w-[520px] aspect-square mx-auto">
            <Chessboard
              options={{
                id: typeof boardIdRef.current === "string" ? boardIdRef.current : "pgn-viewer",
                position: boardFen,
                boardOrientation: orientation,
                allowDragging: false,
                showAnimations: false,
                clearArrowsOnPositionChange: true,
                boardStyle: { width: "100%", height: "100%" },
                squareStyles: squareStyles,
              }}
            />
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap text-center">
          <button className="btn btn-sm" onClick={() => gotoPly(0)} disabled={selPly === 0}>
            «
          </button>
          <button className="btn btn-sm" onClick={() => gotoPly(Math.max(0, selPly - 1))} disabled={selPly === 0}>
            {"<"}
          </button>
          <button
            className={`btn btn-sm ${auto ? "btn-secondary" : "btn-primary"}`}
            onClick={() => setAuto((v) => !v)}
            disabled={fens.length <= 1}
          >
            {auto ? t("viewer.pause", "Pause") : t("viewer.play", "Play")}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
            title={t("viewer.flip", "Flip")}
          >
            {t("viewer.flip", "Flip")}
          </button>
          <button className="btn btn-sm" onClick={() => gotoPly(Math.min(fens.length - 1, selPly + 1))} disabled={selPly >= fens.length - 1}>
            {">"}
          </button>
          <button className="btn btn-sm" onClick={() => gotoPly(fens.length - 1)} disabled={selPly >= fens.length - 1}>
            »
          </button>
          <div className="ml-2 text-sm opacity-70">Move {turn} / {Math.ceil((fens.length - 1) / 2)}</div>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <input
            type="range"
            min={0}
            max={Math.max(0, fens.length - 1)}
            value={selPly}
            onChange={(e) => gotoPly(Number(e.target.value))}
            className="range range-sm w-full max-w-[480px]"
          />
          <div className="text-xs tabular-nums">{selPly} / {fens.length - 1}</div>
        </div>
        {/** PGN block moved to right column below Moves for better mobile order */}
      </div>
      <div className="space-y-3">
        {asideTop ? (
          <div className="rounded-xl border border-base-300 p-3 flex justify-center">
            <div className="w-full max-w-md text-center">{asideTop}</div>
          </div>
        ) : null}
        <div className="rounded-xl border border-base-300 p-3 text-sm">
          <div className="font-semibold mb-2">{t("viewer.moves", "Moves")}</div>
          <div ref={movesContainerRef} className="max-h-[70vh] overflow-y-auto">
            <table className="table table-zebra table-sm w-full">
              <tbody className="font-mono text-xs sm:text-sm">
                {movePairs.map(({ n, w, b, wi, bi }) => {
                  const currentIdx = selPly - 1;
                  const prevIdx = (prevSelPly ?? 0) - 1;
                  const wIsCurrent = currentIdx === wi;
                  const wIsPrev = prevIdx === wi;
                  const bIsCurrent = currentIdx === bi;
                  const bIsPrev = prevIdx === bi;
                  return (
                    <tr key={`row-${n}`} ref={(el) => {
                      if (el) rowRefs.current.set(n, el); else rowRefs.current.delete(n);
                    }}>
                      <td className="w-8 sm:w-10 text-right opacity-70 align-middle select-none pr-2">{n}</td>
                      <td
                        className={`align-middle px-2 py-1 cursor-pointer ${w && !wIsCurrent ? "hover:bg-base-200" : ""} ${wIsCurrent ? "bg-primary text-primary-content font-bold" : wIsPrev ? "bg-base-300" : ""}`}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          if (w) gotoPlyImmediate(wi + 1);
                        }}
                      >
                        {w ?? ""}
                      </td>
                      <td
                        className={`align-middle px-2 py-1 cursor-pointer ${b && !bIsCurrent ? "hover:bg-base-200" : ""} ${bIsCurrent ? "bg-primary text-primary-content font-bold" : bIsPrev ? "bg-base-300" : ""}`}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          if (b && bi != null) gotoPlyImmediate((bi as number) + 1);
                        }}
                      >
                        {b ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <PgnToggle pgn={pgn} />
      </div>
    </div>
  );
}

function PgnToggle({ pgn }: { pgn: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window.innerWidth || 0;
      if (w >= 1024) setOpen(true); // auto-expand on lg and above
    }
  }, []);
  return (
    <div className="rounded-xl border border-base-300 p-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{t("viewer.pgn", "PGN")}</div>
        <button className="btn btn-xs" onClick={() => setOpen((v) => !v)}>
          {open ? t("viewer.hidePGN", "Hide PGN") : t("viewer.showPGN", "Show PGN")}
        </button>
      </div>
      {open ? (
        <pre className="mt-2 whitespace-pre-wrap break-words max-h-[30vh] overflow-auto text-xs leading-5">{pgn}</pre>
      ) : null}
    </div>
  );
}
