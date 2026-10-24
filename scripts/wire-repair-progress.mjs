import fs from "node:fs";

const pagePath = "app/page.tsx";
const portalPath = "app/ClientCreditReportPortal.tsx";

let page = fs.readFileSync(pagePath, "utf8");
if (!page.includes('import RepairProgressBar from "./RepairProgressBar"')) {
  if (!page.includes('import ClientCreditReportPortal from "./ClientCreditReportPortal";')) {
    console.error("page import for ClientCreditReportPortal missing");
    process.exit(1);
  }
  page = page.replace(
    'import ClientCreditReportPortal from "./ClientCreditReportPortal";',
    'import ClientCreditReportPortal from "./ClientCreditReportPortal";\nimport RepairProgressBar from "./RepairProgressBar";',
  );
}

if (!page.includes("<RepairProgressBar")) {
  const welcomeIdx = page.indexOf('<section className="welcome">');
  if (welcomeIdx < 0) {
    console.error("welcome section missing");
    process.exit(1);
  }
  const trustIdx = page.indexOf('<section className="trust-rail">', welcomeIdx);
  if (trustIdx < 0) {
    console.error("trust-rail after welcome missing");
    process.exit(1);
  }
  const insert = `{isClient && cases[0] && (
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
  page = page.slice(0, trustIdx) + insert + page.slice(trustIdx);
}

fs.writeFileSync(pagePath, page);
console.log("page patched");

let portal = fs.readFileSync(portalPath, "utf8");
if (!portal.includes('import RepairProgressBar from "./RepairProgressBar"')) {
  if (!portal.includes('import ClientScoreUpdates from "./ClientScoreUpdates";')) {
    console.error("portal import for ClientScoreUpdates missing");
    process.exit(1);
  }
  portal = portal.replace(
    'import ClientScoreUpdates from "./ClientScoreUpdates";',
    'import ClientScoreUpdates from "./ClientScoreUpdates";\nimport RepairProgressBar from "./RepairProgressBar";',
  );
}

const start = portal.indexOf('<article><h3>Ruta de trabajo</h3><div className="plan-timeline">');
if (start < 0) {
  if (portal.includes("<RepairProgressBar")) {
    console.log("portal already wired");
  } else {
    console.error("portal timeline start missing");
    process.exit(1);
  }
} else {
  const endToken = "</div></article>";
  const end = portal.indexOf(endToken, start);
  if (end < 0) {
    console.error("portal timeline end missing");
    process.exit(1);
  }
  const replacement =
    '<article><h3>Ruta de trabajo</h3><RepairProgressBar compact caseRecord={{ level: caseRecord.level, current_week: caseRecord.current_week, duration_weeks: caseRecord.duration_weeks, next_action: caseRecord.next_action, has_report: (caseRecord.credit_reports?.length ?? 0) > 0, reportCount: caseRecord.credit_reports?.length ?? 0 }} /></article>';
  portal = portal.slice(0, start) + replacement + portal.slice(end + endToken.length);
  console.log("portal timeline replaced");
}

fs.writeFileSync(portalPath, portal);
console.log("portal patched");
