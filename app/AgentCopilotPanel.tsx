"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  AssistAccount,
  CopilotMessage,
  answerAgentAssist,
  suggestLetterForAccount,
} from "./agentAssist";

type Props = {
  caseNumber: string;
  nextAction?: string | null;
  accounts: AssistAccount[];
  language?: "es" | "en";
  onSaveDraft?: (draft: {
    title: string;
    body: string;
    template_key: string;
    account_id?: string;
  }) => Promise<void> | void;
};

export default function AgentCopilotPanel({
  caseNumber,
  nextAction,
  accounts,
  language = "es",
  onSaveDraft,
}: Props) {
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      role: "assistant",
      text: tr(
        "Asistente OXXUS listo. Pregunta por cartas, cuentas protegidas o el proximo procedimiento. Todo es sugerencia: tu apruebas.",
        "OXXUS assistant ready. Ask about letters, protected accounts, or next procedure. Suggestions only — you approve.",
      ),
    },
  ]);

  const quick = useMemo(
    () => [
      tr("Que cuentas estan protegidas?", "Which accounts are protected?"),
      tr("Sugiere una carta", "Suggest a letter"),
      tr("Cual es el proximo paso?", "What is the next step?"),
    ],
    [language],
  );

  async function ask(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", text: message }]);
    setInput("");
    const { reply, suggestion } = answerAgentAssist({
      message,
      accounts,
      caseNumber,
      nextAction,
      language,
    });
    let full = reply;
    if (suggestion) {
      full += `\n\n[${suggestion.title}] → ${suggestion.recipient}`;
    }
    setMessages((prev) => [...prev, { role: "assistant", text: full }]);
    if (suggestion && onSaveDraft) {
      const target = accounts.find((a) => {
        const s = suggestLetterForAccount(a);
        return s?.title === suggestion.title;
      });
      try {
        await onSaveDraft({
          title: suggestion.title,
          body: `${suggestion.request}\n\nAccount: ${target?.creditor_name || "TBD"}`,
          template_key: suggestion.key,
          account_id: target?.id,
        });
      } catch {
        // Draft persistence is best-effort until migration is applied.
      }
    }
    setBusy(false);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  return (
    <section className="agent-copilot" aria-label={tr("Copiloto OXXUS", "OXXUS Copilot")}>
      <div className="agent-copilot-head">
        <div>
          <p className="eyebrow">{tr("ASISTENTE DEL AGENTE", "AGENT ASSISTANT")}</p>
          <h3>{tr("Copiloto del expediente", "Case copiloto")}</h3>
          <p>
            {tr(
              "Conocimiento OXXUS · sin envio automatico · sin promesas de score",
              "OXXUS knowledge · no auto-send · no score promises",
            )}
          </p>
        </div>
        <span className="agent-pill soft">{caseNumber}</span>
      </div>
      <div className="agent-copilot-thread">
        {messages.map((m, i) => (
          <article key={`${m.role}-${i}`} className={m.role === "user" ? "me" : "bot"}>
            <small>{m.role === "user" ? tr("Agente", "Agent") : "OXXUS"}</small>
            <p>{m.text}</p>
          </article>
        ))}
      </div>
      <div className="agent-copilot-quick">
        {quick.map((q) => (
          <button key={q} type="button" disabled={busy} onClick={() => void ask(q)}>
            {q}
          </button>
        ))}
      </div>
      <form className="agent-copilot-form" onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tr("Escribe una pregunta…", "Ask a question…")}
          disabled={busy}
        />
        <button className="primary" type="submit" disabled={busy || !input.trim()}>
          {busy ? "…" : tr("Preguntar", "Ask")}
        </button>
      </form>
    </section>
  );
}
