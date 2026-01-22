"use client";

import type { AgentRow } from "@/components/agents/agent-utils";
import { FavoriteToggle } from "./favorite-toggle";

export function AgentLabel({ agent, onFavoriteChange, isFavorited }: { agent: AgentRow; onFavoriteChange?: (agentId: number, isFav: boolean) => void; isFavorited?: boolean }) {
  const fenName = agent.color === "w" ? agent.mini_fen.toUpperCase() : agent.mini_fen.toLowerCase();
  const imgSrc = `/img/${agent.color}/${fenName}.png`;
  const spId = Number(agent.sp_id);
  const spLabel =
    Number.isFinite(spId) && spId >= 0 && spId <= 9
      ? `00${spId}`
      : Number.isFinite(spId) && spId >= 10 && spId <= 99
        ? `0${spId}`
        : String(agent.sp_id);

  // Use a unified brown-ish badge background for all players for readability
  const wrapperClass = "badge badge-md bg-emerald-700 text-emerald-50";

  return (
    <span className={`inline-flex items-center gap-2 align-middle whitespace-nowrap shrink-0 ${wrapperClass}`}>
      <FavoriteToggle agentId={agent.id} initialFavorited={isFavorited} onChange={(isFav) => onFavoriteChange?.(agent.id, isFav)} />
      <img
        src={imgSrc}
        alt={`FEN ${agent.mini_fen} (${agent.color})`
        }
        className="h-5 w-auto shrink-0"
        loading="lazy"
      />
      <span className="font-mono">{agent.color}-{spLabel}</span>
    </span>
  );
}
