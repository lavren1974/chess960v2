"use server";

import { getServerClient } from "../supabase/server";

export async function addFavorite(agentId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await getServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("sf_agent_favorites")
    .insert({ user_id: user.id, agent_id: agentId })
    .select("id")
    .maybeSingle();

  if (error && error.code !== "23505") {
    // 23505 unique_violation; ignore duplicates
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeFavorite(agentId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await getServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("sf_agent_favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("agent_id", agentId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getFavoriteAgents(): Promise<{ ok: true; agents: Array<{ id: number; sp_id: number; mini_fen: string; color: "w" | "b" }> } | { ok: false; error: string }> {
  const supabase = await getServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: favs, error: favErr } = await supabase
    .from("sf_agent_favorites")
    .select("agent_id")
    .eq("user_id", user.id);

  if (favErr) return { ok: false, error: favErr.message };

  const ids = (favs || []).map((r) => r.agent_id);
  if (!ids.length) return { ok: true, agents: [] };

  const { data: agents, error: aErr } = await supabase
    .from("sf_agents")
    .select("id, sp_id, mini_fen, color")
    .in("id", ids);

  if (aErr) return { ok: false, error: aErr.message };
  return { ok: true, agents: (agents as any) ?? [] };
}


