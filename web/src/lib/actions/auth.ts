"use server";

import { revalidatePath } from "next/cache";
import { getServerClient } from "../supabase/server";
import { isDisplayNameTakenByAnyUser } from "../services/name-availability";

const MIN_NAME_LENGTH = 6;

interface AuthResult {
  error?: string;
  errors?: string[];
  redirect?: string;
}

export async function login(formData: FormData): Promise<AuthResult> {
  const supabase = await getServerClient();
  const email = (formData.get("email") as string)?.trim();
  const password = (formData.get("password") as string) ?? "";

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const message = error.message.toLowerCase();

    if (message.includes("invalid login")) {
      return { error: "Invalid email or password" };
    }

    if (error.status === 429) {
      return { error: "Too many login attempts. Please try again later." };
    }

    console.error("Login error:", error);
    return { error: error.message || "Login failed" };
  }

  revalidatePath("/", "layout");
  return { redirect: "/dashboard" };
}

export async function register(formData: FormData): Promise<AuthResult> {
  const supabase = await getServerClient();

  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const password = (formData.get("password") as string) ?? "";
  const passwordConfirm = (formData.get("passwordConfirm") as string) ?? "";
  const language = (formData.get("language") as string)?.trim() || "en";

  if (!name || !email) {
    return { errors: ["Registration failed. Please try again."] };
  }

  if (name.length < MIN_NAME_LENGTH) {
    return { errors: ["Minimum name length is 6 characters"] };
  }

  if (password !== passwordConfirm) {
    return { errors: ["Passwords do not match"] };
  }

  const nameTaken = await isDisplayNameTakenByAnyUser(name);
  if (nameTaken) {
    return { errors: ["This name is already taken"] };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        language,
      },
    },
  });

  if (error) {
    console.error("Registration error:", error);

    const message = error.message.toLowerCase();

    if (message.includes("already registered")) {
      return { errors: ["This email is already registered"] };
    }

    if (message.includes("password should be")) {
      return { errors: ["Password must be at least 8 characters long"] };
    }

    return { errors: [error.message || "Registration failed. Please try again."] };
  }

  let user = data.user;
  let session = data.session;

  if (!session) {
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      const signInMessage = signInError.message.toLowerCase();

      if (signInMessage.includes("email not confirmed")) {
        return { redirect: "/login?notice=email_confirmation_required" };
      }

      console.error("Post-registration sign-in failed:", signInError);
      return { errors: [signInError.message || "Registration failed. Please try again."] };
    }

    session = signInData.session;
    user = signInData.user ?? user;
  }

  if (!session) {
    return { errors: ["Registration failed. Please try again."] };
  }

  if (user) {
    try {
      await supabase.from("profiles").upsert({
        id: user.id,
        name,
        language,
      });
    } catch (profileError) {
      console.warn("Failed to upsert profile record:", profileError);
    }
  }

  revalidatePath("/", "layout");
  return { redirect: "/dashboard" };
}

export async function logout(): Promise<AuthResult> {
  const supabase = await getServerClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Logout error:", error);
    return { error: "Failed to log out" };
  }

  revalidatePath("/", "layout");
  return { redirect: "/login" };
}

