"use client";

import { FormEvent, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { BureauLogoUploadCard, CreditReportTutorial } from "./CreditReportHelp";
import {
  bureauUploadCount,
  PDF_ACCEPT,
  pdfIntakeError,
} from "./uploadValidation";

type Bureau = "experian" | "equifax" | "transunion";
type AnalysisCase = {
  id: string;
  case_number: string;
  client_id: string;
  clients: { first_name: string; last_name: string };
  credit_reports?: { id?: string }[];
};

const EMPTY_REPORTS: Record<Bureau, File | null> = {
  experian: null,
  equifax: null,
  transunion: null,
};

export default function NewCase({
  cases,
  onSaved,
  language = "es",
}: {
  cases: AnalysisCase[];
  onSaved: () => Promise<void>;
  language?: "es" | "en";
}) {
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  const availableCases = useMemo(() => cases, [cases]);
  const [caseId, setCaseId] = useState(availableCases[0]?.id || "");
  const [reports, setReports] = useState<Record<Bureau, File | null>>(EMPTY_REPORTS);
  const [uploadMode, setUploadMode] = useState<"three" | "complete">("three");
  const [completeReport, setCompleteReport] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedCase = availableCases.find((item) => item.id === caseId);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selectedCase) {
      setMessage(
        tr(
          "Selecciona un cliente con expediente pendiente.",
          "Select a client with a pending case file.",
        ),
      );
      return;
    }
    const selected = (
      uploadMode === "three"
        ? Object.entries(reports).filter(([, file]) => file)
        : completeReport
          ? [["complete", completeReport]]
          : []
    ) as [Bureau | "complete", File][];
    if (selected.length === 0) {
      setMessage(
        uploadMode === "three"
          ? tr(
              "Sube al menos un PDF de buró para continuar.",
              "Upload at least one bureau PDF to continue.",
            )
          : tr(
              "Selecciona el PDF que deseas analizar.",
              "Select the PDF you want to analyze.",
            ),
      );
      return;
    }
    for (const [, file] of selected) {
      if (!file) continue;
      const err = pdfIntakeError(file, language);
      if (err) {
        setMessage(err);
        return;
      }
    }

    setBusy(true);
    setMessage(
      tr(
        "Cargando PDF de forma segura…",
        "Uploading PDFs securely…",
      ),
    );
    const reportRows: Record<string, unknown>[] = [];
    const documentRows: Record<string, unknown>[] = [];

    for (const [bureau, file] of selected) {
      if (!file) continue;
      const path = `${selectedCase.client_id}/credit-reports/${bureau}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (uploadError) {
        setMessage(
          tr(
            `No se pudo cargar ${file.name}. Inténtalo nuevamente.`,
            `Could not upload ${file.name}. Please try again.`,
          ),
        );
        setBusy(false);
        return;
      }
      const provider =
        bureau === "complete"
          ? "Team supplied complete report"
          : bureau[0].toUpperCase() + bureau.slice(1);
      reportRows.push({
        case_id: selectedCase.id,
        provider,
        storage_path: path,
        processing_status: "analysis_requested",
        raw_summary:
          bureau === "complete"
            ? { intake_type: "complete_report" }
            : { bureau, intake_type: "bureau" },
      });
      documentRows.push({
        client_id: selectedCase.client_id,
        case_id: selectedCase.id,
        document_type:
          bureau === "complete" ? "credit_report" : `credit_report_${bureau}`,
        file_name: file.name,
        storage_path: path,
        verification_status: "pending",
      });
    }

    const [{ error: reportError }, { error: documentError }] = await Promise.all([
      supabase.from("credit_reports").insert(reportRows),
      supabase.from("documents").insert(documentRows),
    ]);
    if (reportError || documentError) {
      setMessage(
        tr(
          "Los archivos llegaron, pero falta completar su registro interno. Revisa el expediente antes de repetir la carga.",
          "Files arrived, but internal registration is incomplete. Review the case file before uploading again.",
        ),
      );
      setBusy(false);
      return;
    }
    await supabase
      .from("cases")
      .update({
        next_action: "Revisión del Asistente OXXUS",
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedCase.id);
    setMessage(
      tr(
        `${selectedCase.case_number}: PDF enviados al Asistente OXXUS para análisis.`,
        `${selectedCase.case_number}: PDFs sent to OXXUS Assist for analysis.`,
      ),
    );
    setReports(EMPTY_REPORTS);
    setCompleteReport(null);
    await onSaved();
    setBusy(false);
  }

  const bureauCount = bureauUploadCount(reports);
  const ready =
    Boolean(selectedCase) &&
    (uploadMode === "three" ? bureauCount > 0 : Boolean(completeReport));

  return (
    <div className="module report-intake-module">
      <section className="module-hero report-intake-hero">
        <div>
          <p className="eyebrow">
            {tr("ANÁLISIS DE REPORTE", "REPORT ANALYSIS")}
          </p>
          <h2>
            {tr(
              "Reportes, análisis y plan OXXUS",
              "Reports, analysis, and OXXUS plan",
            )}
          </h2>
          <p>
            {tr(
              "Selecciona un expediente, carga PDF y envíalos al Asistente OXXUS.",
              "Select a case, upload PDFs, and send them to OXXUS Assist.",
            )}
          </p>
        </div>
        <span className="draft">{tr("Solo PDF", "PDF only")}</span>
      </section>

      <CreditReportTutorial language={language} />

      <form className="panel report-intake-card" onSubmit={save}>
        <div className="report-intake-heading">
          <div>
            <p className="eyebrow">{tr("EXPEDIENTE", "CASE FILE")}</p>
            <h3>
              {tr(
                "¿Para quién analizaremos los reportes?",
                "Whose reports will we analyze?",
              )}
            </h3>
            <p>
              {tr(
                "La cuenta y el expediente deben existir antes de cargar los archivos.",
                "The account and case file must exist before uploading files.",
              )}
            </p>
          </div>
          <span>
            {availableCases.length} {tr("pendientes", "pending")}
          </span>
        </div>
        <label className="analysis-client-picker">
          {tr("Cliente", "Client")}
          <select
            value={caseId}
            onChange={(event) => setCaseId(event.target.value)}
            required
          >
            {!availableCases.length && (
              <option value="">
                {tr(
                  "No hay expedientes pendientes",
                  "No pending case files",
                )}
              </option>
            )}
            {availableCases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.clients.first_name} {item.clients.last_name} ·{" "}
                {item.case_number}
                {item.credit_reports?.length
                  ? tr(" · Actualizar", " · Update")
                  : tr(" · Reporte inicial", " · Initial report")}
              </option>
            ))}
          </select>
        </label>

        <div className="report-intake-heading report-files-heading">
          <div>
            <p className="eyebrow">
              {tr("OPCIÓN RECOMENDADA", "RECOMMENDED")}
            </p>
            <h3>
              {tr(
                "Sube uno o más PDF de buró",
                "Upload one or more bureau PDFs",
              )}
            </h3>
            <p>
              {tr(
                "Puedes enviar 1, 2 o los 3 burós. Presiona cada logo para seleccionar el PDF correspondiente.",
                "You can send 1, 2, or all 3 bureaus. Tap each logo to select the matching PDF.",
              )}
            </p>
          </div>
          <span>
            {bureauCount}{" "}
            {tr("de 3 listos", "of 3 ready")}
          </span>
        </div>
        <div className="bureau-logo-grid">
          <BureauLogoUploadCard
            bureau="Experian"
            logo="/experian-logo-horizontal.png"
            file={reports.experian}
            onInvalid={setMessage}
            onChange={(file) => {
              setUploadMode("three");
              setReports({ ...reports, experian: file });
            }}
          />
          <BureauLogoUploadCard
            bureau="Equifax"
            logo="/equifax-logo.png"
            file={reports.equifax}
            onInvalid={setMessage}
            onChange={(file) => {
              setUploadMode("three");
              setReports({ ...reports, equifax: file });
            }}
          />
          <BureauLogoUploadCard
            bureau="TransUnion"
            logo="/transunion-logo.png"
            file={reports.transunion}
            onInvalid={setMessage}
            onChange={(file) => {
              setUploadMode("three");
              setReports({ ...reports, transunion: file });
            }}
          />
        </div>
        <div className="report-choice-divider">
          <span>{tr("o", "or")}</span>
        </div>
        <label
          className={`own-report-upload ${uploadMode === "complete" ? "active" : ""} ${completeReport ? "complete" : ""}`}
        >
          <div>
            <b>
              {completeReport?.name ||
                tr("Cargar mi propio PDF", "Upload my own PDF")}
            </b>
            <small>
              {completeReport
                ? `${(completeReport.size / 1024 / 1024).toFixed(1)} MB · ${tr("presiona para cambiarlo", "tap to change")}`
                : tr(
                    "Para un reporte completo en PDF que ya incluye uno o más burós.",
                    "For a complete PDF report that already includes one or more bureaus.",
                  )}
            </small>
          </div>
          <span>
            {completeReport
              ? tr("✓ PDF listo", "✓ PDF ready")
              : tr("Seleccionar PDF", "Select PDF")}
          </span>
          <input
            type="file"
            accept={PDF_ACCEPT}
            onChange={(event) => {
              const next = event.target.files?.[0] || null;
              setUploadMode("complete");
              if (!next) {
                setCompleteReport(null);
                return;
              }
              const err = pdfIntakeError(next, language);
              if (err) {
                event.target.value = "";
                setMessage(err);
                setCompleteReport(null);
                return;
              }
              setMessage("");
              setCompleteReport(next);
            }}
          />
        </label>

        <div className="analysis-delivery-preview">
          <article>
            <b>1</b>
            <span>
              <strong>
                {tr("Puntajes comparados", "Compared scores")}
              </strong>
              <small>
                {tr(
                  "Experian, Equifax y TransUnion en una sola vista.",
                  "Experian, Equifax, and TransUnion in one view.",
                )}
              </small>
            </span>
          </article>
          <article>
            <b>2</b>
            <span>
              <strong>{tr("Asistente OXXUS", "OXXUS Assist")}</strong>
              <small>
                {tr(
                  "Cola de análisis y clasificación del expediente.",
                  "Analysis queue and case classification.",
                )}
              </small>
            </span>
          </article>
          <article>
            <b>3</b>
            <span>
              <strong>
                {tr("PDF con identidad OXXUS", "OXXUS-branded PDF")}
              </strong>
              <small>
                {tr(
                  "Resumen simplificado y descargable para el cliente.",
                  "Simplified downloadable summary for the client.",
                )}
              </small>
            </span>
          </article>
        </div>
        <div className="form-actions report-intake-actions">
          <button className="primary" disabled={busy || !ready}>
            {busy
              ? tr("Analizando…", "Analyzing…")
              : tr("Analiza mis documentos", "Analyze my documents")}
          </button>
        </div>
        {message && (
          <p className="form-message new-case-message" role="status">
            {message}
          </p>
        )}
      </form>
    </div>
  );
}
