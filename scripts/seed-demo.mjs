/**
 * Crea el admin de la demo pública. Requiere .env.local de un proyecto Supabase NUEVO.
 * Uso: node scripts/seed-demo.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const email = process.env.DEMO_ADMIN_EMAIL ?? "admin@demo.oxxus.local";
const password = process.env.DEMO_ADMIN_PASSWORD ?? "Demo2026!Oxxus";
const name = process.env.DEMO_ADMIN_NAME ?? "Admin Demo";

const result = spawnSync(
  process.execPath,
  [resolve(here, "create-admin.mjs"), email, password, name],
  { cwd: root, stdio: "inherit", env: process.env },
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log("\nDemo admin listo:");
console.log(`  ${email} / ${password}`);
console.log("Añade clientes de prueba a mano desde la UI (nombres ficticios).");
