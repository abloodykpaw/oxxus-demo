"use client";

import { FormEvent, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import AgentCopilotPanel from "./AgentCopilotPanel";
import {
  AssistAccount,
  ROADMAP_PHASES,
  badgeForAccount,
  classifyAccountLocal,
} from "./agentAssist";
import { downloadAgentAssistReport } from "./plan-pdf";

type CaseItem = {
  id: string;
  case_number: string;
  next_action?: string | null;
  level?: number | null;
  clients: { first_name: string; last_name: string };
  credit_accounts: AssistAccount[];
  credit_reports?: {
    id?: string;
    provider?: string | null;
    processing_status?: string;
  }[];
};

type KbDoc = {
  id: string;
  slug: string;
  title: string;
  category: string;
  status: string;
  current_version: number;
};

type Props = {
  cases: CaseItem[];
  viewerRole: string;
  language?: "es" | "en";
  onOpenCase: (caseId: string) => void;
  onRefresh?: () => void;
};

const ANALYSIS_PENDING = new Set(["analysis_requested", "uploaded"]);

function needsDocumentAnalysis(c: CaseItem): boolean {
  if (c.level != null) return false;
  const reports = c.credit_reports || [];
  if (!reports.length) return false;
  return reports.some((r) =>
    ANALYSIS_PENDING.has((r.processing_status || "").toLowerCase()),
  );
}

export default function AgentAssistHub({
  cases,
  viewerRole,
  language = "es",
  onOpenCase,
  onRefresh,
}: Props) {
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  const isAdmin = viewerRole === "admin";
  const analysisQueue = useMemo(
    () => cases.filter(needsDocumentAnalysis),
    [cases],
  );
  const [tab, setTab] = useState<"roadmap" | "queue" | "kb" | "demo">(
    analysisQueue.length ? "queue" : "roadmap",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [kbDocs, setKbDocs] = useState<KbDoc[]>([]);
  const [proposal, setProposal] = useState({ title: "", body: "", url: "" });
  const [planLevel, setPlanLevel] = useState(2);
  const [selectedCaseId, setSelectedCaseId] = useState(cases[0]?.id || "");

  const flatAccounts = useMemo(
    () =>
      cases.flatMap((c) =>
        c.credit_accounts.map((a) => ({
          ...a,
          case_id: c.id,
          case_number: c.case_number,
          client_name: `${c.clients.first_name} ${c.clients.last_name}`.trim(),
        })),
      ),
    [cases],
  );

  const stats = useMemo(() => {
    let protectedN = 0;
    let reviewN = 0;
    let disputableN = 0;
    for (const a of flatAccounts) {
      const b = badgeForAccount(a);
      if (b === "protected") protectedN += 1;
      else if (b === "review") reviewN += 1;
      else disputableN += 1;
    }
    return {
      protectedN,
      reviewN,
      disputableN,
      total: flatAccounts.length,
      analysisN: analysisQueue.length,
    };
  }, [flatAccounts, analysisQueue.length]);

  const reviewQueue = useMemo(
    () => flatAccounts.filter((a) => badgeForAccount(a) === "review"),
    [flatAccounts],
  );

  const selectedCase = cases.find((c) => c.id === selectedCaseId) || cases[0];

  async function classifyCase(caseId: string) {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("classify_case_accounts", {
      p_case_id: caseId,
    });
    setBusy(false);
    if (error) {
      setMessage(
        tr(
          "No se pudo clasificar (aplica migracion 026). Abre el expediente: la UI usa clasificador local.",
          "Could not classify (apply migration 026). Open the file: UI uses local classifier.",
        ),
      );
      return;
    }
    setMessage(tr("Clasificacion aplicada al expediente.", "Classification applied to the case."));
    onRefresh?.();
  }

  async function markAnalysisReviewed(caseId: string, level = 2) {
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.rpc("prepare_case_plan", {
      p_case_id: caseId,
      p_level: level,
      p_duration_weeks: null,
    });
    setBusy(false);
    if (error) {
      setMessage(
        tr(
          "No se pudo generar el plan (aplica migracion 028). Intenta de nuevo.",
          "Could not generate the plan (apply migration 028). Try again.",
        ),
      );
      return;
    }
    const result = data as { weeks_created?: boolean; duration_weeks?: number };
    setMessage(
      result?.weeks_created
        ? tr(
            `Plan generado: nivel ${level}, ${result.duration_weeks} semanas y cartas borrador.`,
            `Plan generated: level ${level}, ${result.duration_weeks} weeks and draft letters.`,
          )
        : tr(
            `Analisis cerrado y nivel ${level} asignado. Las semanas ya existian.`,
            `Analysis closed and level ${level} assigned. Weeks already existed.`,
          ),
    );
    onRefresh?.();
  }
  async function loadKb() {
    const { data, error } = await supabase
      .from("kb_documents")
      .select("id,slug,title,category,status,current_version")
      .order("title");
    if (error) {
      setMessage(
        tr(
          "KB pendiente de migracion 026. Se muestran principios locales.",
          "KB pending migration 026. Showing local principles.",
        ),
      );
      setKbDocs([
        {
          id: "local-1",
          slug: "oxxus-operating-principles",
          title: "Principios operativos del copiloto OXXUS",
          category: "sop",
          status: "published",
          current_version: 1,
        },
        {
          id: "local-2",
          slug: "protected-accounts-policy",
          title: "Politica de cuentas protegidas",
          category: "policy",
          status: "published",
          current_version: 1,
        },
        {
          id: "local-3",
          slug: "letter-selection-guide",
          title: "Guia de seleccion de cartas",
          category: "sop",
          status: "published",
          current_version: 1,
        },
      ]);
      return;
    }
    setKbDocs((data || []) as KbDoc[]);
  }

  async function classifyAll() {
    setBusy(true);
    setMessage("");
    let ok = 0;
    let fail = 0;
    for (const c of cases) {
      const { error } = await supabase.rpc("classify_case_accounts", {
        p_case_id: c.id,
      });
      if (error) fail += 1;
      else ok += 1;
    }
    setMessage(
      fail
        ? tr(
            `Clasificacion: ${ok} ok, ${fail} pendientes (aplica migracion 026). Mientras, UI usa clasificador local.`,
            `Classification: ${ok} ok, ${fail} pending (apply migration 026). UI uses local classifier meanwhile.`,
          )
        : tr(
            `Clasificacion aplicada a ${ok} expediente(s).`,
            `Classification applied to ${ok} case(s).`,
          ),
    );
    onRefresh?.();
    setBusy(false);
  }

  async function submitProposal(e: FormEvent) {
    e.preventDefault();
    if (!proposal.title.trim() || !proposal.body.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("kb_change_requests").insert({
      title: proposal.title.trim(),
      proposal: proposal.body.trim(),
      source_url: proposal.url.trim() || null,
      status: "pending",
    });
    setBusy(false);
    if (error) {
      setMessage(
        tr(
          "No se pudo guardar la propuesta (migracion 026 requerida).",
          "Could not save proposal (migration 026 required).",
        ),
      );
      return;
    }
    setProposal({ title: "", body: "", url: "" });
    setMessage(tr("Propuesta enviada a revision admin.", "Proposal sent for admin review."));
  }

  return (
    <div className="module agent-assist-hub">
      <section className="module-hero agent-assist-hero">
        <div>
          <p className="eyebrow">{tr("SISTEMA INTEGRAL", "INTEGRAL SYSTEM")}</p>
          <h2>{tr("Asistente OXXUS", "OXXUS Assist")}</h2>
          <p>
            {tr(
              "Copiloto del agente, cuentas protegidas, clasificacion y knowledge gobernado. Sin autonomia peligrosa.",
              "Agent copiloto, protected accounts, classification, and governed knowledge. No unsafe autonomy.",
            )}
          </p>
        </div>
        <div className="agent-assist-hero-actions">
          <button
            type="button"
            className="primary"
            onClick={() => void downloadAgentAssistReport({ language })}
          >
            {tr("Descargar reporte para dirección", "Download owner report")}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => void classifyAll()}>
            {tr("Clasificar cuentas", "Classify accounts")}
          </button>
        </div>
      </section>

      <section className="agent-assist-stats">
        <article>
          <small>{tr("Analisis docs", "Doc analysis")}</small>
          <strong>{stats.analysisN}</strong>
        </article>
        <article>
          <small>{tr("Protegidas", "Protected")}</small>
          <strong>{stats.protectedN}</strong>
        </article>
        <article>
          <small>{tr("Por revisar", "To review")}</small>
          <strong>{stats.reviewN}</strong>
        </article>
        <article>
          <small>{tr("Disputables", "Disputable")}</small>
          <strong>{stats.disputableN}</strong>
        </article>
      </section>

      <nav className="agent-assist-tabs" aria-label="Asistente sections">
        {(
          [
            ["queue", tr("Colas", "Queues")],
            ["demo", tr("Copiloto", "Copilot")],
            ["roadmap", tr("Roadmap", "Roadmap")],
            ["kb", tr("Knowledge", "Knowledge")],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              if (id === "kb") void loadKb();
            }}
          >
            {label}
            {id === "queue" && analysisQueue.length > 0
              ? ` (${analysisQueue.length})`
              : ""}
          </button>
        ))}
      </nav>

      {message && <p className="agent-assist-message">{message}</p>}

      {tab === "roadmap" && (
        <section className="panel agent-roadmap">
          <div className="panel-heading">
            <div>
              <h3>{tr("Roadmap sensato completo", "Full sensible roadmap")}</h3>
              <p>
                {tr(
                  "Ubicacion: este modulo en navegacion + panel dentro de cada expediente.",
                  "Placement: this nav module + panel inside each case file.",
                )}
              </p>
            </div>
          </div>
          <div className="agent-roadmap-grid">
            {ROADMAP_PHASES.map((phase) => (
              <article key={phase.id}>
                <span>{phase.id}</span>
                <h4>{phase.title}</h4>
                <p>{phase.detail}</p>
                <em>{tr("Disponible en UI", "Available in UI")}</em>
              </article>
            ))}
          </div>
          <div className="agent-placement-note">
            <b>{tr("Donde se ubica", "Where it lives")}</b>
            <ol>
              <li>
                {tr(
                  "Nav lateral → Asistente OXXUS (hub, cola, KB, PDF).",
                  "Side nav → OXXUS Assist (hub, queue, KB, PDF).",
                )}
              </li>
              <li>
                {tr(
                  "Expediente del cliente → seccion cuentas con badges + Copiloto.",
                  "Client file → accounts badges + Copilot section.",
                )}
              </li>
              <li>
                {tr(
                  "Analisis / disputas → cuentas marcadas protegida vs disputable.",
                  "Analysis / disputes → protected vs disputable badges.",
                )}
              </li>
            </ol>
          </div>
        </section>
      )}

      {tab === "queue" && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>
                  {tr(
                    "Cola: documentos por analizar",
                    "Queue: documents to analyze",
                  )}
                </h3>
                <p>
                  {tr(
                    "Clientes que pulsarón Analiza mis documentos. Abre el expediente, clasifica cuentas y marca revisado.",
                    "Clients who tapped Analyze my documents. Open the file, classify accounts, and mark reviewed.",
                  )}
                </p>
              </div>
              <span>{analysisQueue.length}</span>
            </div>
            <div className="agent-queue-list">
              {analysisQueue.length === 0 && (
                <p className="file-empty">
                  {tr(
                    "No hay documentos pendientes de analisis.",
                    "No documents pending analysis.",
                  )}
                </p>
              )}
              {analysisQueue.map((c) => {
                const reportCount = c.credit_reports?.length || 0;
                const accountCount = c.credit_accounts.length;
                return (
                  <article key={c.id} className="agent-analysis-row">
                    <div>
                      <b>
                        {c.clients.first_name} {c.clients.last_name}
                      </b>
                      <small>
                        {c.case_number} · {reportCount}{" "}
                        {tr("PDF", "PDF")}
                        {accountCount
                          ? ` · ${accountCount} ${tr("cuentas", "accounts")}`
                          : ` · ${tr("sin cuentas cargadas", "no accounts loaded")}`}
                        {c.next_action ? ` · ${c.next_action}` : ""}
                      </small>
                    </div>
                    <span className="agent-pill review">
                      {tr("Analisis", "Analysis")}
                    </span>
                    <div className="agent-queue-actions">
                      <label className="agent-level-picker">
                        <span>{tr("Nivel", "Level")}</span>
                        <select
                          value={planLevel}
                          onChange={(e) => setPlanLevel(Number(e.target.value))}
                          disabled={busy}
                        >
                          {[1, 2, 3, 4].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="button" onClick={() => onOpenCase(c.id)}>
                        {tr("Abrir expediente", "Open file")}
                      </button>
                      <button
                        type="button"
                        disabled={busy || accountCount === 0}
                        title={
                          accountCount === 0
                            ? tr(
                                "Carga cuentas en el expediente primero",
                                "Load accounts in the case file first",
                              )
                            : undefined
                        }
                        onClick={() => void classifyCase(c.id)}
                      >
                        {tr("Clasificar", "Classify")}
                      </button>
                      <button
                        type="button"
                        className="primary"
                        disabled={busy}
                        onClick={() => void markAnalysisReviewed(c.id, planLevel)}
                      >
                        {tr("Generar plan", "Generate plan")}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>
                  {tr("Cola: cuentas por revisar", "Queue: accounts to review")}
                </h3>
                <p>
                  {tr(
                    "Confianza baja o senales mixtas. Confirma proteccion antes de disputar.",
                    "Low confidence or mixed signals. Confirm protection before disputing.",
                  )}
                </p>
              </div>
              <span>{reviewQueue.length}</span>
            </div>
            <div className="agent-queue-list">
              {reviewQueue.length === 0 && (
                <p className="file-empty">
                  {tr(
                    "No hay cuentas en revision ahora.",
                    "No accounts in review right now.",
                  )}
                </p>
              )}
              {reviewQueue.map((a) => {
                const c = classifyAccountLocal(a);
                return (
                  <article key={a.id}>
                    <div>
                      <b>{a.creditor_name}</b>
                      <small>
                        {a.case_number} · {a.client_name} · conf{" "}
                        {(c.classification_confidence * 100).toFixed(0)}%
                      </small>
                    </div>
                    <span className="agent-pill review">
                      {tr("Revisar", "Review")}
                    </span>
                    <button type="button" onClick={() => onOpenCase(a.case_id)}>
                      {tr("Abrir expediente", "Open file")}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}

      {tab === "demo" && (
        <section className="agent-demo-grid">
          <label className="agent-case-picker">
            <span>{tr("Expediente de prueba", "Demo case")}</span>
            <select
              value={selectedCase?.id || ""}
              onChange={(e) => setSelectedCaseId(e.target.value)}
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.case_number} — {c.clients.first_name} {c.clients.last_name}
                </option>
              ))}
            </select>
          </label>
          {selectedCase ? (
            <AgentCopilotPanel
              caseNumber={selectedCase.case_number}
              nextAction={selectedCase.next_action}
              accounts={selectedCase.credit_accounts}
              language={language}
              onSaveDraft={async (draft) => {
                await supabase.from("copilot_drafts").insert({
                  case_id: selectedCase.id,
                  account_id: draft.account_id || null,
                  title: draft.title,
                  body: draft.body,
                  template_key: draft.template_key,
                  status: "suggested",
                  citations: [{ source: "letter-library", key: draft.template_key }],
                });
              }}
            />
          ) : (
            <p className="file-empty">{tr("No hay casos.", "No cases.")}</p>
          )}
        </section>
      )}

      {tab === "kb" && (
        <section className="panel agent-kb">
          <div className="panel-heading">
            <div>
              <h3>{tr("Knowledge base gobernada", "Governed knowledge base")}</h3>
              <p>
                {tr(
                  "Solo documentos publicados. Cambios pasan por propuesta + admin.",
                  "Published documents only. Changes go through proposal + admin.",
                )}
              </p>
            </div>
            <button type="button" onClick={() => void loadKb()}>
              {tr("Actualizar", "Refresh")}
            </button>
          </div>
          <div className="agent-kb-list">
            {kbDocs.map((doc) => (
              <article key={doc.id}>
                <span>{doc.category}</span>
                <b>{doc.title}</b>
                <small>
                  v{doc.current_version} · {doc.status}
                </small>
              </article>
            ))}
          </div>
          <form className="agent-kb-form" onSubmit={submitProposal}>
            <h4>
              {tr("Proponer cambio (Tier 2)", "Propose change (Tier 2)")}
              {!isAdmin && (
                <small>
                  {" "}
                  · {tr("requiere revision admin", "requires admin review")}
                </small>
              )}
            </h4>
            <input
              placeholder={tr("Titulo", "Title")}
              value={proposal.title}
              onChange={(e) => setProposal({ ...proposal, title: e.target.value })}
            />
            <textarea
              rows={4}
              placeholder={tr("Propuesta / texto", "Proposal / text")}
              value={proposal.body}
              onChange={(e) => setProposal({ ...proposal, body: e.target.value })}
            />
            <input
              placeholder={tr("URL oficial (opcional)", "Official URL (optional)")}
              value={proposal.url}
              onChange={(e) => setProposal({ ...proposal, url: e.target.value })}
            />
            <button className="primary" type="submit" disabled={busy}>
              {tr("Enviar propuesta", "Submit proposal")}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
