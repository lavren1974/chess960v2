// Based on the database schema and queries

export type StandingRow = {
  id: number;
  player_id: number;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  bergvizer_score: number;
  championship_id: number;
  color?: 'white' | 'black'; // This might be added client-side
};

export type AgentRow = {
  id: number;
  sp_id: number;
  mini_fen: string;
  color: 'white' | 'black';
};
