"use client";

import { useMemo, useState } from "react";
import { badgeForAccount } from "./agentAssist";

type Language = "es" | "en";
type Account = {
  id: string;
  creditor_name: string;
  balance: number | null;
  issue_type: string | null;
  bureaus: string[];
  status: string;
  account_type?: string | null;
  account_class?: string | null;
  account_status_norm?: string | null;
  is_protected?: boolean;
  protection_reason?: string | null;
  classification_confidence?: number | null;
};
type CaseItem = {
  id: string;
  case_number: string;
  clients: { first_name: string; last_name: string };
  credit_accounts: Account[];
};

const bureaus: Record<string, string> = {
  transunion: "TU",
  experian: "EX",
  equifax: "EQ",
};

export default function DisputesByClient({
  cases,
  onOpen,
  language = "es",
}: {
  cases: CaseItem[];
  onOpen: (index: number) => void;
  language?: Language;
}) {
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  const badgeLabel = {
    protected: tr("Protegida", "Protected"),
    review: tr("Revisar", "Review"),
    disputable: tr("Disputable", "Disputable"),
  } as const;
  const [open, setOpen] = useState<string | null>(cases[0]?.id || null);

  const totals = useMemo(() => {
    let review = 0;
    let disputable = 0;
    let protectedN = 0;
    for (const c of cases) {
      for (const a of c.credit_accounts || []) {
        const b = badgeForAccount(a);
        if (b === "protected") protectedN += 1;
        else if (b === "review") review += 1;
        else disputable += 1;
      }
    }
    return { review, disputable, protectedN };
  }, [cases]);

  return (
    <div className="module">
      <section className="module-hero">
        <div>
          <p className="eyebrow">
            {tr("DISPUTAS POR CLIENTE", "DISPUTES BY CLIENT")}
          </p>
          <h2>
            {tr(
              "Expedientes y cuentas disputables",
              "Case files and disputable accounts",
            )}
          </h2>
          <p>
            {tr(
              "Cola priorizada: primero cuentas por revisar, luego disputables. Las protegidas no se tratan como negativas a eliminar.",
              "Prioritized queue: review accounts first, then disputable. Protected accounts must not be treated as items to delete.",
            )}
          </p>
        </div>
        <span className="record-count">
          {cases.length} {tr("clientes", "clients")} · {totals.review}{" "}
          {tr("revisar", "review")} · {totals.disputable}{" "}
          {tr("disputables", "disputable")}
        </span>
      </section>
      <div className="dispute-client-list">
        {cases.map((item, index) => {
          const active = open === item.id;
          const total = item.credit_accounts.reduce(
            (sum, a) => sum + (Number(a.balance) || 0),
            0,
          );
          const protectedN = item.credit_accounts.filter(
            (a) => badgeForAccount(a) === "protected",
          ).length;
          const reviewN = item.credit_accounts.filter(
            (a) => badgeForAccount(a) === "review",
          ).length;
          return (
            <section className="panel dispute-client" key={item.id}>
              <button
                className="dispute-client-head"
                type="button"
                onClick={() => setOpen(active ? null : item.id)}
              >
                <span>
                  {item.clients.first_name[0]}
                  {item.clients.last_name[0]}
                </span>
                <div>
                  <h3>
                    {item.clients.first_name} {item.clients.last_name}
                  </h3>
                  <small>
                    {item.case_number} · {item.credit_accounts.length}{" "}
                    {tr("cuenta(s)", "account(s)")}
                    {reviewN
                      ? ` · ${reviewN} ${tr("por revisar", "to review")}`
                      : ""}
                    {protectedN
                      ? ` · ${protectedN} ${tr("protegida(s)", "protected")}`
                      : ""}
                  </small>
                </div>
                <em>${total.toLocaleString("en-US")}</em>
                <i>{active ? "−" : "+"}</i>
              </button>
              {active && (
                <div className="dispute-client-body">
                  {item.credit_accounts.length ? (
                    <div className="dispute-accounts">
                      {item.credit_accounts.map((a) => {
                        const badge = badgeForAccount(a);
                        return (
                          <article key={a.id}>
                            <div>
                              <b>{a.creditor_name}</b>
                              <small>
                                {a.issue_type ||
                                  tr(
                                    "Pendiente de revisión",
                                    "Pending review",
                                  )}
                              </small>
                            </div>
                            <span>
                              {a.balance == null
                                ? "—"
                                : `$${Number(a.balance).toLocaleString("en-US")}`}
                            </span>
                            <em>
                              {a.bureaus
                                .map((x) => bureaus[x] || x)
                                .join(" · ") || "—"}
                            </em>
                            <span className={`agent-pill ${badge}`}>
                              {badgeLabel[badge]}
                            </span>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="no-disputes">
                      {tr(
                        "Todavía no hay cuentas negativas registradas para este cliente.",
                        "No negative accounts are registered for this client yet.",
                      )}
                    </p>
                  )}
                  <button
                    type="button"
                    className="open-client-file"
                    onClick={() => onOpen(index)}
                  >
                    {tr("Abrir ficha completa →", "Open full file →")}
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
