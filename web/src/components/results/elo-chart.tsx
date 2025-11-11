"use client";

import { useMemo } from "react";

type HistPoint = { elo_before: number; elo_after: number; created_at: string; match_id: number };

export function EloChart({ history, height = 140, lng }: { history: HistPoint[]; height?: number; lng: string }) {
  const points = useMemo(() => history.map((h) => h.elo_after), [history]);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const pad = 12; // top/bottom padding
  const width = Math.max(280, history.length * 14);
  const range = Math.max(1, max - min);

  const poly = points
    .map((v, i) => {
      const x = (i / Math.max(1, points.length - 1)) * (width - 2 * pad) + pad;
      const y = height - pad - ((v - min) / range) * (height - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="w-full overflow-x-auto">
      <div className="text-sm opacity-70 mb-1">ELO trend (last {history.length})</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-full">
        <defs>
          <linearGradient id="eloFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(var(--p))" stopOpacity="0.25" />
            <stop offset="100%" stopColor="oklch(var(--p))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={width} height={height} fill="none" />
        {poly && (
          <>
            <polyline points={poly} fill="none" stroke="oklch(var(--p))" strokeWidth={2} />
            <polygon
              points={`${poly} ${width - 12},${height - 12} 12,${height - 12}`}
              fill="url(#eloFill)"
              opacity={0.7}
            />
          </>
        )}
        {/* min/max axis labels */}
        <text x={8} y={12} fontSize={10} fill="currentColor" opacity={0.6}>
          {max}
        </text>
        <text x={8} y={height - 2} fontSize={10} fill="currentColor" opacity={0.6}>
          {min}
        </text>
      </svg>
      <div className="flex justify-between text-xs opacity-70 mt-1">
        <span>start: {first}</span>
        <span>now: {last}</span>
      </div>
    </div>
  );
}

