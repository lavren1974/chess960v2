"use client";

import { getBrowserClient } from "@/lib/supabase/browser";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface SupabaseContextValue {
  client: SupabaseClient;
  session: Session | null;
  user: User | null;
}

const SupabaseContext = createContext<SupabaseContextValue | null>(null);

export function useSupabase() {
  const context = useContext(SupabaseContext);
  if (!context) {
    throw new Error("useSupabase must be used within a SupabaseProvider");
  }
  return context;
}

export function useUser() {
  return useSupabase().user;
}

export function SupabaseProvider({
  initialSession,
  initialUser,
  children,
}: {
  initialSession: Session | null;
  initialUser: User | null;
  children?: React.ReactNode;
}) {
  const clientRef = useRef<SupabaseClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = getBrowserClient();
  }

  const [session, setSession] = useState<Session | null>(initialSession);
  const [user, setUser] = useState<User | null>(initialUser);

  // Keep local state in sync when server-provided values change
  useEffect(() => {
    setSession(initialSession);
    setUser(initialUser);
  }, [initialSession, initialUser]);

  useEffect(() => {
    const client = clientRef.current;

    if (!client) {
      return; // client should exist but guard just in case
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      client: clientRef.current!,
      session,
      user,
    }),
    [session, user],
  );

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
}


