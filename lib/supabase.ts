import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
export const supabase = createClient(supabaseUrl || "https://example.supabase.co", supabaseKey || "not-configured", {
  auth: { persistSession: true, autoRefreshToken: true },
});
