"use server";

import { revalidatePath } from "next/cache";
import { getServerClient } from "../supabase/server";
import { getServiceRoleClient } from "../supabase/service";

interface AccountResult {
  error?: string;
  errors?: string[];
  success?: boolean;
  redirect?: string;
  warning?: string;
}

export async function updateProfile(formData: FormData): Promise<AccountResult> {
  const supabase = await getServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated" };
  }

  const name = (formData.get("name") as string)?.trim();
  const password = (formData.get("password") as string)?.trim();
  const passwordConfirm = (formData.get("passwordConfirm") as string)?.trim();
  const currentPassword = (formData.get("currentPassword") as string)?.trim();

  const updates: {
    password?: string;
    data?: Record<string, string>;
  } = {};

  const metadataUpdates: Record<string, string> = {};

  if (name && name !== (user.user_metadata?.name as string | undefined)) {
    metadataUpdates.name = name;
  }

  const language = (formData.get("language") as string)?.trim();
  if (language && language !== (user.user_metadata?.language as string | undefined)) {
    metadataUpdates.language = language;
  }

  const wantsPasswordChange = Boolean(password);

  if (wantsPasswordChange) {
    if (!passwordConfirm) {
      return { error: "Password confirmation is required" };
    }

    if (password !== passwordConfirm) {
      return { error: "Passwords do not match" };
    }

    if (!currentPassword) {
      return { error: "Current password is required to change password" };
    }

    // Re-authenticate to verify the current password before updating
    const email = user.email;
    if (!email) {
      return { error: "Unable to verify current user email" };
    }

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (reauthError) {
      return { error: "Current password is incorrect" };
    }

    updates.password = password;
  }

  if (Object.keys(metadataUpdates).length > 0) {
    updates.data = metadataUpdates;
  }

  if (!updates.password && !updates.data) {
    return { error: "No changes detected" };
  }

  const { error: updateError } = await supabase.auth.updateUser(updates);

  if (updateError) {
    console.error("Update profile error:", updateError);
    return { error: updateError.message || "Failed to update profile" };
  }

  // Sync profile table if available
  if (user.id && (metadataUpdates.name || metadataUpdates.language)) {
    try {
      await supabase.from("profiles").upsert({
        id: user.id,
        name: metadataUpdates.name ?? (user.user_metadata?.name as string | undefined) ?? null,
        language:
          metadataUpdates.language ?? (user.user_metadata?.language as string | undefined) ?? null,
      });
    } catch (error) {
      console.warn("Failed to sync profile data:", error);
    }
  }

  revalidatePath("/dashboard");

  return {
    success: true,
    warning: wantsPasswordChange
      ? "Password changed successfully. Please log in again if prompted."
      : undefined,
  };
}

export async function deleteAccount(): Promise<AccountResult> {
  const supabase = await getServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated" };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return {
      error: "Account deletion is not configured. Please contact support.",
    };
  }

  try {
    const serviceClient = getServiceRoleClient();

    const { error: profileError } = await serviceClient
      .from("profiles")
      .delete()
      .eq("id", user.id);

    if (profileError) {
      console.warn("Failed to remove profile record:", profileError);
    }

    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error("Delete account error:", deleteError);
      return { error: deleteError.message || "Failed to delete account" };
    }

    await supabase.auth.signOut();

    return { redirect: "/login" };
  } catch (error) {
    console.error("Delete account error:", error);
    return { error: "Failed to delete account" };
  }
}

