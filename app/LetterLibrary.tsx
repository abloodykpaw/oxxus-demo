"use client";

import { useMemo, useState } from "react";
import { IconDownload, IconSearch } from "./icons";

type Language = "es" | "en";
type Model = {
  category: string;
  categoryEs: string;
  title: string;
  titleEs: string;
  recipient: string;
  recipientEs: string;
  request: string;
};

const models: Model[] = [
  [
    "Credit Bureaus",
    "Burós de crédito",
    "Personal Information Correction",
    "Corrección de información personal",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Investigate and remove names, addresses, employers, or other identifying information that is inaccurate or cannot be verified.",
  ],
  [
    "Credit Bureaus",
    "Burós de crédito",
    "Collection Account Dispute",
    "Disputa de cuenta en cobranza",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Reinvestigate the highlighted collection account and delete or correct any information that is incomplete, inaccurate, or unverifiable.",
  ],
  [
    "Credit Bureaus",
    "Burós de crédito",
    "Charge-Off Account Dispute",
    "Disputa de cuenta castigada (charge-off)",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Verify the charge-off status, balance, dates, payment history, and furnisher data; correct or delete unsupported reporting.",
  ],
  [
    "Credit Bureaus",
    "Burós de crédito",
    "Late Payment Dispute",
    "Disputa de pago atrasado",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Verify each reported late payment against the complete payment history and correct any inaccurate month or status.",
  ],
  [
    "Credit Bureaus",
    "Burós de crédito",
    "Incorrect Balance or Status",
    "Saldo o estatus incorrecto",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Verify the current balance, past-due amount, account status, and date updated, then correct any inconsistency.",
  ],
  [
    "Credit Bureaus",
    "Burós de crédito",
    "Duplicate Account Dispute",
    "Disputa de cuenta duplicada",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Investigate duplicate reporting of the same obligation and remove any duplicate tradeline.",
  ],
  [
    "Credit Bureaus",
    "Burós de crédito",
    "Mixed Credit File Dispute",
    "Disputa de archivo de crédito mezclado",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Remove information belonging to another consumer and confirm that the credit file has been separated correctly.",
  ],
  [
    "Credit Bureaus",
    "Burós de crédito",
    "Unauthorized Hard Inquiry",
    "Consulta dura no autorizada",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Provide the permissible purpose and authorization for the inquiry or remove it if it cannot be verified.",
  ],
  [
    "Credit Bureaus",
    "Burós de crédito",
    "Identity Theft Block Request",
    "Solicitud de bloqueo por robo de identidad",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Block identity-theft information identified in the enclosed report and identity-theft documentation.",
  ],
  [
    "Credit Bureaus",
    "Burós de crédito",
    "Obsolete Information Dispute",
    "Disputa de información obsoleta",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Review the dates of first delinquency and remove information that is no longer reportable.",
  ],
  [
    "Investigation Follow-Up",
    "Seguimiento de investigación",
    "Method of Verification Request",
    "Solicitud del método de verificación",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Describe the procedure used to verify the disputed information and provide the furnisher's contact information.",
  ],
  [
    "Investigation Follow-Up",
    "Seguimiento de investigación",
    "Reinvestigation Follow-Up",
    "Seguimiento de reinvestigación",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Reopen the investigation because the response did not address the enclosed evidence or all disputed fields.",
  ],
  [
    "Investigation Follow-Up",
    "Seguimiento de investigación",
    "No Response Follow-Up",
    "Seguimiento por falta de respuesta",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Provide the overdue investigation results and updated report, or remove information that was not timely verified.",
  ],
  [
    "Investigation Follow-Up",
    "Seguimiento de investigación",
    "Previously Deleted Item Reinserted",
    "Ítem eliminado previamente reinsertado",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Provide the required reinsertion notice and certification, or remove the reinserted information.",
  ],
  [
    "Investigation Follow-Up",
    "Seguimiento de investigación",
    "Ignored Supporting Evidence",
    "Evidencia de apoyo ignorada",
    "Equifax, Experian or TransUnion",
    "Equifax, Experian o TransUnion",
    "Review each enclosed document and explain how the evidence was considered during the investigation.",
  ],
  [
    "Collectors",
    "Cobranza",
    "Debt Validation Request",
    "Solicitud de validación de deuda",
    "Collection agency or debt buyer",
    "Agencia de cobranza o comprador de deuda",
    "Provide the original creditor, itemized balance, account records, and documentation showing authority to collect and report.",
  ],
  [
    "Collectors",
    "Cobranza",
    "Debt Buyer Chain of Title",
    "Cadena de titularidad del comprador de deuda",
    "Debt buyer",
    "Comprador de deuda",
    "Provide a complete chain of assignment connecting the original creditor to the current owner of the account.",
  ],
  [
    "Collectors",
    "Cobranza",
    "Itemized Balance Request",
    "Solicitud de saldo desglosado",
    "Collection agency or debt buyer",
    "Agencia de cobranza o comprador de deuda",
    "Provide an itemization of principal, interest, fees, payments, credits, and the date each amount was added.",
  ],
  [
    "Collectors",
    "Cobranza",
    "Cease Communication Request",
    "Solicitud de cese de comunicación",
    "Collection agency",
    "Agencia de cobranza",
    "Limit future communications to writing and stop telephone contact, subject to applicable law.",
  ],
  [
    "Collectors",
    "Cobranza",
    "Paid Collection Update",
    "Actualización de cobranza pagada",
    "Collection agency or debt buyer",
    "Agencia de cobranza o comprador de deuda",
    "Update the account to reflect payment accurately and request deletion of the collection tradeline as a courtesy.",
  ],
  [
    "Collectors",
    "Cobranza",
    "Settlement Terms Confirmation",
    "Confirmación de términos de acuerdo",
    "Collection agency or debt buyer",
    "Agencia de cobranza o comprador de deuda",
    "Confirm the settlement amount, deadline, reporting treatment, and that the agreement resolves the account before payment.",
  ],
  [
    "Collectors",
    "Cobranza",
    "Pay-for-Delete Proposal",
    "Propuesta de pago por eliminación",
    "Collection agency or debt buyer",
    "Agencia de cobranza o comprador de deuda",
    "Offer payment conditioned on a written agreement to request deletion; do not send payment until written terms are received.",
  ],
  [
    "Collectors",
    "Cobranza",
    "Collector Reporting Dispute",
    "Disputa de reporte del cobrador",
    "Collection agency or debt buyer",
    "Agencia de cobranza o comprador de deuda",
    "Investigate inaccurate reporting directly and notify every bureau receiving the information of any correction.",
  ],
  [
    "Collectors",
    "Cobranza",
    "Time-Barred Debt Information Request",
    "Solicitud de información sobre deuda prescrita",
    "Collection agency or debt buyer",
    "Agencia de cobranza o comprador de deuda",
    "Provide the date of default and other information needed to determine the age and legal status of the debt.",
  ],
  [
    "Original Creditors",
    "Acreedores originales",
    "Direct Furnisher Dispute",
    "Disputa directa al suministrador",
    "Bank, lender or creditor",
    "Banco, prestamista o acreedor",
    "Investigate the specific disputed fields, review enclosed evidence, and correct all consumer reporting agencies.",
  ],
  [
    "Original Creditors",
    "Acreedores originales",
    "Goodwill Adjustment Request",
    "Solicitud de ajuste de buena fe (goodwill)",
    "Bank, lender or creditor",
    "Banco, prestamista o acreedor",
    "Request a discretionary goodwill removal of an isolated late payment based on the customer's overall history.",
  ],
  [
    "Original Creditors",
    "Acreedores originales",
    "Payment History Investigation",
    "Investigación del historial de pagos",
    "Bank, lender or creditor",
    "Banco, prestamista o acreedor",
    "Provide and review the complete payment ledger supporting every reported monthly status.",
  ],
  [
    "Original Creditors",
    "Acreedores originales",
    "Account Ownership Verification",
    "Verificación de titularidad de la cuenta",
    "Bank, lender or creditor",
    "Banco, prestamista o acreedor",
    "Provide the application, agreement, and records supporting ownership and responsibility for the account.",
  ],
  [
    "Original Creditors",
    "Acreedores originales",
    "Closed Account Status Correction",
    "Corrección de estatus de cuenta cerrada",
    "Bank, lender or creditor",
    "Banco, prestamista o acreedor",
    "Correct the closed date, closure reason, balance, and payment status if any field is inaccurate.",
  ],
  [
    "Original Creditors",
    "Acreedores originales",
    "Credit Limit or High Balance Correction",
    "Corrección de límite de crédito o saldo alto",
    "Bank or credit-card issuer",
    "Banco o emisor de tarjeta de crédito",
    "Verify and correct the reported credit limit, high balance, and current utilization information.",
  ],
  [
    "Special Accounts",
    "Cuentas especiales",
    "Medical Debt Validation",
    "Validación de deuda médica",
    "Medical provider or collector",
    "Proveedor médico o cobrador",
    "Provide an itemized statement, service dates, insurance adjustments, and authority to collect and report the balance.",
  ],
  [
    "Special Accounts",
    "Cuentas especiales",
    "Insurance-Pending Medical Account",
    "Cuenta médica pendiente de seguro",
    "Medical provider or collector",
    "Proveedor médico o cobrador",
    "Pause collection activity and correct reporting while the enclosed insurance claim or adjustment is reviewed.",
  ],
  [
    "Special Accounts",
    "Cuentas especiales",
    "Student Loan Reporting Dispute",
    "Disputa de reporte de préstamo estudiantil",
    "Student-loan servicer",
    "Administrador de préstamo estudiantil",
    "Verify loan status, deferment or forbearance dates, payment history, and transfer information.",
  ],
  [
    "Special Accounts",
    "Cuentas especiales",
    "Auto Repossession Deficiency Request",
    "Solicitud de déficit por reposesión de auto",
    "Auto lender or collector",
    "Prestamista de auto o cobrador",
    "Provide sale notices, sale proceeds, fees, credits, and a complete calculation of any deficiency balance.",
  ],
  [
    "Special Accounts",
    "Cuentas especiales",
    "Rental Collection Validation",
    "Validación de cobranza de renta",
    "Property manager or collector",
    "Administrador de propiedad o cobrador",
    "Provide the lease, move-out statement, security-deposit accounting, and itemized charges.",
  ],
  [
    "Special Accounts",
    "Cuentas especiales",
    "Utility or Telecom Validation",
    "Validación de servicios públicos o telecomunicaciones",
    "Utility, telecom provider or collector",
    "Proveedor de servicios, telecom o cobrador",
    "Provide service dates, service address, final bill, payments, credits, and records linking the account to the consumer.",
  ],
  [
    "Public Records",
    "Registros públicos",
    "Discharged Bankruptcy Account Correction",
    "Corrección de cuenta por bancarrota descargada",
    "Creditor or credit bureau",
    "Acreedor o buró de crédito",
    "Correct accounts that still show a collectible balance or delinquency inconsistent with the bankruptcy discharge.",
  ],
  [
    "Public Records",
    "Registros públicos",
    "Bankruptcy Not Mine",
    "Bancarrota que no es mía",
    "Credit bureau or public-record furnisher",
    "Buró de crédito o suministrador de registros públicos",
    "Investigate and remove bankruptcy information that does not belong to the consumer.",
  ],
  [
    "Public Records",
    "Registros públicos",
    "Public Record Verification",
    "Verificación de registro público",
    "Credit bureau or public-record furnisher",
    "Buró de crédito o suministrador de registros públicos",
    "Identify the source and verify the name, filing number, dates, status, and disposition of the public record.",
  ],
  [
    "Escalation",
    "Escalamiento",
    "CFPB Complaint Cover Letter",
    "Carta de presentación de queja ante la CFPB",
    "Consumer Financial Protection Bureau",
    "Oficina de Protección Financiera del Consumidor (CFPB)",
    "Summarize the dispute history, requested resolution, company responses, and attached supporting evidence for a complaint.",
  ],
].map(
  ([
    category,
    categoryEs,
    title,
    titleEs,
    recipient,
    recipientEs,
    request,
  ]) => ({
    category,
    categoryEs,
    title,
    titleEs,
    recipient,
    recipientEs,
    request,
  }),
);

