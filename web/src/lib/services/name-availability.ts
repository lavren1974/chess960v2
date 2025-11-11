import { getServiceRoleClient } from "@/lib/supabase/service";
import type { PostgrestError, SupabaseClient, User } from "@supabase/supabase-js";

export type NameAvailabilityResult = {
  available: boolean | null;
  reason?: string;
};

const USERS_PER_PAGE = 100;
const MAX_AUTH_PAGES = 10;

function isTableMissingError(error: PostgrestError | null): boolean {
  if (!error) {
    return false;
  }

  // Common PostgREST and Postgres signals for missing relation/table
  const code = (error.code ?? "").toUpperCase();
  if (code === "PGRST205" || code === "42P01") {
    return true;
  }

  const msg = (error.message ?? "").toLowerCase();
  // Match typical phrases: "relation ... does not exist", "table ... does not exist",
  // "not found", etc. Be lenient to avoid classifying as a hard failure.
  return (
    msg.includes("does not exist") ||
    (msg.includes("relation") && msg.includes("does not exist")) ||
    (msg.includes("table") && msg.includes("does not exist")) ||
    msg.includes("not found")
  );
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function hasMatchingUserByName(users: User[], normalizedName: string): boolean {
  const candidateKeys = ["name", "display_name", "displayName", "full_name", "fullName", "username"] as const;

  return users.some((user) => {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

    for (const key of candidateKeys) {
      const raw = typeof meta[key] === "string" ? (meta[key] as string) : "";
      if (raw.trim().toLowerCase() === normalizedName) {
        return true;
      }
    }

    return false;
  });
}

async function lookupNameInProfiles(client: SupabaseClient, name: string) {
  // Prefer the canonical column from the new schema first
  const candidates = [
    "display_name",
    "name",
    "displayName",
    "username",
    "full_name",
    "fullName",
  ];

  // Try multiple likely columns; tolerate missing columns gracefully.
  for (const column of candidates) {
    const { data, error } = await client
      .from("profiles")
      .select("id")
      .ilike(column, name)
      .limit(1);

    if (!error) {
      const taken = Boolean(data && data.length > 0);
      if (taken) {
        return { status: "ok" as const, taken: true };
      }
      // Not found in this column; try the next candidate.
      continue;
    }

    if (isTableMissingError(error)) {
      return { status: "missing" as const };
    }

    // Column does not exist: 42703. Try the next candidate.
    if ((error.code ?? "").toUpperCase() === "42703") {
      continue;
    }

    console.warn(`Display name lookup failed against profiles.${column}:`, error);
    return { status: "error" as const, reason: "query_failed" as const };
  }

  // Exhausted candidates without matches or fatal errors.
  return { status: "ok" as const, taken: false };
}

async function lookupNameInAuthUsers(client: SupabaseClient, name: string) {
  const normalized = normalizeName(name);

  try {
    for (let page = 1; page <= MAX_AUTH_PAGES; page += 1) {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });

      if (error) {
        console.warn("Display name lookup failed against auth users:", error);
        return null;
      }

      const users = data?.users ?? [];

      if (hasMatchingUserByName(users, normalized)) {
        return true;
      }

      if (users.length < USERS_PER_PAGE) {
        return false;
      }
    }

    return false;
  } catch (error) {
    console.warn("Display name auth lookup threw:", error);
    return null;
  }
}

export async function evaluateDisplayNameAvailability(name: string): Promise<NameAvailabilityResult> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { available: null, reason: "service_key_missing" };
  }

  const trimmed = name.trim();

  if (!trimmed) {
    return { available: false, reason: "invalid_name" };
  }

  const supabase = getServiceRoleClient();

  try {
    const profileResult = await lookupNameInProfiles(supabase, trimmed);

    if (profileResult.status === "error") {
      return { available: null, reason: profileResult.reason };
    }

    if (profileResult.status === "ok" && profileResult.taken) {
      return { available: false, reason: "profiles_match" };
    }

    const authMatch = await lookupNameInAuthUsers(supabase, trimmed);

    if (authMatch === true) {
      return { available: false, reason: "auth_match" };
    }

    if (authMatch === null) {
      return { available: null, reason: "auth_lookup_failed" };
    }

    if (profileResult.status === "missing") {
      return { available: true, reason: "table_missing" };
    }

    return { available: true };
  } catch (error) {
    console.error("Unexpected display name availability failure:", error);
    return { available: null, reason: "unexpected" };
  }
}

export async function isDisplayNameTakenByAnyUser(name: string): Promise<boolean> {
  const result = await evaluateDisplayNameAvailability(name);
  return result.available === false;
}
