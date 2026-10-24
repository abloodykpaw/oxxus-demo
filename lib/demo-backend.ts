import type { Session, User } from "@supabase/supabase-js";

/**
 * Este repo (`oxxus-demo`) ES la demo de portafolio con Neon.
 * Producción real: G:\oxxus-credit-solutions (Supabase) — no usa este código.
 * Forzado a true para que el cliente no dependa de env en vinext/CF.
 */
export const isNeonDemo = true;

const SESSION_KEY = "oxxus-neon-demo-session";

export type NeonDemoProfile = {
  id: string;
  full_name: string | null;
  role: string;
  client_id?: string | null;
};

type StoredSession = {
  user: { id: string; email: string };
  profile: NeonDemoProfile;
};

function toSession(stored: StoredSession): Session {
  const user = {
    id: stored.user.id,
    email: stored.user.email,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as User;
  return {
    access_token: "neon-demo",
    refresh_token: "neon-demo",
    expires_in: 60 * 60 * 24 * 30,
    token_type: "bearer",
    user,
  } as Session;
}

export function getNeonSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return toSession(JSON.parse(raw) as StoredSession);
  } catch {
    return null;
  }
}

export function getNeonStoredProfile(): NeonDemoProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as StoredSession).profile ?? null;
  } catch {
    return null;
  }
}

export function clearNeonSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

export async function neonSignIn(
  email: string,
  password: string,
): Promise<{ session: Session | null; error: string | null }> {
  const res = await fetch("/api/demo/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    user?: {
      id: string;
      email: string;
      full_name: string;
      role: string;
    };
  };
  if (!data.ok || !data.user) {
    return { session: null, error: data.error ?? "Credenciales incorrectas" };
  }
  const stored: StoredSession = {
    user: { id: data.user.id, email: data.user.email },
    profile: {
      id: data.user.id,
      full_name: data.user.full_name,
      role: data.user.role,
      client_id: null,
    },
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
  return { session: toSession(stored), error: null };
}

export async function neonLoadDashboard(): Promise<{
  cases: unknown[];
  profiles: NeonDemoProfile[];
  error: string | null;
}> {
  const res = await fetch("/api/demo/dashboard");
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    cases?: unknown[];
    profiles?: NeonDemoProfile[];
  };
  if (!data.ok) {
    return {
      cases: [],
      profiles: [],
      error: data.error ?? "No pudimos cargar los casos.",
    };
  }
  return {
    cases: data.cases ?? [],
    profiles: data.profiles ?? [],
    error: null,
  };
}
