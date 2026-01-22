import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function parsePositiveInt(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const viewRaw = (url.searchParams.get("view") || "white").toLowerCase();
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const perPage = parsePositiveInt(url.searchParams.get("perPage"), 60);
    // Optional mask filter: comma-separated index:Piece entries, e.g. "0:R,4:K"
    // Index corresponds to file 0..7 from a-file to h-file.
    const maskRaw = url.searchParams.get("mask") || "";
    const mask: Array<{ idx: number; piece: string }> = [];
    if (maskRaw) {
      for (const part of maskRaw.split(",")) {
        const [iStr, pRaw] = part.split(":");
        const idx = Number(iStr);
        const p = (pRaw || "").trim().toUpperCase();
        if (Number.isFinite(idx) && idx >= 0 && idx <= 7 && /^[KQRBNR]$/.test(p)) {
          mask.push({ idx, piece: p });
        }
      }
    }

    const view = viewRaw === "black" ? "black" : "white";
    const color = view === "white" ? "w" : "b";

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const supabase = getServiceRoleClient();

    // If a mask is provided, we fetch a superset (all rows for color) and filter server-side,
    // then page the results. The agents table is small (<= 960 per color), so this is acceptable.
    if (mask.length > 0) {
      const { data, error } = await supabase
        .from("sf_agents")
        .select("id, sp_id, mini_fen, color")
        .eq("color", color)
        .order("color", { ascending: true })
        .order("sp_id", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const allRows = Array.isArray(data) ? data : [];
      const filtered = allRows.filter((r: any) => {
        const mf: string = (r.mini_fen || "").toUpperCase();
        if (mf.length !== 8) return false;
        for (const { idx, piece } of mask) {
          if (mf[idx] !== piece) return false;
        }
        return true;
      });
      const total = filtered.length;
      const pageRows = filtered.slice(from, to + 1);
      return NextResponse.json({ rows: pageRows, total });
    }

    // No mask -> regular paged fetch
    const { data, error } = await supabase
      .from("sf_agents")
      .select("id, sp_id, mini_fen, color")
      .eq("color", color)
      .order("color", { ascending: true })
      .order("sp_id", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = Array.isArray(data) ? data : [];
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

