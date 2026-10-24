#!/usr/bin/env node
/**
 * Set commercial bit (C) on OXXUS version. Does not change O/E by default.
 * Usage:
 *   node scripts/set-commercial-flag.mjs 1
 *   node scripts/set-commercial-flag.mjs 0
 *   node scripts/set-commercial-flag.mjs 1 --bump   # also increment build N
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const versionPath = join(root, "VERSION");
const tsPath = join(root, "lib", "oxxus-version.ts");

const flagArg = process.argv[2];
const bump = process.argv.includes("--bump");

if (flagArg !== "0" && flagArg !== "1") {
  console.error("Usage: node scripts/set-commercial-flag.mjs <0|1> [--bump]");
  process.exit(1);
}

function parseVersion(raw) {
  const match = String(raw)
    .trim()
    .match(/^([01])\.([01])\.([01])\.(\d+)$/);
  if (!match) throw new Error(`Invalid VERSION: ${JSON.stringify(raw)}`);
  return {
    commercial: Number(match[1]),
    oxxus: Number(match[2]),
    edjouner: Number(match[3]),
    build: Number(match[4]),
  };
}

function formatVersion(parts) {
  return `${parts.commercial}.${parts.oxxus}.${parts.edjouner}.${parts.build}`;
}

const current = parseVersion(readFileSync(versionPath, "utf8"));
const next = {
  ...current,
  commercial: Number(flagArg),
  build: bump ? current.build + 1 : current.build,
};
const nextStr = formatVersion(next);

writeFileSync(versionPath, `${nextStr}\n`, "utf8");

let source = readFileSync(tsPath, "utf8");
const updated = source.replace(
  /export const OXXUS_VERSION = "[^"]+";/,
  `export const OXXUS_VERSION = "${nextStr}";`,
);
if (updated === source) {
  throw new Error("Could not update OXXUS_VERSION in lib/oxxus-version.ts");
}
writeFileSync(tsPath, updated, "utf8");
console.log(nextStr);
