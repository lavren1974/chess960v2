"use client";

import type { AgentRow } from "@/components/agents/agent-utils";

export function AgentLabel({ agent }: { agent: AgentRow }) {
  const fenName = agent.color === "w" ? agent.mini_fen.toUpperCase() : agent.mini_fen.toLowerCase();
  const imgSrc = `/img/${agent.color}/${fenName}.png`;

  // Use a unified brown-ish badge background for all players for readability
  const wrapperClass = "badge badge-md bg-emerald-700 text-emerald-50";

  return (
    <span className={`inline-flex items-center gap-2 align-middle whitespace-nowrap shrink-0 ${wrapperClass}`}>
      <img
        src={imgSrc}
        alt={`FEN ${agent.mini_fen} (${agent.color})`}
        className="h-5 w-auto shrink-0"
        loading="lazy"
      />
      <span className="font-mono">{agent.color}-{agent.sp_id}</span>
    </span>
  );
}