function localizeModel(model: Model, language: Language) {
  const es = language === "es";
  return {
    category: es ? model.categoryEs : model.category,
    title: es ? model.titleEs : model.title,
    recipient: es ? model.recipientEs : model.recipient,
  };
}

function documentFor(model: Model) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.55;margin:55px;color:#111}p{margin:0 0 16px}h1{font-size:18px}</style></head><body><p>[CLIENT FULL NAME]<br>[STREET ADDRESS]<br>[CITY, STATE ZIP]</p><p>Date: ____ / ____ / ______</p><p>[RECIPIENT NAME]<br>[RECIPIENT ADDRESS]<br>[CITY, STATE ZIP]</p><h1>${model.title}</h1><p>Re: [ACCOUNT NAME / MASKED ACCOUNT NUMBER]</p><p>Dear Sir or Madam:</p><p>I am writing regarding information associated with the account or matter referenced above and identified in the enclosed documents.</p><p>${model.request}</p><p>Please conduct a reasonable investigation, review all enclosed supporting information, and send the results to me in writing. If the information cannot be verified as complete and accurate, please correct or delete it as required by applicable law.</p><p>Sincerely,</p><p><br><br>[CLIENT FULL NAME]<br>Signature: ______________________________</p><p><strong>Suggested enclosures:</strong> Signed letter; copy of government-issued identification; proof of address; highlighted credit-report pages; and documents supporting the specific dispute.</p></body></html>`;
}

