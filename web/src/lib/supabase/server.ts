import { cookies } from "next/headers";
import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are not configured");
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
        }));
      },
      setAll(cookies) {
        try {
          cookies.forEach(({ name, value, options }) => {
            (cookieStore as unknown as { set?: (opts: { name: string; value: string } & Record<string, unknown>) => void }).set?.({
              name,
              value,
              ...options,
            });
          });
        } catch {
          // ignore cookie set attempts during server component render
        }
      },
    },
  });
}
