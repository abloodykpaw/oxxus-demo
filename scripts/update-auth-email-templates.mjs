import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRef = process.env.SUPABASE_PROJECT_REF ?? "pyicqwrtazdjzdezgdcn";
const token =
  process.env.SUPABASE_ACCESS_TOKEN ??
  loadEnvFile(resolve(root, ".env.local")).SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const allowlist = JSON.parse(
  readFileSync(
    resolve(root, "supabase/functions/_shared/redirect-allowlist.json"),
    "utf8",
  ),
);

const inviteModule = await import("../supabase/email-templates/invite.ts");
const payload = {
  uri_allow_list: (allowlist.uriAllowList || []).join(","),
  site_url: String(allowlist.defaultSiteUrl || "").replace(/\/$/, ""),
  mailer_subjects_invite: inviteModule.inviteEmailSubject,
  mailer_subjects_recovery: inviteModule.recoveryEmailSubject,
  mailer_templates_invite_content: inviteModule.inviteEmailHtml,
  mailer_templates_recovery_content: inviteModule.recoveryEmailHtml,
};

const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  },
);

if (!response.ok) {
  console.error("Failed to update auth config:", await response.text());
  process.exit(1);
}

console.log(
  "Updated invite/recovery templates and redirect allow list from shared config.",
);
console.log("site_url:", payload.site_url);
console.log("uri_allow_list:", payload.uri_allow_list);

function loadEnvFile(path) {
  const entries = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index === -1) continue;
      entries[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
  } catch {
    // optional env file
  }
  return entries;
}
