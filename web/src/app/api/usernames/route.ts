import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    ids = ids.filter((v): v is string => typeof v === "string" && v.length > 0);
    ids = Array.from(new Set(ids));
    if (ids.length === 0) return NextResponse.json({ users: {} });

    const MAX = 200;
    if (ids.length > MAX) ids = ids.slice(0, MAX);

    const svc = getServiceRoleClient();
    const result: Record<string, string> = {};

    // 1) sf_profiles table if present
    try {
      const { data: profs } = await svc.from("sf_profiles").select("id, name").in("id", ids);
      if (Array.isArray(profs)) {
        for (const p of profs as any[]) {
          const id = String(p.id);
          const name = (p.name as string) || "";
          if (name) result[id] = name;
        }
      }
    } catch {
      // sf_profiles may not exist; ignore
    }

    // 2) Fallback to auth.users metadata name when missing
    const remaining = ids.filter((id) => !result[id]);
    if (remaining.length > 0) {
      try {
        const { data: rows } = await (svc as any)
          .schema("auth")
          .from("users")
          .select("id, raw_user_meta_data")
          .in("id", remaining);
        if (Array.isArray(rows)) {
          for (const r of rows as any[]) {
            const id = String(r.id);
            const nm = (r?.raw_user_meta_data?.name as string | undefined) || "";
            if (nm) result[id] = nm;
          }
        }
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ users: result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "bad_request" }, { status: 400 });
  }
}
