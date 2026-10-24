"use client";

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
      className={`repair-progress ${compact ? "compact" : ""} ${className}`.trim()}
      aria-labelledby="repair-progress-title"
    >
      <header className="repair-progress-head">
        <div>
          <p className="eyebrow">
            {tr("AVANCE DE TU REPARACION", "YOUR REPAIR PROGRESS")}
          </p>
          <h3 id="repair-progress-title">
            {tr(
              `Fase actual: ${progress.phaseLabelEs}`,
              `Current phase: ${progress.phaseLabelEn}`,
            )}
          </h3>
          <p>
            {tr(progress.weekLabelEs, progress.weekLabelEn)}
            {" · "}
            {tr("Proximo paso:", "Next step:")}{" "}
            <strong>
              {tr(progress.nextActionEs, progress.nextActionEn)}
            </strong>
          </p>
        </div>
        <div
          className="repair-progress-pct"
          aria-label={tr(
            `${progress.percent} por ciento completado`,
            `${progress.percent} percent complete`,
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
        <i style={{ width: `${progress.percent}%` }} />
      </div>

      <ol className="repair-progress-steps">
        {progress.phases.map((phase) => (
          <li key={phase.id} className={phase.status}>
            <span className="step-dot" aria-hidden="true">
              {phase.status === "done" ? "✓" : ""}
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
