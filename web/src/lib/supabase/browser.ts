import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

export function getBrowserClient() {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      throw new Error("Supabase environment variables are not configured");
    }

    // The realtime URL is automatically inferred from the main Supabase URL.
    // We previously had an incorrect `realtime: { url: ... }` option here which was causing build failures.
    browserClient = createBrowserClient(url, anonKey);
  }

  return browserClient;
}
