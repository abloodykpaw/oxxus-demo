"use client";

import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";
import { BureauLogoUploadCard, CreditReportTutorial } from "./CreditReportHelp";
import {
  bureauUploadCount,
  PDF_ACCEPT,
  pdfIntakeError,
} from "./uploadValidation";

type Props = {
  clientId: string;
  onCompleted: () => Promise<void>;
  language?: "es" | "en";
};
type Bureau = "experian" | "equifax" | "transunion";
const EMPTY_REPORTS: Record<Bureau, File | null> = {
  experian: null,
  equifax: null,
  transunion: null,
};

export default function ClientOnboarding({
  clientId,
  onCompleted,
  language = "es",
}: Props) {
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  const [reports, setReports] = useState<Record<Bureau, File | null>>(EMPTY_REPORTS);
  const [uploadMode, setUploadMode] = useState<"three" | "complete">("three");
  const [completeReport, setCompleteReport] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
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
              "Selecciona el reporte PDF para continuar.",
              "Select the PDF report to continue.",
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
        "Cargando tus PDF de forma segura…",
        "Uploading your PDFs securely…",
      ),
    );
    const uploaded: Record<string, { path: string; name: string }> = {};
    for (const [bureau, file] of selected) {
      if (!file) continue;
      const path = `${clientId}/credit-reports/${bureau}/${crypto.randomUUID()}.pdf`;
      const { error } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (error) {
        setMessage(
          tr(
            `No se pudo cargar ${file.name}. Inténtalo nuevamente.`,
            `Could not upload ${file.name}. Please try again.`,
          ),
        );
        setBusy(false);
        return;
      }
      uploaded[bureau] = { path, name: file.name };
    }

    setMessage(
      tr(
        "Enviando documentos al Asistente OXXUS…",
        "Sending documents to OXXUS Assist…",
      ),
    );
    const { data, error } = await supabase.rpc("client_submit_credit_reports", {
      p_experian_path: uploaded.experian?.path || null,
      p_experian_file_name: uploaded.experian?.name || null,
      p_equifax_path: uploaded.equifax?.path || null,
      p_equifax_file_name: uploaded.equifax?.name || null,
      p_transunion_path: uploaded.transunion?.path || null,
      p_transunion_file_name: uploaded.transunion?.name || null,
      p_complete_path: uploaded.complete?.path || null,
      p_complete_file_name: uploaded.complete?.name || null,
    });
    if (error) {
      setMessage(
        error.message.includes("already registered")
          ? tr(
              "Este expediente ya tiene reportes. Contacta a OXXUS si necesitas reemplazarlos.",
              "This case already has reports. Contact OXXUS if you need to replace them.",
            )
          : tr(
              "No pudimos registrar los reportes. Inténtalo nuevamente o contacta a tu agente.",
              "We could not register the reports. Try again or contact your agent.",
            ),
      );
      setBusy(false);
      return;
    }

    const result = data as { case_number?: string };
    setMessage(
      tr(
        `${result.case_number || "Tu expediente"}: documentos enviados. El Asistente OXXUS los tiene en cola de análisis.`,
        `${result.case_number || "Your case"}: documents sent. OXXUS Assist queued them for analysis.`,
      ),
    );
    setReports(EMPTY_REPORTS);
    setCompleteReport(null);
    await onCompleted();
    setBusy(false);
  }

  const bureauCount = bureauUploadCount(reports);
  const ready =
    uploadMode === "three" ? bureauCount > 0 : Boolean(completeReport);

  return (
    <div className="module report-intake-module">
      <section className="module-hero report-intake-hero">
        <div>
          <p className="eyebrow">
            {tr("ANÁLISIS DE REPORTE", "REPORT ANALYSIS")}
          </p>
          <h2>
            {tr(
              "Comencemos con tus reportes de crédito",
              "Let's start with your credit reports",
            )}
          </h2>
          <p>
            {tr(
              "Mira el tutorial y entrega tus archivos en PDF. Luego pulsa Analiza mis documentos para enviarlos al Asistente OXXUS.",
              "Watch the tutorial and upload your files as PDF. Then tap Analyze my documents to send them to OXXUS Assist.",
            )}
          </p>
        </div>
        <span className="draft">{tr("Solo PDF", "PDF only")}</span>
      </section>
      <CreditReportTutorial language={language} />
      <form className="panel report-intake-card" onSubmit={save}>
        <div className="report-intake-heading">
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
                "Puedes enviar 1, 2 o los 3 burós. Presiona el logo de cada buró y selecciona su PDF.",
                "You can send 1, 2, or all 3 bureaus. Tap each bureau logo and select its PDF.",
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
                    "Si ya tienes un reporte completo, súbelo aquí solo en PDF.",
                    "If you already have a complete report, upload it here as PDF only.",
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
              <strong>{tr("Comparación visual", "Visual comparison")}</strong>
              <small>
                {tr(
                  "Puntajes, cuentas y diferencias entre burós.",
                  "Scores, accounts, and bureau differences.",
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
                  "Cola de análisis, clasificación y plan del equipo.",
                  "Analysis queue, classification, and team plan.",
                )}
              </small>
            </span>
          </article>
          <article>
            <b>3</b>
            <span>
              <strong>{tr("PDF OXXUS", "OXXUS PDF")}</strong>
              <small>
                {tr(
                  "Versión simplificada y descargable.",
                  "Simplified downloadable summary.",
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
