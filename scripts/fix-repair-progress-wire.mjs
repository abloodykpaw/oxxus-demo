import fs from "node:fs";

const pagePath = "app/page.tsx";
let page = fs.readFileSync(pagePath, "utf8");

const badBlock = `{isClient && cases[0] && (
                <RepairProgressBar
                  caseRecord={{
                    level: cases[0].level,
                    current_week: cases[0].current_week,
                    duration_weeks: cases[0].duration_weeks,
                    next_action: cases[0].next_action,
                    has_report:
                      cases[0].has_report ||
                      (cases[0].credit_reports?.length ?? 0) > 0,
                    reportCount: cases[0].credit_reports?.length ?? 0,
                    status: cases[0].status,
                  }}
                  language={language}
                />
              )}
              `;

if (page.includes(badBlock)) {
  page = page.replace(badBlock, "");
  console.log("removed misplaced block");
} else {
  console.log("misplaced block not found exactly; trying regex");
  page = page.replace(
    /\s*\{isClient && cases\[0\] && \(\s*<RepairProgressBar[\s\S]*?\/>\s*\)\}\s*/m,
    "\n",
  );
}

const goodBlock = `{isClient && cases[0] && (
                <RepairProgressBar
                  caseRecord={{
                    level: cases[0].level,
                    current_week: cases[0].current_week,
                    duration_weeks: cases[0].duration_weeks,
                    next_action: cases[0].next_action,
                    has_report:
                      cases[0].has_report ||
                      (cases[0].credit_reports?.length ?? 0) > 0,
                    reportCount: cases[0].credit_reports?.length ?? 0,
                    status: cases[0].status,
                  }}
                  language={language}
                />
              )}
              `;

if (!page.includes("<RepairProgressBar")) {
  // Insert before the MAIN dashboard trust-rail (the one after "Ver mi expediente")
  const anchor = 'tr("Ver mi expediente", "View my case file")';
  const anchorIdx = page.indexOf(anchor);
  if (anchorIdx < 0) {
    console.error("client CTA anchor missing");
    process.exit(1);
  }
  const trustIdx = page.indexOf('<section className="trust-rail">', anchorIdx);
  if (trustIdx < 0) {
    console.error("client trust-rail missing");
    process.exit(1);
  }
  page = page.slice(0, trustIdx) + goodBlock + page.slice(trustIdx);
  console.log("inserted into client dashboard");
} else {
  console.log("RepairProgressBar already present after cleanup?");
}

fs.writeFileSync(pagePath, page);

// sanity: must not appear inside WebCollaboratorDashboard
const collabIdx = page.indexOf("function WebCollaboratorDashboard");
const nextFn = page.indexOf("\nfunction ", collabIdx + 10);
const collabSlice = page.slice(collabIdx, nextFn > 0 ? nextFn : collabIdx + 800);
if (collabSlice.includes("RepairProgressBar")) {
  console.error("STILL inside WebCollaboratorDashboard");
  process.exit(1);
}
console.log("ok");