export default function LetterLibrary({
  language = "es",
}: {
  language?: Language;
}) {
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<Model | null>(null);
  const categories = [
    "All",
    ...Array.from(new Set(models.map((x) => x.category))),
  ];
  const categoryLabel = (key: string) => {
    if (key === "All") return tr("Todas las categorías", "All categories");
    const hit = models.find((m) => m.category === key);
    return hit ? localizeModel(hit, language).category : key;
  };
  const visible = useMemo(
    () =>
      models.filter((x) => {
        if (category !== "All" && x.category !== category) return false;
        const q = query.trim().toLowerCase();
        if (!q) return true;
        const haystack =
          `${x.title} ${x.titleEs} ${x.recipient} ${x.recipientEs} ${x.category} ${x.categoryEs} ${x.request}`.toLowerCase();
        return haystack.includes(q);
      }),
    [query, category],
  );

  function download(model: Model) {
    const label = localizeModel(model, language).title;
    const blob = new Blob([documentFor(model)], {
      type: "application/msword",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OXXUS - ${label}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="module letter-library">
      <section className="module-hero">
        <div>
          <p className="eyebrow">
            {tr("BIBLIOTECA OXXUS", "OXXUS LIBRARY")}
          </p>
          <h2>
            {tr(
              "40 modelos generales de cartas",
              "40 general letter templates",
            )}
          </h2>
          <p>
            {tr(
              "Plantillas editables en inglés, organizadas por situación y listas para descargar. Los títulos se muestran en el idioma seleccionado.",
              "Editable English templates, organized by situation and ready to download. Titles follow the selected language.",
            )}
          </p>
        </div>
        <span className="record-count">
          {tr("40 modelos", "40 templates")}
        </span>
      </section>

      <section className="library-note">
        <b>{tr("Uso responsable", "Responsible use")}</b>
        <span>
          {tr(
            "Selecciona cada modelo después de revisar el reporte y la evidencia. Son bases de trabajo y deben adaptarse al caso; no todas las cartas corresponden a todos los clientes.",
            "Select each template after reviewing the report and evidence. They are working drafts and must be adapted to the case; not every letter fits every client.",
          )}
        </span>
      </section>

      <section className="panel library-panel">
        <div className="library-toolbar">
          <label>
            <IconSearch size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("Buscar una carta…", "Search a letter…")}
            />
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label={tr("Categoría", "Category")}
          >
            {categories.map((x) => (
              <option key={x} value={x}>
                {categoryLabel(x)}
              </option>
            ))}
          </select>
        </div>

        <div className="template-grid">
          {visible.map((model) => {
            const loc = localizeModel(model, language);
            return (
              <article key={model.title}>
                <span>DOC</span>
                <small>{loc.category}</small>
                <h3>{loc.title}</h3>
                <p>
                  {tr("Para:", "To:")} {loc.recipient}
                </p>
                <div>
                  <button type="button" onClick={() => setSelected(model)}>
                    {tr("Vista previa", "Preview")}
                  </button>
                  <button
                    type="button"
                    className="download"
                    onClick={() => download(model)}
                  >
                    <IconDownload size={14} />{" "}
                    {tr("Descargar .DOC", "Download .DOC")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {selected && (
        <div
          className="template-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <article>
            <header>
              <div>
                <small>{localizeModel(selected, language).category}</small>
                <h3>{localizeModel(selected, language).title}</h3>
              </div>
              <button type="button" onClick={() => setSelected(null)}>
                ×
              </button>
            </header>
            <div
              className="template-paper"
              dangerouslySetInnerHTML={{
                __html: documentFor(selected).replace(
                  /^.*<body>|<\/body>.*$/gs,
                  "",
                ),
              }}
            />
            <footer>
              <button type="button" onClick={() => download(selected)}>
                <IconDownload size={14} />{" "}
                {tr(
                  "Descargar modelo editable",
                  "Download editable template",
                )}
              </button>
            </footer>
          </article>
        </div>
      )}
    </div>
  );
}
