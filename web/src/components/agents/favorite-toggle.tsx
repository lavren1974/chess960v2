"use client";

import { useEffect, useState, useTransition } from "react";
import { Star } from "lucide-react";
import { useSupabase, useUser } from "@/components/supabase-provider";
import { addFavorite, removeFavorite } from "@/lib/actions/favorites";

export function FavoriteToggle({ agentId, onChange, initialFavorited }: { agentId: number; onChange?: (isFav: boolean) => void; initialFavorited?: boolean }) {
  const { client, session } = useSupabase();
  const user = useUser();
  const [fav, setFav] = useState<boolean>(initialFavorited ?? false);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!user) return;
      if (typeof initialFavorited === "boolean") return; // trust provided initial state
      const { count } = await client
        .from("sf_agent_favorites")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("agent_id", agentId);
      if (alive) setFav((count ?? 0) > 0);
    }
    load();
    return () => {
      alive = false;
    };
  }, [agentId, client, user, initialFavorited, session]);

  if (!user) return null; // hide for guests

  return (
    <button
      type="button"
      className={`${fav ? "bg-warning/20 hover:bg-warning/30 text-warning" : "btn-ghost"} btn btn-square btn-xs p-0 h-6 w-6 min-h-0 border-none mr-1`}
      disabled={pending}
      onPointerDown={(e) => {
        // Prevent parent <a> or other handlers from triggering navigation
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start(async () => {
          if (!fav) {
            const res = await addFavorite(agentId);
            if (res.ok) {
              setFav(true);
              onChange?.(true);
            }
          } else {
            const res = await removeFavorite(agentId);
            if (res.ok) {
              setFav(false);
              onChange?.(false);
            }
          }
        });
      }}
      title={fav ? "Selected (click to remove)" : "Add to favorites"}
      aria-label={fav ? "Selected (click to remove)" : "Add to favorites"}
      aria-pressed={fav}
    >
      <Star className="h-4 w-4" fill={fav ? "currentColor" : "none"} />
    </button>
  );
}
