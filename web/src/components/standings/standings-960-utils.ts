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

export type CombinedStandingRow = {
  slot: number;
  white_id: number;
  black_id: number;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  bergvizer_score: number | null;
  championship_id: number | null;
};

const WHITE_MIN = 1001;
const WHITE_MAX = 1960;
const BLACK_MIN = 2001;
const BLACK_MAX = 2960;
const SLOT_COUNT = 960;

export function combineStandings960(rows: StandingRow[]): CombinedStandingRow[] {
  const whiteMap = new Map<number, StandingRow>();
  const blackMap = new Map<number, StandingRow>();

  for (const row of rows) {
    if (row.player_id >= WHITE_MIN && row.player_id <= WHITE_MAX) {
      whiteMap.set(row.player_id, row);
    } else if (row.player_id >= BLACK_MIN && row.player_id <= BLACK_MAX) {
      blackMap.set(row.player_id, row);
    }
  }

  const combined: CombinedStandingRow[] = [];
  for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
    const whiteId = WHITE_MIN + slot;
    const blackId = BLACK_MIN + slot;
    const white = whiteMap.get(whiteId);
    const black = blackMap.get(blackId);

    if (!white && !black) continue;

    const bergWhite = white?.bergvizer_score;
    const bergBlack = black?.bergvizer_score;
    const bergvizer =
      bergWhite == null && bergBlack == null ? null : (bergWhite ?? 0) + (bergBlack ?? 0);

    combined.push({
      slot,
      white_id: whiteId,
      black_id: blackId,
      games_played: (white?.games_played ?? 0) + (black?.games_played ?? 0),
      wins: (white?.wins ?? 0) + (black?.wins ?? 0),
      draws: (white?.draws ?? 0) + (black?.draws ?? 0),
      losses: (white?.losses ?? 0) + (black?.losses ?? 0),
      points: (white?.points ?? 0) + (black?.points ?? 0),
      bergvizer_score: bergvizer,
      championship_id: white?.championship_id ?? black?.championship_id ?? null,
    });
  }

  return combined;
}

export function sortCombinedStandings(rows: CombinedStandingRow[]): CombinedStandingRow[] {
  return rows.slice().sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const aB = a.bergvizer_score ?? 0;
    const bB = b.bergvizer_score ?? 0;
    if (bB !== aB) return bB - aB;
    if (b.games_played !== a.games_played) return b.games_played - a.games_played;
    return a.slot - b.slot;
  });
}
