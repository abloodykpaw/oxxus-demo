"use client";

import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { CreditReportTutorial } from "./CreditReportHelp";
import { downloadCreditAnalysis, downloadThreeBureauSummary } from "./plan-pdf";
import ClientScoreUpdates from "./ClientScoreUpdates";
import RepairProgressBar from "./RepairProgressBar";
import { localizeNextAction } from "./repairProgress";
import { PDF_ACCEPT, pdfIntakeError } from "./uploadValidation";

type Language = "es" | "en";
type RawSummary = Record<string, unknown>;
type Report = {
  id?: string;
  provider?: string | null;
  processing_status?: string;
  raw_summary?: RawSummary;
  created_at?: string;
  credit_scores: { bureau: string; score: number }[];
};
type Account = {
  id: string;
  creditor_name: string;
  issue_type: string | null;
  bureaus: string[];
  status: string;
};
type ClientCase = {
  id: string;
  case_number: string;
  client_id: string;
  level: number | null;
  duration_weeks: number | null;
  current_week: number;
  next_action: string | null;
  clients?: { first_name?: string; last_name?: string };
  credit_reports: Report[];
  credit_accounts: Account[];
};

const issueLabelEs: Record<string, string> = {
  collection: "Cuenta en coleccion",
  charge_off: "Cuenta castigada",
  derogatory: "Registro negativo",
  late_payment: "Pago tardio",
  "repossession/inconsistent": "Reposicion o informacion inconsistente",
};
const issueLabelEn: Record<string, string> = {
  collection: "Collection account",
  charge_off: "Charge-off account",
  derogatory: "Derogatory item",
  late_payment: "Late payment",
  "repossession/inconsistent": "Repossession or inconsistent data",
};

const isFinished = (status?: string) =>
  ["reviewed", "analyzed", "completed", "plan_prepared"].includes(
    (status || "").toLowerCase(),
  );

