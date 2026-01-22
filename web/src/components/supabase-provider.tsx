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
  ready: boolean;
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
  const [ready, setReady] = useState(Boolean(initialSession || initialUser));

  // Keep local state in sync when server-provided values change
  useEffect(() => {
    if (initialSession || initialUser) {
      setSession(initialSession);
      setUser(initialUser);
      setReady(true);
    }
  }, [initialSession, initialUser]);

  useEffect(() => {
    const client = clientRef.current;

    if (!client) {
      return; // client should exist but guard just in case
    }

    let isActive = true;

    const hydrateFromClient = async () => {
      if (initialUser || initialSession) return;
      try {
        const { data: sessionData } = await client.auth.getSession();
        if (!isActive) return;
        const session = sessionData.session ?? null;
        setSession(session);
        if (session?.user) {
          setUser(session.user);
        }
        const { data: userData, error } = await client.auth.getUser();
        if (!isActive) return;
        setUser(error ? session?.user ?? null : userData.user ?? null);
      } catch {
        if (!isActive) return;
      } finally {
        if (isActive) setReady(true);
      }
    };

    hydrateFromClient();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setUser(newSession.user);
      }
      try {
        const { data, error } = await client.auth.getUser();
        setUser(error ? newSession?.user ?? null : data.user ?? null);
      } finally {
        setReady(true);
      }
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [initialSession, initialUser]);

  const value = useMemo(
    () => ({
      client: clientRef.current!,
      session,
      user,
      ready,
    }),
    [session, user, ready],
  );

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
}


