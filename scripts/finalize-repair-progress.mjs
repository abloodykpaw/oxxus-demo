import fs from "node:fs";

const bar = `"use client";

import { getRepairProgress, type RepairProgressInput } from "./repairProgress";

type Language = "es" | "en";

type Props = {
  caseRecord: RepairProgressInput;
  language?: Language;
  compact?: boolean;
  className?: string;
};

export default function RepairProgressBar({
  caseRecord,
  language = "es",
  compact = false,
  className = "",
}: Props) {
  const progress = getRepairProgress(caseRecord);
  const tr = (es: string, en: string) => (language === "es" ? es : en);

  return (
    <section
      className={\`repair-progress \${compact ? "compact" : ""} \${className}\`.trim()}
      aria-labelledby="repair-progress-title"
    >
      <header className="repair-progress-head">
        <div>
          <p className="eyebrow">
            {tr("AVANCE DE TU REPARACION", "YOUR REPAIR PROGRESS")}
          </p>
          <h3 id="repair-progress-title">
            {tr(
              \`Fase actual: \${progress.phaseLabelEs}\`,
              \`Current phase: \${progress.phaseLabelEn}\`,
            )}
          </h3>
          <p>
            {tr(progress.weekLabelEs, progress.weekLabelEn)}
            {" \\u00b7 "}
            {tr("Proximo paso:", "Next step:")}{" "}
            <strong>
              {tr(progress.nextActionEs, progress.nextActionEn)}
            </strong>
          </p>
        </div>
        <div
          className="repair-progress-pct"
          aria-label={tr(
            \`\${progress.percent} por ciento completado\`,
            \`\${progress.percent} percent complete\`,
          )}
        >
          <strong>{progress.percent}%</strong>
          <small>{tr("completado", "complete")}</small>
        </div>
      </header>

      <div
        className="repair-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
      >
        <i style={{ width: \`\${progress.percent}%\` }} />
      </div>

      <ol className="repair-progress-steps">
        {progress.phases.map((phase) => (
          <li key={phase.id} className={phase.status}>
            <span className="step-dot" aria-hidden="true">
              {phase.status === "done" ? "\\u2713" : ""}
            </span>
            <span className="step-copy">
              <b>{tr(phase.labelEs, phase.labelEn)}</b>
              {!compact && <small>{tr(phase.hintEs, phase.hintEn)}</small>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
`;

fs.writeFileSync("app/RepairProgressBar.tsx", bar.replace(/\\u00b7/g, "\u00b7").replace(/\\u2713/g, "\u2713"));

let page = fs.readFileSync("app/page.tsx", "utf8");
page = page.replace(/reportCount:/g, "reportCount:");
page = page.replace(/has_report:/g, "has_report:");
fs.writeFileSync("app/page.tsx", page);

let portal = fs.readFileSync("app/ClientCreditReportPortal.tsx", "utf8");
portal = portal.replace(/reportCount:/g, "reportCount:");
portal = portal.replace(/has_report:/g, "has_report:");
fs.writeFileSync("app/ClientCreditReportPortal.tsx", portal);

let css = fs.readFileSync("app/globals.css", "utf8");
if (!css.includes(".repair-progress-head")) {
  css = css.replaceAll(".repair-progress-head", ".repair-progress-head");
}
// Ensure head selector exists (component uses repair-progress-head)
if (!css.includes(".repair-progress-head {")) {
  css += `
.repair-progress-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
`;
}
fs.writeFileSync("app/globals.css", css);

console.log({
  reportCountInPage: (page.match(/reportCount:/g) || []).length,
  hasReportInPage: (page.match(/has_report:/g) || []).length,
  portalOk: portal.includes("<RepairProgressBar"),
  cssHead: css.includes(".repair-progress-head"),
});