function summaryText(summary?: RawSummary) {
  if (!summary) return "";
  for (const key of ["plan_summary", "summary", "overview", "client_summary"]) {
    const value = summary[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export default function ClientCreditReportPortal({
  caseRecord,
  onUpdated,
  language = "es",
}: {
  caseRecord: ClientCase;
  onUpdated: () => Promise<void>;
  language?: Language;
}) {
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  const issueLabel = language === "es" ? issueLabelEs : issueLabelEn;
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const report =
    caseRecord.credit_reports?.find((item) =>
      isFinished(item.processing_status),
    ) || caseRecord.credit_reports?.[0];
  const analyzed = Boolean(
    report && (isFinished(report.processing_status) || caseRecord.level),
  );
  const priorities = useMemo(
    () => caseRecord.credit_accounts.slice(0, 4),
    [caseRecord.credit_accounts],
  );
  const overview =
    summaryText(report?.raw_summary) ||
    tr(
      `Encontramos ${caseRecord.credit_accounts.length} elemento${caseRecord.credit_accounts.length === 1 ? "" : "s"} que requieren revision. El plan esta organizado para verificar la informacion, disputar lo que sea inexacto o no verificable y dar seguimiento a cada respuesta.`,
      `We found ${caseRecord.credit_accounts.length} item${caseRecord.credit_accounts.length === 1 ? "" : "s"} that need review. The plan is organized to verify information, dispute what is inaccurate or unverifiable, and follow up on every response.`,
    );
  const scores = useMemo(() => {
    const result: Record<string, number> = {};
    caseRecord.credit_reports
      .flatMap((item) => item.credit_scores || [])
      .forEach((item) => {
        result[item.bureau.toLowerCase()] = item.score;
      });
    return result;
  }, [caseRecord.credit_reports]);
  const issueCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    caseRecord.credit_accounts.forEach((item) => {
      const label =
        issueLabel[item.issue_type || ""] ||
        item.issue_type ||
        tr("Por clasificar", "To classify");
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [caseRecord.credit_accounts, language]);
  const scoreCards = [
    { key: "experian", name: "Experian", logo: "/experian-logo-horizontal.png" },
    { key: "equifax", name: "Equifax", logo: "/equifax-logo.png" },
    { key: "transunion", name: "TransUnion", logo: "/transunion-logo.png" },
  ];
  const pdfPlan = {
    clientName:
      [caseRecord.clients?.first_name, caseRecord.clients?.last_name]
        .filter(Boolean)
        .join(" ") || "Cliente OXXUS",
    caseNumber: caseRecord.case_number,
    level: caseRecord.level,
    durationWeeks: caseRecord.duration_weeks,
    nextAction: localizeNextAction(caseRecord.next_action, language),
    overview,
    accounts: caseRecord.credit_accounts,
    scores,
  };

  async function upload() {
    if (!file) {
      setMessage(
        tr(
          "Selecciona un reporte PDF para continuar.",
          "Select a PDF report to continue.",
        ),
      );
      return;
    }
    const intakeError = pdfIntakeError(file, language);
    if (intakeError) {
      setMessage(intakeError);
      return;
    }
    setBusy(true);
    setMessage(
      tr(
        "Cargando el PDF de forma segura…",
        "Uploading the PDF securely…",
      ),
    );
    const path = `${caseRecord.client_id}/credit-reports/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("client-documents")
      .upload(path, file, { contentType: "application/pdf", upsert: false });
    if (uploadError) {
      setMessage(
        tr(
          "No pudimos cargar el reporte. Intentalo nuevamente o comunicate con tu agente.",
          "We could not upload the report. Try again or contact your agent.",
        ),
      );
      setBusy(false);
      return;
    }
    const { error: reportError } = await supabase.from("credit_reports").insert({
      case_id: caseRecord.id,
      provider: "Client upload",
      storage_path: path,
      processing_status: "analysis_requested",
    });
    const { error: documentError } = await supabase.from("documents").insert({
      client_id: caseRecord.client_id,
      case_id: caseRecord.id,
      document_type: "credit_report",
      file_name: file.name,
      storage_path: path,
      verification_status: "pending",
    });
    await supabase
      .from("cases")
      .update({
        next_action: "Revisión del Asistente OXXUS",
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseRecord.id);
    if (reportError) {
      setMessage(
        tr(
          "El archivo llego, pero no pudimos iniciar el analisis automaticamente. Tu agente fue informado para revisarlo.",
          "The file arrived, but we could not start analysis automatically. Your agent was notified.",
        ),
      );
      setBusy(false);
      return;
    }
    setFile(null);
    setMessage(
      documentError
        ? tr(
            "Reporte recibido. El Asistente OXXUS lo tiene en cola de analisis.",
            "Report received. OXXUS Assist queued it for analysis.",
          )
        : tr(
            "Documentos enviados. El Asistente OXXUS recibio tus PDF y los tiene en cola de analisis.",
            "Documents sent. OXXUS Assist received your PDFs and queued them for analysis.",
          ),
    );
    await onUpdated();
    setBusy(false);
  }

  if (!report) {
    return (
      <>
        <section
          className="client-report-entry"
          aria-labelledby="client-report-title"
        >
          <div className="client-report-copy">
            <p className="eyebrow">
              {tr("PRIMER PASO DE TU PROCESO", "FIRST STEP IN YOUR PROCESS")}
            </p>
            <span className="client-report-kicker">
              {tr(
                "Comencemos por tu informacion actual",
                "Let's start with your current information",
              )}
            </span>
            <h2 id="client-report-title">
              {tr("Adjunta tu reporte de credito", "Attach your credit report")}
            </h2>
            <p>
              {tr(
                "Puedes subir un reporte completo en PDF o usar la guia para obtener uno o mas buros. Luego pulsa Analiza mis documentos para enviarlos al Asistente OXXUS.",
                "You can upload a complete PDF report or use the guide to get one or more bureaus. Then tap Analyze my documents to send them to OXXUS Assist.",
              )}
            </p>
            <ol className="client-report-steps">
              <li>
                <b>1</b>
                <span>
                  <strong>{tr("Carga segura", "Secure upload")}</strong>
                  <small>
                    {tr(
                      "Solo PDF · maximo 25 MB",
                      "PDF only · max 25 MB",
                    )}
                  </small>
                </span>
              </li>
              <li>
                <b>2</b>
                <span>
                  <strong>
                    {tr("Asistente OXXUS", "OXXUS Assist")}
                  </strong>
                  <small>
                    {tr(
                      "Cola de analisis y plan del equipo",
                      "Analysis queue and team plan",
                    )}
                  </small>
                </span>
              </li>
              <li>
                <b>3</b>
                <span>
                  <strong>{tr("Tu plan explicado", "Your explained plan")}</strong>
                  <small>
                    {tr(
                      "Resumen descargable en un solo PDF",
                      "Downloadable summary in one PDF",
                    )}
                  </small>
                </span>
              </li>
            </ol>
          </div>
          <div className="client-report-upload">
            <div className="client-upload-icon">▤</div>
            <h3>{tr("¿Ya tienes tu reporte?", "Do you already have your report?")}</h3>
            <p>
              {tr(
                "Selecciona el reporte completo en PDF. Si aun no lo tienes, mira el tutorial que aparece abajo.",
                "Select the complete report as PDF. If you do not have it yet, watch the tutorial below.",
              )}
            </p>
            <label className="client-file-picker">
              <span>
                {file?.name ||
                  tr(
                    "Seleccionar reporte PDF",
                    "Select PDF report",
                  )}
              </span>
              <small>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                  : tr("Solo PDF", "PDF only")}
              </small>
              <input
                type="file"
                accept={PDF_ACCEPT}
                onChange={(event) => {
                  const next = event.target.files?.[0] || null;
                  if (!next) {
                    setFile(null);
                    return;
                  }
                  const err = pdfIntakeError(next, language);
                  if (err) {
                    event.target.value = "";
                    setMessage(err);
                    setFile(null);
                    return;
                  }
                  setMessage("");
                  setFile(next);
                }}
              />
            </label>
            <button
              className="primary client-upload-button"
              type="button"
              disabled={busy || !file}
              onClick={() => void upload()}
            >
              {busy
                ? tr("Analizando…", "Analyzing…")
                : tr(
                    "Analiza mis documentos",
                    "Analyze my documents",
                  )}
            </button>
            {message && (
              <p className="client-report-message" role="status">
                {message}
              </p>
            )}
            <small className="client-security-note">
              {tr(
                "Solo tu y el equipo autorizado de OXXUS pueden consultar este archivo.",
                "Only you and the authorized OXXUS team can access this file.",
              )}
            </small>
          </div>
        </section>
        <CreditReportTutorial language={language} />
      </>
    );
  }

  if (!analyzed) {
    return (
      <>
        <section className="client-analysis-pending">
          <div className="client-analysis-icon">✓</div>
          <div>
            <p className="eyebrow">
              {tr("REPORTE RECIBIDO", "REPORT RECEIVED")}
            </p>
            <h2>
              {tr(
                "El Asistente OXXUS esta preparando tu analisis",
                "OXXUS Assist is preparing your analysis",
              )}
            </h2>
            <p>
              {caseRecord.credit_reports.length >= 2
                ? tr(
                    `Recibimos ${caseRecord.credit_reports.length} PDF de buró. El Asistente OXXUS los tiene en cola: verificara puntajes, cuentas y diferencias antes del plan.`,
                    `We received ${caseRecord.credit_reports.length} bureau PDFs. OXXUS Assist queued them: it will verify scores, accounts, and differences before the plan.`,
                  )
                : tr(
                    "Recibimos tu PDF. El Asistente OXXUS lo tiene en cola: verificara puntajes, cuentas y diferencias antes del plan.",
                    "We received your PDF. OXXUS Assist queued it: it will verify scores, accounts, and differences before the plan.",
                  )}
            </p>
            <div className="client-analysis-track">
              <span className="done">
                {tr("Reporte recibido", "Report received")}
              </span>
              <span className="current">
                {tr("Asistente OXXUS", "OXXUS Assist")}
              </span>
              <span>
                {tr("Plan y PDF preparados", "Plan and PDF ready")}
              </span>
            </div>
            {message && (
              <p className="client-report-message" role="status">
                {message}
              </p>
            )}
          </div>
          <label className="client-replace-report">
            {tr(
              "Cargar una version mas reciente (PDF)",
              "Upload a more recent version (PDF)",
            )}
            <input
              type="file"
              accept={PDF_ACCEPT}
              onChange={(event) => {
                const next = event.target.files?.[0] || null;
                if (!next) {
                  setFile(null);
                  return;
                }
                const err = pdfIntakeError(next, language);
                if (err) {
                  event.target.value = "";
                  setMessage(err);
                  setFile(null);
                  return;
                }
                setMessage("");
                setFile(next);
              }}
            />
          </label>
          {file && (
            <button
              className="primary"
              type="button"
              disabled={busy}
              onClick={() => void upload()}
            >
              {busy
                ? tr("Analizando…", "Analyzing…")
                : tr("Analiza mis documentos", "Analyze my documents")}
            </button>
          )}
        </section>
        <CreditReportTutorial compact language={language} />
        <ClientScoreUpdates
          caseId={caseRecord.id}
          clientId={caseRecord.client_id}
          initialScores={scores}
          onUpdated={onUpdated}
          language={language}
        />
      </>
    );
  }

  return (
    <section className="client-plan-summary" aria-labelledby="client-plan-title">
      <div className="client-plan-heading">
        <div>
          <p className="eyebrow">
            {tr("TU ANALISIS DE CREDITO", "YOUR CREDIT ANALYSIS")}
          </p>
          <h2 id="client-plan-title">
            {tr(
              "Este es el plan que prepararemos contigo",
              "This is the plan we will prepare with you",
            )}
          </h2>
          <p>{overview}</p>
        </div>
        <div className="client-plan-actions">
          <span className="client-plan-ready">
            {tr("✓ Plan preparado", "✓ Plan ready")}
          </span>
          <button
            className="secondary"
            type="button"
            onClick={() =>
              document
                .getElementById("actualizar-credito")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            {tr("Actualizar crédito", "Update credit")}
          </button>
          <button
            className="primary"
            type="button"
            onClick={() => void downloadCreditAnalysis(pdfPlan)}
          >
            {tr("Descargar analisis", "Download analysis")}
          </button>
          <button
            className="secondary-download"
            type="button"
            onClick={() => void downloadThreeBureauSummary(pdfPlan)}
          >
            {tr(
              "Descargar 3 reportes simplificados",
              "Download 3 simplified reports",
            )}
          </button>
        </div>
      </div>
      <div className="client-plan-facts">
        <article>
          <small>{tr("NIVEL DEL CASO", "CASE LEVEL")}</small>
          <strong>
            {caseRecord.level
              ? tr(`Nivel ${caseRecord.level}`, `Level ${caseRecord.level}`)
              : tr("Por confirmar", "To confirm")}
          </strong>
          <p>
            {tr(
              "Define la intensidad y el orden de las acciones.",
              "Defines intensity and the order of actions.",
            )}
          </p>
        </article>
        <article>
          <small>{tr("DURACION ESTIMADA", "ESTIMATED DURATION")}</small>
          <strong>
            {caseRecord.duration_weeks
              ? tr(
                  `${caseRecord.duration_weeks} semanas`,
                  `${caseRecord.duration_weeks} weeks`,
                )
              : tr("En evaluacion", "Under review")}
          </strong>
          <p>
            {tr(
              "Puede ajustarse segun las respuestas recibidas.",
              "It may change based on responses received.",
            )}
          </p>
        </article>
        <article>
          <small>{tr("PROXIMO PASO", "NEXT STEP")}</small>
          <strong>
            {localizeNextAction(caseRecord.next_action, language)}
          </strong>
          <p>
            {tr(
              "Te avisaremos cuando requiera confirmacion.",
              "We will notify you when confirmation is needed.",
            )}
          </p>
        </article>
      </div>
      <div className="visual-analysis">
        <div className="score-comparison">
          {scoreCards.map((item) => {
            const score = scores[item.key];
            const width = score
              ? Math.max(2, Math.min(100, ((score - 300) / 550) * 100))
              : 0;
            return (
              <article
                className={`score-card score-card-${item.key}`}
                key={item.key}
              >
                <div className="score-card-head">
                  <img src={item.logo} alt={item.name} />
                  <span>
                    {score
                      ? tr("PUNTAJE REPORTADO", "REPORTED SCORE")
                      : tr("EN VERIFICACION", "UNDER REVIEW")}
                  </span>
                </div>
                <div className="score-value">
                  <strong>{score || "—"}</strong>
                  <small>
                    {score
                      ? tr("de 850", "of 850")
                      : tr("Pendiente", "Pending")}
                  </small>
                </div>
                <div className="score-track">
                  <span style={{ width: `${width}%` }} />
                </div>
              </article>
            );
          })}
        </div>
        <div className="analysis-breakdown">
          <article>
            <h3>{tr("Hallazgos por categoria", "Findings by category")}</h3>
            {issueCounts.length ? (
              <div className="issue-bars">
                {issueCounts.map(([label, count]) => (
                  <div className="issue-bar" key={label}>
                    <header>
                      <span>{label}</span>
                      <b>{count}</b>
                    </header>
                    <div>
                      <span
                        style={{
                          width: `${Math.max(
                            12,
                            (count /
                              Math.max(1, caseRecord.credit_accounts.length)) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="client-plan-empty">
                {tr(
                  "El equipo esta terminando de clasificar las cuentas del reporte.",
                  "The team is finishing account classification from the report.",
                )}
              </p>
            )}
          </article>
          <article>
            <h3>{tr("Ruta de trabajo", "Work path")}</h3>
            <RepairProgressBar
              compact
              language={language}
              caseRecord={{
                level: caseRecord.level,
                current_week: caseRecord.current_week,
                duration_weeks: caseRecord.duration_weeks,
                next_action: caseRecord.next_action,
                has_report: (caseRecord.credit_reports?.length ?? 0) > 0,
                reportCount: caseRecord.credit_reports?.length ?? 0,
              }}
            />
          </article>
        </div>
      </div>
      <ClientScoreUpdates
        caseId={caseRecord.id}
        clientId={caseRecord.client_id}
        initialScores={scores}
        onUpdated={onUpdated}
        language={language}
      />
      <section
        className="analysis-letter-example"
        aria-label={tr(
          "Ejemplo de informe de analisis de credito",
          "Sample credit analysis report",
        )}
      >
        <div className="analysis-letter-toolbar">
          <div>
            <p className="eyebrow">{tr("EJEMPLO VISUAL", "VISUAL EXAMPLE")}</p>
            <h3>
              {tr(
                "Asi luce el resumen de analisis OXXUS",
                "This is how the OXXUS analysis summary looks",
              )}
            </h3>
          </div>
          <span>{tr("Vista del documento", "Document preview")}</span>
        </div>
        <article className="analysis-letter-paper">
          <header>
            <img src="/oxxus-logo-light-v2.png" alt="OXXUS Credit Solutions" />
            <div>
              <b>OXXUS 3-BUREAU CREDIT ANALYSIS</b>
              <small>
                {tr(
                  "Resumen ejecutivo del plan",
                  "Executive plan summary",
                )}
              </small>
            </div>
          </header>
          <div className="analysis-letter-meta">
            <span>
              <small>{tr("PREPARADO PARA", "PREPARED FOR")}</small>
              <b>
                {[caseRecord.clients?.first_name, caseRecord.clients?.last_name]
                  .filter(Boolean)
                  .join(" ") || "Cliente OXXUS"}
              </b>
            </span>
            <span>
              <small>{tr("EXPEDIENTE", "CASE")}</small>
              <b>{caseRecord.case_number}</b>
            </span>
            <span>
              <small>{tr("FECHA", "DATE")}</small>
              <b>
                {new Date().toLocaleDateString(
                  language === "es" ? "es-US" : "en-US",
                )}
              </b>
            </span>
          </div>
          <section>
            <h4>{tr("Resumen del analisis", "Analysis summary")}</h4>
            <p>{overview}</p>
          </section>
          <section className="analysis-letter-scores">
            {scoreCards.map((item) => (
              <div key={item.key}>
                <small>{item.name.toUpperCase()}</small>
                <strong>{scores[item.key] || "—"}</strong>
                <span>
                  {scores[item.key]
                    ? tr("Puntuacion verificada", "Verified score")
                    : tr(
                        "Pendiente de verificacion",
                        "Pending verification",
                      )}
                </span>
              </div>
            ))}
          </section>
          <section>
            <h4>
              {tr("Prioridades recomendadas", "Recommended priorities")}
            </h4>
            <ol>
              {priorities.length ? (
                priorities.slice(0, 3).map((item) => (
                  <li key={item.id}>
                    <b>{item.creditor_name}</b>
                    <span>
                      {issueLabel[item.issue_type || ""] ||
                        item.issue_type ||
                        tr(
                          "Elemento que requiere revision",
                          "Item that needs review",
                        )}
                    </span>
                  </li>
                ))
              ) : (
                <li>
                  <b>{tr("Validacion inicial", "Initial validation")}</b>
                  <span>
                    {tr(
                      "Confirmar datos personales, saldos, fechas y diferencias entre buros.",
                      "Confirm personal data, balances, dates, and bureau differences.",
                    )}
                  </span>
                </li>
              )}
            </ol>
          </section>
          <footer>
            <b>OXXUS CREDIT SOLUTIONS</b>
            <span>
              {tr(
                "Organizacion, seguimiento y educacion para tu proceso de reparacion de credito.",
                "Organization, follow-up, and education for your credit repair journey.",
              )}
            </span>
          </footer>
        </article>
      </section>
      <div className="client-plan-grid">
        <div>
          <h3>{tr("Lo que encontramos", "What we found")}</h3>
          {priorities.length ? (
            <div className="client-priority-list">
              {priorities.map((item) => (
                <article key={item.id}>
                  <span>!</span>
                  <div>
                    <b>{item.creditor_name}</b>
                    <small>
                      {issueLabel[item.issue_type || ""] ||
                        item.issue_type ||
                        tr(
                          "Elemento que requiere revision",
                          "Item that needs review",
                        )}{" "}
                      ·{" "}
                      {item.bureaus.length
                        ? item.bureaus.join(" · ")
                        : tr("Buro por confirmar", "Bureau to confirm")}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="client-plan-empty">
              {tr(
                "No hay cuentas negativas registradas todavia. El equipo terminara la clasificacion antes de generar las cartas.",
                "No negative accounts are registered yet. The team will finish classification before generating letters.",
              )}
            </p>
          )}
        </div>
        <div>
          <h3>{tr("Como trabajaremos tu caso", "How we will work your case")}</h3>
          <ol className="client-strategy">
            <li>
              <b>1</b>
              <span>
                <strong>
                  {tr("Verificar la informacion", "Verify the information")}
                </strong>
                <small>
                  {tr(
                    "Comparamos datos, saldos, fechas y buros.",
                    "We compare data, balances, dates, and bureaus.",
                  )}
                </small>
              </span>
            </li>
            <li>
              <b>2</b>
              <span>
                <strong>
                  {tr("Priorizar las disputas", "Prioritize disputes")}
                </strong>
                <small>
                  {tr(
                    "Comenzamos por lo mas importante y documentable.",
                    "We start with what is most important and documentable.",
                  )}
                </small>
              </span>
            </li>
            <li>
              <b>3</b>
              <span>
                <strong>
                  {tr(
                    "Preparar cartas y soportes",
                    "Prepare letters and supporting docs",
                  )}
                </strong>
                <small>
                  {tr(
                    "Te mostramos que enviar y que incluir en cada sobre.",
                    "We show what to send and what to include in each envelope.",
                  )}
                </small>
              </span>
            </li>
            <li>
              <b>4</b>
              <span>
                <strong>{tr("Dar seguimiento", "Follow up")}</strong>
                <small>
                  {tr(
                    "Registramos envios, respuestas y cambios de puntaje.",
                    "We track mailings, responses, and score changes.",
                  )}
                </small>
              </span>
            </li>
          </ol>
        </div>
      </div>
      <p className="client-plan-disclaimer">
        {tr(
          "El analisis organiza acciones basadas en la informacion disponible. No garantiza eliminaciones ni aumentos especificos de puntaje; cada resultado depende de la verificacion y respuesta de los buros y acreedores.",
          "The analysis organizes actions based on available information. It does not guarantee deletions or specific score increases; each result depends on bureau and creditor verification and response.",
        )}
      </p>
    </section>
  );
}
