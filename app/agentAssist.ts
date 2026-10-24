/** Shared logic for Agent Assist: classification + letter suggestions (no LLM required). */

export type AssistAccount = {
  id: string;
  creditor_name: string;
  balance?: number | null;
  issue_type?: string | null;
  bureaus?: string[];
  status?: string;
  account_type?: string | null;
  account_class?: string | null;
  account_status_norm?: string | null;
  is_protected?: boolean;
  protection_reason?: string | null;
  classification_source?: string | null;
  classification_confidence?: number | null;
};

export type ProtectionBadge = "protected" | "review" | "disputable";

export type LetterSuggestion = {
  key: string;
  category: string;
  title: string;
  recipient: string;
  request: string;
  why: string;
};

const LETTERS: Array<Omit<LetterSuggestion, "why" | "key"> & { match: RegExp }> = [
  {
    match: /collection|collector|debt.?buyer/i,
    category: "Collectors",
    title: "Debt Validation Request",
    recipient: "Collection agency or debt buyer",
    request:
      "Provide the original creditor, itemized balance, account records, and documentation showing authority to collect and report.",
  },
  {
    match: /charge.?off|castigad/i,
    category: "Credit Bureaus",
    title: "Charge-Off Account Dispute",
    recipient: "Equifax, Experian or TransUnion",
    request:
      "Verify the charge-off status, balance, dates, payment history, and furnisher data; correct or delete unsupported reporting.",
  },
  {
    match: /late|tard[ií]o|delinquen/i,
    category: "Credit Bureaus",
    title: "Late Payment Dispute",
    recipient: "Equifax, Experian or TransUnion",
    request:
      "Verify each reported late payment against the complete payment history and correct any inaccurate month or status.",
  },
  {
    match: /inquiry|consulta|hard.?pull/i,
    category: "Credit Bureaus",
    title: "Unauthorized Hard Inquiry",
    recipient: "Equifax, Experian or TransUnion",
    request:
      "Provide the permissible purpose and authorization for the inquiry or remove it if it cannot be verified.",
  },
  {
    match: /identity|robo|fraud/i,
    category: "Credit Bureaus",
    title: "Identity Theft Block Request",
    recipient: "Equifax, Experian or TransUnion",
    request:
      "Block identity-theft information identified in the enclosed report and identity-theft documentation.",
  },
  {
    match: /medical|m[eé]dic/i,
    category: "Special Accounts",
    title: "Medical Debt Validation",
    recipient: "Medical provider or collector",
    request:
      "Provide an itemized statement, service dates, insurance adjustments, and authority to collect and report the balance.",
  },
];

const OPEN_CARD =
  /(visa|mastercard|amex|american express|discover|capital one|chase|citi|bank of america|synchrony|credit.?card|revolving)/i;
const NEGATIVE = /(collection|charge.?off|late|derogatory|repossess|judgment)/i;

export function classifyAccountLocal(account: AssistAccount): {
  account_class: string;
  account_status_norm: string;
  is_protected: boolean;
  protection_reason: string | null;
  classification_confidence: number;
  badge: ProtectionBadge;
} {
  if (account.is_protected === true) {
    return {
      account_class: account.account_class || "revolving",
      account_status_norm: account.account_status_norm || "open",
      is_protected: true,
      protection_reason: account.protection_reason || "open_revolving",
      classification_confidence: account.classification_confidence ?? 0.95,
      badge: "protected",
    };
  }

  const issue = `${account.issue_type || ""} ${account.status || ""}`;
  const type = `${account.account_type || ""} ${account.creditor_name || ""}`;
  const hay = `${issue} ${type}`;

  if (NEGATIVE.test(issue) || /collection/i.test(account.account_class || "")) {
    return {
      account_class: /inquiry/i.test(hay) ? "inquiry" : "collection",
      account_status_norm: /charge/i.test(hay) ? "charged_off" : "collection",
      is_protected: false,
      protection_reason: null,
      classification_confidence: 0.9,
      badge: "disputable",
    };
  }

  if (OPEN_CARD.test(type) && !NEGATIVE.test(issue)) {
    return {
      account_class: "revolving",
      account_status_norm: "open",
      is_protected: true,
      protection_reason: "open_revolving",
      classification_confidence: 0.86,
      badge: "protected",
    };
  }

  const confidence = account.classification_confidence ?? 0.5;
  if (confidence < 0.7) {
    return {
      account_class: account.account_class || "other",
      account_status_norm: account.account_status_norm || "unknown",
      is_protected: false,
      protection_reason: null,
      classification_confidence: confidence,
      badge: "review",
    };
  }

  return {
    account_class: account.account_class || "other",
    account_status_norm: account.account_status_norm || "unknown",
    is_protected: false,
    protection_reason: null,
    classification_confidence: confidence,
    badge: "disputable",
  };
}

export function badgeForAccount(account: AssistAccount): ProtectionBadge {
  return classifyAccountLocal(account).badge;
}

