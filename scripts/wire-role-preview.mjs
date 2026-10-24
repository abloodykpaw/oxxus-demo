import fs from "node:fs";

const path = "app/page.tsx";
let src = fs.readFileSync(path, "utf8");

if (src.includes("isRealAdmin") && src.includes("viewRole") && src.includes("role-preview-select")) {
  console.log("already complete");
  process.exit(0);
}

// --- state ---
if (!src.includes("[previewRole, setPreviewRole]")) {
  const m = src.match(/\[language, setLanguage\] = useState<Language>\("es"\),?/);
  if (!m) {
    console.error("language state missing");
    process.exit(1);
  }
  src = src.replace(
    m[0],
    `${m[0]}\n    [previewRole, setPreviewRole] = useState<string | null>(null),`,
  );
  console.log("state added");
}

// --- derive roles ---
const oldDerive = `isClient = profile?.role === "client",
    needsOnboarding = !!(
      isClient &&
      (onboarding?.needs_onboarding || forceOnboarding)
    );`;

const newDerive = `isRealAdmin = profile?.role === "admin",
    viewRole = (isRealAdmin && previewRole) || profile?.role || "",
    isPreviewing = Boolean(
      isRealAdmin && previewRole && previewRole !== profile?.role,
    ),
    isClient = viewRole === "client",
    isWebCollaborator = viewRole === "web_collaborator",
    needsOnboarding = !!(
      isClient &&
      !isPreviewing &&
      (onboarding?.needs_onboarding || forceOnboarding)
    );`;

if (!src.includes(oldDerive)) {
  console.error("derive block missing");
  process.exit(1);
}
src = src.replace(oldDerive, newDerive);
console.log("derive replaced");

// remove later duplicate
const dup = /\n\s*const isWebCollaborator = profile\?\.role === "web_collaborator";/;
if (dup.test(src)) {
  src = src.replace(dup, "\n");
  console.log("duplicate isWebCollaborator removed");
}

// finalNav admin check
src = src.replace(
  `: profile?.role === "admin"
        ? nav
        : nav.filter((x) => x !== "Enviar invitación");`,
  `: viewRole === "admin"
        ? nav
        : nav.filter((x) => x !== "Enviar invitación");`,
);

// Invite / users gates that use profile?.role === "admin" for rendering UI
// Keep InviteCenter viewer={profile} as real user.
src = src.replaceAll(
  "return profile?.role === \"admin\" ?",
  "return viewRole === \"admin\" ?",
);

// Dashboard secondary invite button
src = src.replaceAll(
  "{profile?.role === \"admin\" && (",
  "{viewRole === \"admin\" && (",
);

// --- banner in content ---
if (!src.includes("role-preview-banner")) {
  const contentOpen = `<div className="content">
          {loading ? (`;
  const banner = `<div className="content">
          {isRealAdmin && isPreviewing && (
            <div className="role-preview-banner" role="status">
              <div>
                <b>{tr("Vista previa de rol", "Role preview")}</b>
                <span>
                  {tr(
                    "Estás viendo la interfaz como",
                    "You are viewing the interface as",
                  )}{" "}
                  <em>
                    {(language === "en" ? roleLabelEnglish : roleLabel)[
                      previewRole || ""
                    ] || previewRole}
                  </em>
                  .{" "}
                  {tr(
                    "Los datos y permisos reales siguen siendo de administrador.",
                    "Real data and permissions remain administrator-level.",
                  )}
                </span>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setPreviewRole(null);
                  setActive("Dashboard");
                }}
              >
                {tr("Salir de vista previa", "Exit preview")}
              </button>
            </div>
          )}
          {loading ? (`;
  if (!src.includes(contentOpen)) {
    console.error("content open missing");
    process.exit(1);
  }
  src = src.replace(contentOpen, banner);
  console.log("banner inserted");
}

// --- selector in top-actions ---
if (!src.includes("role-preview-select")) {
  const top = `<div className="top-actions">
            <LanguageToggle
              language={language}
              onChange={changeLanguage}
            />`;
  const withSelect = `<div className="top-actions">
            {isRealAdmin && (
              <label className="role-preview-select">
                <span>{tr("Ver como", "View as")}</span>
                <select
                  value={previewRole || profile?.role || "admin"}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPreviewRole(next === (profile?.role || "") ? null : next);
                    setActive("Dashboard");
                  }}
                  aria-label={tr(
                    "Ver interfaz como rol",
                    "View interface as role",
                  )}
                >
                  <option value="admin">
                    {tr("Administrador", "Administrator")}
                  </option>
                  <option value="repair_agent">
                    {tr("Agente de reparación", "Credit repair agent")}
                  </option>
                  <option value="client">{tr("Cliente", "Client")}</option>
                  <option value="web_collaborator">
                    {tr("Colaborador web", "Web collaborator")}
                  </option>
                </select>
              </label>
            )}
            <LanguageToggle
              language={language}
              onChange={changeLanguage}
            />`;
  if (!src.includes(top)) {
    console.error("top-actions block missing");
    process.exit(1);
  }
  src = src.replace(top, withSelect);
  console.log("selector inserted");
}

// Sidebar footer role label should reflect viewRole while previewing
src = src.replace(
  `(language === "en" ? roleLabelEnglish : roleLabel)[profile?.role ?? ""] ??
      tr("Usuario autorizado", "Authorized user")`,
  `(language === "en" ? roleLabelEnglish : roleLabel)[viewRole || profile?.role || ""] ??
      tr("Usuario autorizado", "Authorized user")`,
);

fs.writeFileSync(path, src);
console.log("done");
