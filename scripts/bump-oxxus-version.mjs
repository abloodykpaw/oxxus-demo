#!/usr/bin/env node
/**
 * Bump OXXUS version: Comercial.OXXUS.Edjouner.Build
 * Usage:
 *   node scripts/bump-oxxus-version.mjs           # write VERSION + TS, print new
 *   node scripts/bump-oxxus-version.mjs --dry-run # print only
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const versionPath = join(root, "VERSION");
const tsPath = join(root, "lib", "oxxus-version.ts");
const dryRun = process.argv.includes("--dry-run");

function git(cmd) {
  try {
    return execSync(cmd, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function parseVersion(raw) {
  const match = String(raw)
    .trim()
    .match(/^([01])\.([01])\.([01])\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid VERSION: ${JSON.stringify(raw)}`);
  }
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

function isEdjouner(name, email) {
  const blob = `${name} ${email}`.toLowerCase();
  return blob.includes("abloodykpaw");
}

function isOxxus(name, email) {
  const blob = `${name} ${email}`.toLowerCase();
  if (blob.includes("abloodykpaw")) return false;
  if (email.toLowerCase() === "oxxuscreative@gmail.com") return true;
  if (blob.includes("oxxusmaquiavelo")) return true;
  if (blob.includes("oxxus")) return true;
  if (name.toLowerCase().includes("cristhyam aranguren")) return true;
  return false;
}

function isBotOrVersionCommit(subject, name, email) {
  if (/^chore\(version\):/i.test(subject)) return true;
  const blob = `${name} ${email}`.toLowerCase();
  if (blob.includes("github-actions") || blob.includes("[bot]")) return true;
  return false;
}

function resolveRangeStart() {
  const envSince = process.env.VERSION_SINCE?.trim();
  if (
    envSince &&
    envSince !== "0000000000000000000000000000000000000000"
  ) {
    return envSince;
  }
  const latestTag = git("git describe --tags --match \"v*\" --abbrev=0");
  if (latestTag) return latestTag;
  const lastVersionCommit = git(
    "git log -1 --format=%H -- VERSION lib/oxxus-version.ts",
  );
  if (lastVersionCommit) return `${lastVersionCommit}^`;
  return "";
}

function collectAuthors() {
  const start = resolveRangeStart();
  const range = start ? `${start}..HEAD` : "HEAD";
  const log = git(
    `git log ${range} --format=%an%x09%ae%x09%s --no-merges`,
  );
  let oxxus = 0;
  let edjouner = 0;
  if (!log) return { oxxus, edjouner };

  for (const line of log.split("\n")) {
    if (!line.trim()) continue;
    const [name = "", email = "", subject = ""] = line.split("\t");
    if (isBotOrVersionCommit(subject, name, email)) continue;
    if (isEdjouner(name, email)) edjouner = 1;
    else if (isOxxus(name, email)) oxxus = 1;
  }
  return { oxxus, edjouner };
}

function syncTsModule(version) {
  let source = readFileSync(tsPath, "utf8");
  const next = source.replace(
    /export const OXXUS_VERSION = "[^"]+";/,
    `export const OXXUS_VERSION = "${version}";`,
  );
  if (next === source) {
    throw new Error("Could not update OXXUS_VERSION in lib/oxxus-version.ts");
  }
  writeFileSync(tsPath, next, "utf8");
}

const current = parseVersion(readFileSync(versionPath, "utf8"));
const flags = collectAuthors();
const next = {
  commercial: current.commercial,
  oxxus: flags.oxxus,
  edjouner: flags.edjouner,
  build: current.build + 1,
};
const nextStr = formatVersion(next);

if (dryRun) {
  console.log(JSON.stringify({ current: formatVersion(current), next: nextStr, flags }, null, 2));
  process.exit(0);
}

writeFileSync(versionPath, `${nextStr}\n`, "utf8");
syncTsModule(nextStr);
console.log(nextStr);
