export type AgentRow = {
  id: number;
  sp_id: number;
  mini_fen: string;
  color: "w" | "b";
};

const WHITE_PIECES: Record<string, string> = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
};
const BLACK_PIECES: Record<string, string> = {
  K: "♚",
  Q: "♛",
  R: "♜",
  B: "♝",
  N: "♞",
};

export function miniFenToUnicode(miniFen: string, color: "w" | "b"): string {
  const map = color === "w" ? WHITE_PIECES : BLACK_PIECES;
  return miniFen
    .split("")
    .map((ch) => map[ch.toUpperCase()] ?? ch)
    .join("");
}

export function formatAgentLabel(agent: AgentRow, useIcons = true): string {
  const fen = useIcons ? miniFenToUnicode(agent.mini_fen, agent.color) : agent.mini_fen;
  return `${fen}-${agent.color}-${agent.sp_id}`;
}

// Build a full starting FEN from a Chess960 mini_fen (back rank layout).
// Example: mini_fen = "RNBQKBNR" -> standard chess start.
export function miniFenToStartFen(miniFen: string): string {
  const wBack = (miniFen || "").toUpperCase();
  const bBack = (miniFen || "").toLowerCase();
  // Basic 960 starting FEN with pawns filled and initial rights.
  return `${bBack}/pppppppp/8/8/8/8/PPPPPPPP/${wBack} w KQkq - 0 1`;
}