export function suggestLetterForAccount(account: AssistAccount): LetterSuggestion | null {
  const classified = classifyAccountLocal(account);
  if (classified.badge === "protected") return null;
  const hay = `${account.issue_type || ""} ${account.creditor_name || ""} ${account.status || ""}`;
  const hit = LETTERS.find((item) => item.match.test(hay)) || LETTERS[0];
  return {
    key: hit.title.toLowerCase().replace(/\s+/g, "-"),
    category: hit.category,
    title: hit.title,
    recipient: hit.recipient,
    request: hit.request,
    why:
      classified.badge === "review"
        ? "Clasificacion en revision: confirmar antes de disputar."
        : `Sugerido por tipo de hallazgo (${account.issue_type || "pendiente"}).`,
  };
}

export type CopilotMessage = { role: "user" | "assistant"; text: string };

export function answerAgentAssist(input: {
  message: string;
  accounts: AssistAccount[];
  caseNumber?: string;
  nextAction?: string | null;
  language?: "es" | "en";
}): { reply: string; suggestion: LetterSuggestion | null } {
  const es = (input.language || "es") === "es";
  const q = input.message.toLowerCase();
  const accounts = input.accounts || [];
  const protectedCount = accounts.filter((a) => badgeForAccount(a) === "protected").length;
  const reviewCount = accounts.filter((a) => badgeForAccount(a) === "review").length;
  const disputable = accounts.filter((a) => badgeForAccount(a) === "disputable");

  if (/proteg|vigente|tarjeta|open.?card|delete|borrar/.test(q)) {
    return {
      suggestion: null,
      reply: es
        ? `Hay ${protectedCount} cuenta(s) protegida(s) en este expediente. No se deben disputar ni borrar. Las candidatas a revision son ${reviewCount}. El candado real vive en base de datos (is_protected); el copiloto solo advierte.`
        : `There are ${protectedCount} protected account(s) on this file. Do not dispute or delete them. ${reviewCount} need review. The real lock is in the database (is_protected); the copiloto only warns.`,
    };
  }

  if (/carta|letter|dispute|disputa|plantilla|template/.test(q)) {
    const target =
      disputable.find((a) => q.includes(a.creditor_name.toLowerCase().slice(0, 6))) ||
      disputable[0] ||
      null;
    const suggestion = target ? suggestLetterForAccount(target) : null;
    if (!suggestion || !target) {
      return {
        suggestion: null,
        reply: es
          ? "No hay cuentas disputables claras. Revisa primero la clasificacion (protegida / revisar / disputable)."
          : "No clear disputable accounts. Review classification first (protected / review / disputable).",
      };
    }
    return {
      suggestion,
      reply: es
        ? `Para ${target.creditor_name}: usa el modelo "${suggestion.title}" (${suggestion.category}). Destinatario: ${suggestion.recipient}. ${suggestion.why} Esto es un borrador: el agente debe revisar evidencia y aprobar antes de enviar.`
        : `For ${target.creditor_name}: use template "${suggestion.title}" (${suggestion.category}). Recipient: ${suggestion.recipient}. ${suggestion.why} Draft only — agent must review evidence and approve before sending.`,
    };
  }

  if (/pr[oó]xim|next|semana|plan|proced/.test(q)) {
    return {
      suggestion: null,
      reply: es
        ? `Procedimiento sugerido: 1) Confirmar cuentas protegidas (${protectedCount}). 2) Resolver cola "revisar" (${reviewCount}). 3) Priorizar disputables (${disputable.length}). 4) Elegir carta OXXUS y guardar borrador. Proxima accion del caso: ${input.nextAction || "Revisar expediente"}.`
        : `Suggested procedure: 1) Confirm protected accounts (${protectedCount}). 2) Clear review queue (${reviewCount}). 3) Prioritize disputables (${disputable.length}). 4) Pick an OXXUS letter and save a draft. Case next action: ${input.nextAction || "Review file"}.`,
    };
  }

  return {
    suggestion: null,
    reply: es
      ? `Soy el asistente interno OXXUS para el expediente ${input.caseNumber || ""}. Puedo: explicar cuentas protegidas, sugerir cartas de la biblioteca, y proponer el procedimiento. No envio disputas solo y no prometo score. Pregunta por "cartas", "protegidas" o "proximo paso".`
      : `I am the internal OXXUS assistant for case ${input.caseNumber || ""}. I can explain protected accounts, suggest Letter Library templates, and outline procedure. I never send disputes alone and never promise a score. Ask about "letters", "protected", or "next step".`,
  };
}

export const ROADMAP_PHASES = [
  {
    id: "P0",
    title: "Schema + locks",
    detail:
      "is_protected, audit_log, triggers anti-borrado, override admin documentado.",
  },
  {
    id: "P1",
    title: "Copiloto en expediente",
    detail:
      "Chat asistido, borradores de carta, feedback util/incorrecto, human-in-the-loop.",
  },
  {
    id: "P2",
    title: "Clasificador",
    detail:
      "Etiquetas protegida / revisar / disputable, cola de revision, conteo vigentes.",
  },
  {
    id: "P3",
    title: "KB gobernada",
    detail:
      "Documentos versionados, propuestas con cita, publicacion solo con admin.",
  },
] as const;
