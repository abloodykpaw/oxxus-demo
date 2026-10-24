export type CreditUpdateLanguage = "es" | "en";
export type CreditUpdateMode = "score" | "report";
export type CreditUpdateSourceId =
  | "credit_karma"
  | "identityiq"
  | "annual_credit_report";

export const ANNUAL_CREDIT_REPORT_URL = "https://www.annualcreditreport.com/";
export const CREDIT_KARMA_URL = "https://www.creditkarma.com/auth/logon";
export const IDENTITYIQ_URL = "https://www.identityiq.com/";

export type CreditUpdateSource = {
  id: CreditUpdateSourceId;
  mode: CreditUpdateMode;
  url: string;
  name: string;
  badge: { es: string; en: string };
  title: { es: string; en: string };
  description: { es: string; en: string };
  openLabel: { es: string; en: string };
  steps: { es: string[]; en: string[] };
};

export const CREDIT_UPDATE_SOURCES: CreditUpdateSource[] = [
  {
    id: "credit_karma",
    mode: "score",
    url: CREDIT_KARMA_URL,
    name: "Credit Karma",
    badge: { es: "Score / progreso", en: "Score / progress" },
    title: {
      es: "Actualizar puntuación con Credit Karma",
      en: "Update score with Credit Karma",
    },
    description: {
      es: "Abre tu cuenta, captura los puntajes y súbelos a OXXUS. No compartas tu contraseña.",
      en: "Open your account, screenshot the scores, and upload them to OXXUS. Never share your password.",
    },
    openLabel: { es: "Abrir Credit Karma", en: "Open Credit Karma" },
    steps: {
      es: [
        "Inicia sesión tú mismo en Credit Karma (nueva pestaña).",
        "Abre la vista de tus puntajes de crédito.",
        "Toma una captura clara de TransUnion / Equifax (o ambos).",
        "Vuelve a OXXUS, sube la captura y confirma los números.",
      ],
      en: [
        "Sign in yourself on Credit Karma (new tab).",
        "Open your credit score view.",
        "Take a clear screenshot of TransUnion / Equifax (or both).",
        "Return to OXXUS, upload the screenshot, and confirm the numbers.",
      ],
    },
  },
  {
    id: "identityiq",
    mode: "score",
    url: IDENTITYIQ_URL,
    name: "IdentityIQ",
    badge: { es: "Score / progreso", en: "Score / progress" },
    title: {
      es: "Actualizar puntuación con IdentityIQ",
      en: "Update score with IdentityIQ",
    },
    description: {
      es: "Úsalo para monitorear puntajes. Descarga o captura la evidencia y cárgala aquí.",
      en: "Use it to monitor scores. Download or screenshot evidence and upload it here.",
    },
    openLabel: { es: "Abrir IdentityIQ", en: "Open IdentityIQ" },
    steps: {
      es: [
        "Inicia sesión tú mismo en IdentityIQ (nueva pestaña).",
        "Ve a credit scores o el resumen de tu crédito.",
        "Captura o descarga la evidencia de puntajes.",
        "Vuelve a OXXUS, súbela y confirma antes de guardar.",
      ],
      en: [
        "Sign in yourself on IdentityIQ (new tab).",
        "Go to credit scores or your credit summary.",
        "Screenshot or download score evidence.",
        "Return to OXXUS, upload it, and confirm before saving.",
      ],
    },
  },
  {
    id: "annual_credit_report",
    mode: "report",
    url: ANNUAL_CREDIT_REPORT_URL,
    name: "AnnualCreditReport.com",
    badge: { es: "Reporte PDF completo", en: "Full PDF report" },
    title: {
      es: "Obtener reportes oficiales de buró",
      en: "Get official bureau reports",
    },
    description: {
      es: "Fuente oficial gratuita (FCRA) para Experian, Equifax y TransUnion. Descarga PDF y súbelos a OXXUS.",
      en: "Official free FCRA source for Experian, Equifax, and TransUnion. Download PDFs and upload them to OXXUS.",
    },
    openLabel: {
      es: "Obtener reportes gratis",
      en: "Get free reports",
    },
    steps: {
      es: [
        "Abre AnnualCreditReport.com (sitio oficial).",
        "Selecciona uno o más burós.",
        "Verifica tu identidad en el sitio del buró.",
        "Descarga cada reporte en PDF y súbelo aquí para análisis.",
      ],
      en: [
        "Open AnnualCreditReport.com (official site).",
        "Select one or more bureaus.",
        "Verify your identity on the bureau website.",
        "Download each report as PDF and upload it here for analysis.",
      ],
    },
  },
];

export const CREDIT_UPDATE_PRIVACY = {
  title: {
    es: "OXXUS nunca pide tus contraseñas",
    en: "OXXUS never asks for your passwords",
  },
  body: {
    es: "No compartas credenciales de Credit Karma, IdentityIQ ni de los burós. Tú abres el sitio, descargas o capturas, y solo subes la evidencia a OXXUS.",
    en: "Do not share Credit Karma, IdentityIQ, or bureau credentials. You open the site, download or screenshot, and only upload evidence to OXXUS.",
  },
};

export function localizeSourceField(
  field: { es: string; en: string },
  language: CreditUpdateLanguage,
) {
  return language === "es" ? field.es : field.en;
}

export function localizeSourceSteps(
  steps: { es: string[]; en: string[] },
  language: CreditUpdateLanguage,
) {
  return language === "es" ? steps.es : steps.en;
}

export function sourceById(id: CreditUpdateSourceId) {
  return CREDIT_UPDATE_SOURCES.find((source) => source.id === id);
}
