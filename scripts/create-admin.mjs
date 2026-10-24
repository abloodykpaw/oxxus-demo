import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  const entries = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    entries[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return entries;
}

const envPath = resolve(process.cwd(), ".env.local");
const env = loadEnvFile(envPath);
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey =
  env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey =
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const email = process.argv[2] ?? "admin.dev@oxxus-credit.local";
const password = process.argv[3] ?? "OxxusDev2026!Admin";
const fullName = process.argv[4] ?? "Admin Desarrollo";

if (!url) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local");
  process.exit(1);
}

if (!serviceKey) {
  console.error(
    "Missing SUPABASE_SERVICE_ROLE_KEY in .env.local.\n" +
      "Add it from Supabase Dashboard -> Project Settings -> API -> service_role / secret key.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: existingUsers, error: listError } =
  await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

if (listError) {
  console.error("Could not list users:", listError.message);
  process.exit(1);
}

let userId = existingUsers.users.find(
  (user) => user.email?.toLowerCase() === email.toLowerCase(),
)?.id;

if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { role: "admin" },
  });

  if (error || !data.user) {
    console.error("Could not create user:", error?.message ?? "Unknown error");
    process.exit(1);
  }

  userId = data.user.id;
  console.log("Created auth user:", userId);
} else {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { role: "admin" },
  });

  if (error) {
    console.error("Could not update existing user:", error.message);
    process.exit(1);
  }

  console.log("Updated existing auth user:", userId);
}

const { error: profileError } = await admin
  .from("profiles")
  .upsert(
    {
      id: userId,
      full_name: fullName,
      role: "admin",
      client_id: null,
    },
    { onConflict: "id" },
  );

if (profileError) {
  console.error("Could not set admin profile:", profileError.message);
  process.exit(1);
}

console.log("\nAdmin access ready:");
console.log("  Email:   ", email);
console.log("  Password:", password);
console.log("  Role:     admin");
console.log("\nSign in at http://localhost:3000/");

