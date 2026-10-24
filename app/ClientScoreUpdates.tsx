"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { PDF_ACCEPT, pdfIntakeError } from "./uploadValidation";
import {
  SCORE_VISION_ENABLED,
  extractScoresWithAssist,
  scoresToFormFields,
} from "./scoreVision";
import {
  CREDIT_UPDATE_PRIVACY,
  CREDIT_UPDATE_SOURCES,
  type CreditUpdateSourceId,
  localizeSourceField,
  localizeSourceSteps,
  sourceById,
} from "./creditUpdateSources";

type Language = "es" | "en";
type Scores = { transunion?: number; experian?: number; equifax?: number };
type Progress = Scores & {
  id: string;
  file_name: string;
  note: string | null;
  created_at: string;
};

const labels = {
  transunion: "TransUnion",
  experian: "Experian",
  equifax: "Equifax",
};

export default function ClientScoreUpdates({
  caseId,
  clientId,
  initialScores,
  onUpdated,
  language = "es",
}: {
  caseId: string;
  clientId: string;
  initialScores: Scores;
  onUpdated: () => Promise<void>;
  language?: Language;
}) {
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  const [sourceId, setSourceId] = useState<CreditUpdateSourceId>("credit_karma");
  const [mode, setMode] = useState<"report" | "score">("score");
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [scoreFile, setScoreFile] = useState<File | null>(null);
  const selectedSource = sourceById(sourceId) || CREDIT_UPDATE_SOURCES[0];
  const [scoreForm, setScoreForm] = useState({
    transunion: "",
    experian: "",
    equifax: "",
    note: "",
  });
  const [progress, setProgress] = useState<Progress[]>([]);
  const [baselineScores] = useState<Scores>(initialScores);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [message, setMessage] = useState("");
  const [assistHint, setAssistHint] = useState("");

  const loadProgress = useCallback(async () => {
    const { data } = await supabase
      .from("score_progress")
      .select("id,file_name,transunion,experian,equifax,note,created_at")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true });
    setProgress((data || []) as Progress[]);
  }, [caseId]);

  useEffect(() => {
    void loadProgress();
    const channel = supabase
      .channel(`client-score-dashboard-${caseId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "score_progress",
          filter: `case_id=eq.${caseId}`,
        },
        () => void loadProgress(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [caseId, loadProgress]);

  const currentScores = useMemo(() => {
    const current: Scores = { ...baselineScores };
    progress.forEach((row) => {
      (Object.keys(labels) as (keyof Scores)[]).forEach((bureau) => {
        if (row[bureau]) current[bureau] = row[bureau];
      });
    });
    return current;
  }, [baselineScores, progress]);

  async function uploadReport(event: FormEvent) {
    event.preventDefault();
    if (!reportFile) {
      setMessage(
        tr(
          "Selecciona el reporte actualizado en PDF.",
          "Select the updated report as PDF.",
        ),
      );
      return;
    }
    const err = pdfIntakeError(reportFile, language);
    if (err) {
      setMessage(err);
      return;
    }
    setBusy(true);
    setMessage(
      tr("Cargando el reporte actualizado…", "Uploading the updated report…"),
    );
    const path = `${clientId}/credit-reports/update/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("client-documents")
      .upload(path, reportFile, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) {
      setMessage(
        tr(
          "No pudimos cargar el reporte actualizado.",
          "We could not upload the updated report.",
        ),
      );
      setBusy(false);
      return;
    }
    const [{ error: reportError }] = await Promise.all([
      supabase.from("credit_reports").insert({
        case_id: caseId,
        provider: "Client updated report",
        storage_path: path,
        processing_status: "analysis_requested",
        raw_summary: { intake_type: "report_update" },
      }),
      supabase.from("documents").insert({
        client_id: clientId,
        case_id: caseId,
        document_type: "credit_report_update",
        file_name: reportFile.name,
        storage_path: path,
        verification_status: "pending",
      }),
      supabase
        .from("cases")
        .update({
          next_action: "Revisión del Asistente OXXUS",
          updated_at: new Date().toISOString(),
        })
        .eq("id", caseId),
    ]);
    setReportFile(null);
    setMessage(
      reportError
        ? tr(
            "El archivo llegó, pero requiere revisión manual del equipo.",
            "The file arrived, but needs manual team review.",
          )
        : tr(
            "PDF recibido. El Asistente OXXUS lo tiene en cola para comparar cambios.",
            "PDF received. OXXUS Assist queued it to compare changes.",
          ),
    );
    await onUpdated();
    setBusy(false);
  }

  async function runAssistExtract() {
    if (!scoreFile) {
      setMessage(
        tr(
          "Adjunta una captura primero.",
          "Attach a screenshot first.",
        ),
      );
      return;
    }
    setExtracting(true);
    setAssistHint("");
    setMessage(
      tr(
        "Asistente OXXUS leyendo la captura…",
        "OXXUS Assist is reading the screenshot…",
      ),
    );
    const result = await extractScoresWithAssist(scoreFile, language);
    setExtracting(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    const fields = scoresToFormFields(result.scores);
    setScoreForm((prev) => ({
      ...prev,
      ...fields,
      note:
        prev.note ||
        (result.scores.notes
          ? String(result.scores.notes)
          : tr(
              "Extraído por Asistente OXXUS — confirma antes de guardar",
              "Extracted by OXXUS Assist — confirm before saving",
            )),
    }));
    const conf =
      result.scores.confidence != null
        ? ` · ${Math.round(result.scores.confidence * 100)}%`
        : "";
    setAssistHint(
      tr(
        `Puntajes sugeridos${conf}. Revísalos y pulsa Registrar cambio.`,
        `Suggested scores${conf}. Review them and tap Save change.`,
      ),
    );
    setMessage(
      tr(
        "Extracción lista. Confirma los valores antes de guardar.",
        "Extraction ready. Confirm the values before saving.",
      ),
    );
  }

  async function uploadScore(event: FormEvent) {
    event.preventDefault();
    if (!scoreFile) {
      setMessage(
        tr(
          "Adjunta una captura o PDF como evidencia.",
          "Attach a screenshot or PDF as evidence.",
        ),
      );
      return;
    }
    if (!scoreForm.transunion && !scoreForm.experian && !scoreForm.equifax) {
      setMessage(
        tr(
          "Registra al menos una puntuación nueva.",
          "Enter at least one new score.",
        ),
      );
      return;
    }
    setBusy(true);
    setMessage(
      tr("Registrando la nueva puntuación…", "Recording the new score…"),
    );
    const extension = scoreFile.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${clientId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("score-progress")
      .upload(path, scoreFile, { contentType: scoreFile.type, upsert: false });
    if (uploadError) {
      setMessage(
        tr(
          "No pudimos subir la evidencia.",
          "We could not upload the evidence.",
        ),
      );
      setBusy(false);
      return;
    }
    const value = (score: string) => (score ? Number(score) : null);
    const { error } = await supabase.rpc("record_score_progress", {
      p_case_id: caseId,
      p_storage_path: path,
      p_file_name: scoreFile.name,
      p_transunion: value(scoreForm.transunion),
      p_experian: value(scoreForm.experian),
      p_equifax: value(scoreForm.equifax),
      p_note: scoreForm.note,
    });
    if (error) {
      setMessage(
        tr(
          "La evidencia llegó, pero no pudimos registrar la puntuación.",
          "Evidence arrived, but we could not record the score.",
        ),
      );
      setBusy(false);
      return;
    }
    setScoreFile(null);
    setScoreForm({ transunion: "", experian: "", equifax: "", note: "" });
    setAssistHint("");
    setMessage(
      tr(
        "Puntuación actualizada. La tabla y las tarjetas ya reflejan el cambio.",
        "Score updated. The table and cards already reflect the change.",
      ),
    );
    await loadProgress();
    await onUpdated();
    setBusy(false);
  }

  const canExtract =
    Boolean(scoreFile) &&
    ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(
      (scoreFile?.type || "").toLowerCase(),
    );

  function selectSource(id: CreditUpdateSourceId) {
    const source = sourceById(id);
    if (!source) return;
    setSourceId(id);
    setMode(source.mode);
    setMessage("");
  }

  return (
    <section className="score-update-dashboard" id="actualizar-credito">
      <div className="score-update-heading">
        <div>
          <p className="eyebrow">
            {tr("ACTUALIZAR CRÉDITO", "UPDATE CREDIT")}
          </p>
          <h3>
            {tr(
              "Guía + evidencia: score o reporte PDF",
              "Guide + evidence: score or PDF report",
            )}
          </h3>
          <p>
            {tr(
              "Elige la fuente, abre el sitio tú mismo, vuelve y sube captura o PDF. Los cambios confirmados se comparan con tu línea base.",
              "Pick a source, open the site yourself, return, and upload a screenshot or PDF. Confirmed changes are compared to your baseline.",
            )}
          </p>
        </div>
        <div className="score-update-tabs">
          <button
            type="button"
            className={mode === "score" ? "active" : ""}
            onClick={() => {
              setMode("score");
              if (selectedSource.mode !== "score") {
                setSourceId("credit_karma");
              }
            }}
          >
            {tr("Actualizar puntuación", "Update score")}
          </button>
          <button
            type="button"
            className={mode === "report" ? "active" : ""}
            onClick={() => {
              setMode("report");
              setSourceId("annual_credit_report");
            }}
          >
            {tr("Actualizar reporte", "Update report")}
          </button>
        </div>
      </div>

      <div className="credit-update-privacy" role="note">
        <b>{localizeSourceField(CREDIT_UPDATE_PRIVACY.title, language)}</b>
        <span>{localizeSourceField(CREDIT_UPDATE_PRIVACY.body, language)}</span>
      </div>

      <div
        className="credit-update-sources"
        role="group"
        aria-label={tr("Elegir fuente", "Choose source")}
      >
        {CREDIT_UPDATE_SOURCES.map((source) => {
          const active = source.id === sourceId;
          return (
            <button
              key={source.id}
              type="button"
              className={
                active
                  ? "credit-update-source active"
                  : "credit-update-source"
              }
              onClick={() => selectSource(source.id)}
            >
              <span className="credit-update-source-badge">
                {localizeSourceField(source.badge, language)}
              </span>
              <b>{source.name}</b>
              <small>
                {localizeSourceField(source.description, language)}
              </small>
            </button>
          );
        })}
      </div>

      <div className="credit-update-guide">
        <div className="credit-update-guide-copy">
          <p className="eyebrow">
            {tr("PASOS DE LA FUENTE", "SOURCE STEPS")}
          </p>
          <h4>{localizeSourceField(selectedSource.title, language)}</h4>
          <ol className="credit-update-steps">
            {localizeSourceSteps(selectedSource.steps, language).map(
              (step) => (
                <li key={step}>{step}</li>
              ),
            )}
          </ol>
        </div>
        <a
          className="primary credit-update-open"
          href={selectedSource.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {localizeSourceField(selectedSource.openLabel, language)}
        </a>
      </div>

      {mode === "report" ? (
        <form
          className="score-update-form report-update-form"
          onSubmit={uploadReport}
        >
          <label>
            <b>
              {reportFile?.name ||
                tr(
                  "Seleccionar reporte PDF actualizado",
                  "Select updated PDF report",
                )}
            </b>
            <small>{tr("Solo PDF · máximo 25 MB", "PDF only · max 25 MB")}</small>
            <input
              type="file"
              accept={PDF_ACCEPT}
              onChange={(event) => {
                const next = event.target.files?.[0] || null;
                if (!next) {
                  setReportFile(null);
                  return;
                }
                const err = pdfIntakeError(next, language);
                if (err) {
                  event.target.value = "";
                  setMessage(err);
                  setReportFile(null);
                  return;
                }
                setMessage("");
                setReportFile(next);
              }}
            />
          </label>
          <button className="primary" disabled={busy || !reportFile}>
            {busy
              ? tr("Analizando…", "Analyzing…")
              : tr("Analiza mis documentos", "Analyze my documents")}
          </button>
        </form>
      ) : (
        <form className="score-update-form" onSubmit={uploadScore}>
          <label className="score-evidence">
            <b>
              {scoreFile?.name ||
                tr("Adjuntar captura o PDF", "Attach screenshot or PDF")}
            </b>
            <small>
              {tr(
                "Captura o PDF como evidencia · escribe los puntajes a mano",
                "Screenshot or PDF as evidence · enter scores manually",
              )}
            </small>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(event) => {
                setScoreFile(event.target.files?.[0] || null);
                setAssistHint("");
              }}
            />
          </label>
          {SCORE_VISION_ENABLED && (
          <div className="score-assist-row">
            <button
              type="button"
              className="secondary"
              disabled={busy || extracting || !canExtract}
              onClick={() => void runAssistExtract()}
            >
              {extracting
                ? tr("Extrayendo…", "Extracting…")
                : tr(
                    "Extraer con Asistente OXXUS",
                    "Extract with OXXUS Assist",
                  )}
            </button>
            {assistHint && <small className="score-assist-hint">{assistHint}</small>}
          </div>
          )}
          <div className="score-update-inputs">
            {(Object.keys(labels) as (keyof Scores)[]).map((bureau) => (
              <label key={bureau}>
                {labels[bureau]}
                <input
                  type="number"
                  min="300"
                  max="850"
                  placeholder={currentScores[bureau]?.toString() || "300–850"}
                  value={scoreForm[bureau]}
                  onChange={(event) =>
                    setScoreForm({
                      ...scoreForm,
                      [bureau]: event.target.value,
                    })
                  }
                />
              </label>
            ))}
          </div>
          <label className="score-note">
            {tr("Nota opcional", "Optional note")}
            <input
              value={scoreForm.note}
              onChange={(event) =>
                setScoreForm({ ...scoreForm, note: event.target.value })
              }
              placeholder={tr(
                "Ej. actualización después de la primera ronda",
                "E.g. update after the first round",
              )}
            />
          </label>
          <button
            className="primary"
            disabled={
              busy ||
              extracting ||
              !scoreFile ||
              (!scoreForm.transunion &&
                !scoreForm.experian &&
                !scoreForm.equifax)
            }
          >
            {busy
              ? tr("Guardando…", "Saving…")
              : tr("Registrar cambio", "Save change")}
          </button>
        </form>
      )}
      {message && (
        <p className="score-update-message" role="status">
          {message}
        </p>
      )}

      <div className="score-history-table">
        <div className="score-history-title">
          <h3>{tr("Evolución de puntuaciones", "Score history")}</h3>
          <span>
            {progress.length}{" "}
            {tr(
              `actualización${progress.length === 1 ? "" : "es"}`,
              `update${progress.length === 1 ? "" : "s"}`,
            )}
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>{tr("FECHA", "DATE")}</th>
              <th>TRANSUNION</th>
              <th>EXPERIAN</th>
              <th>EQUIFAX</th>
              <th>{tr("CAMBIO", "CHANGE")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>{tr("Inicial", "Baseline")}</b>
              </td>
              <td>{baselineScores.transunion || "—"}</td>
              <td>{baselineScores.experian || "—"}</td>
              <td>{baselineScores.equifax || "—"}</td>
              <td>
                <span className="baseline-pill">
                  {tr("Línea base", "Baseline")}
                </span>
              </td>
            </tr>
            {progress.map((row) => {
              const deltas = (Object.keys(labels) as (keyof Scores)[])
                .map((bureau) =>
                  row[bureau] && baselineScores[bureau]
                    ? row[bureau]! - baselineScores[bureau]!
                    : null,
                )
                .filter((value): value is number => value !== null);
              const best = deltas.length ? Math.max(...deltas) : null;
              return (
                <tr key={row.id}>
                  <td>
                    <b>{new Date(row.created_at).toLocaleDateString("es-US")}</b>
                    <small>{row.note || row.file_name}</small>
                  </td>
                  <td>{row.transunion || "—"}</td>
                  <td>{row.experian || "—"}</td>
                  <td>{row.equifax || "—"}</td>
                  <td>
                    {best !== null ? (
                      <span
                        className={
                          best >= 0 ? "positive-pill" : "negative-pill"
                        }
                      >
                        {best >= 0 ? "▲" : "▼"} {best > 0 ? "+" : ""}
                        {best} pts
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
