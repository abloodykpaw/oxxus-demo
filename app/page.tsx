"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import InviteCenter from "./InviteCenter";
import NewCase from "./NewCase";
import ClientOnboarding from "./ClientOnboarding";
import ClientCreditReportPortal from "./ClientCreditReportPortal";
import RepairProgressBar from "./RepairProgressBar";
import { localizeNextAction } from "./repairProgress";
import Module from "./DataModule";
import ClientFile from "./ClientFile";
import AgentAssistHub from "./AgentAssistHub";
import DisputesByClient from "./DisputesByClient";
import { badgeForAccount } from "./agentAssist";
import LetterLibrary from "./LetterLibrary";
import CreditReportHelp from "./CreditReportHelp";
import WorkdayReport, { WorkdayTracker } from "./WorkdayReport";
import { ThemeToggle } from "./theme";
import {
  IconAlert,
  IconChart,
  IconCheck,
  IconChevron,
  IconLock,
  IconLogout,
  IconPlus,
  IconRefresh,
  IconShieldCheck,
  IconSwap,
  IconUsers,
  NavIcon,
} from "./icons";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import {
  clearNeonSession,
  getNeonSession,
  isNeonDemo,
  neonLoadDashboard,
  neonSignIn,
} from "../lib/demo-backend";
import { oxxusVersionLabel } from "../lib/oxxus-version";
type Score = { bureau: string; score: number };
type Client = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  agent_id?: string | null;
  owner_user_id?: string | null;
  access_status?: "confirmed" | "pending" | "not_invited";
};
type CaseRecord = {
  id: string;
  case_number: string;
  client_id: string;
  level: number | null;
  duration_weeks: number | null;
  current_week: number;
  status: string;
  next_action: string | null;
  created_at?: string;
  registry_source?: string;
  has_report?: boolean;
  document_count?: number;
  clients: Client;
  credit_reports: {
    id?: string;
    provider?: string | null;
    storage_path?: string;
    processing_status?: string;
    raw_summary?: Record<string, unknown>;
    created_at?: string;
    credit_scores: Score[];
  }[];
  credit_accounts: {
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
    classification_source?: string | null;
    classification_confidence?: number | null;
  }[];
};
type Profile = {
  id: string;
  full_name: string | null;
  role: string;
  client_id?: string | null;
};
type OnboardingStatus = {
  needs_onboarding?: boolean;
  client_id?: string | null;
  case_id?: string | null;
  has_report?: boolean;
  profile_incomplete?: boolean;
  client?: Client | null;
};
type Language = "es" | "en";
const nav = [
    "Dashboard",
    "Informe diario",
    "Clientes",
    "Análisis de reporte",
    "Disputas",
    "Asistente OXXUS",
    "Enviar invitación",
    "Ayuda y recursos",
    "Documentos",
    "Usuarios y roles",
  ],
  bureauLabel: Record<string, string> = {
    transunion: "TU",
    experian: "EX",
    equifax: "EQ",
  },
  roleLabel: Record<string, string> = {
    admin: "Administrador",
    specialist: "Especialista",
    reviewer: "Revisor",
    repair_agent: "Agente de reparación",
    web_collaborator: "Colaborador del sitio web",
    client: "Cliente",
  },
  roleLabelEnglish: Record<string, string> = {
    admin: "Administrator",
    specialist: "Specialist",
    reviewer: "Reviewer",
    repair_agent: "Credit repair agent",
    web_collaborator: "Website collaborator",
    client: "Client",
  },
  navEnglish: Record<string, string> = {
    Dashboard: "Dashboard",
    "Informe diario": "Daily report",
    Clientes: "Clients",
    "Análisis de reporte": "Report analysis",
    Disputas: "Disputes",
    "Asistente OXXUS": "OXXUS Assist",
    "Enviar invitación": "Send invitation",
    "Ayuda y recursos": "Help and resources",
    Documentos: "Documents",
    "Usuarios y roles": "Users and roles",
  },
  navShortEs: Record<string, string> = {
    Dashboard: "Inicio",
    "Informe diario": "Informe",
    Clientes: "Clientes",
    "Análisis de reporte": "Análisis",
    Disputas: "Disputas",
    "Asistente OXXUS": "Asistente",
    "Enviar invitación": "Invitar",
    "Ayuda y recursos": "Ayuda",
    Documentos: "Docs",
    "Usuarios y roles": "Usuarios",
  },
  navShortEn: Record<string, string> = {
    Dashboard: "Home",
    "Informe diario": "Daily",
    Clientes: "Clients",
    "Análisis de reporte": "Analysis",
    Disputas: "Disputes",
    "Asistente OXXUS": "Assist",
    "Enviar invitación": "Invite",
    "Ayuda y recursos": "Help",
    Documentos: "Docs",
    "Usuarios y roles": "Users",
  };

function LanguageToggle({
  language,
  onChange,
}: {
  language: Language;
  onChange: (language: Language) => void;
}) {
  return (
    <button
      type="button"
      className="language-toggle"
      onClick={() => onChange(language === "es" ? "en" : "es")}
      aria-label={
        language === "es" ? "Cambiar idioma a inglés" : "Switch to Spanish"
      }
      title={language === "es" ? "Cambiar a inglés" : "Cambiar a español"}
    >
      <span className={language === "es" ? "active" : ""}>ES</span>
      <i>/</i>
      <span className={language === "en" ? "active" : ""}>EN</span>
    </button>
  );
}
const initials = (n: string) =>
  n
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
const fullName = (c: Client) => `${c.first_name} ${c.last_name}`.trim();
function scoresFor(c: CaseRecord) {
  const s = c.credit_reports?.[0]?.credit_scores ?? [];
  return ["transunion", "experian", "equifax"]
    .map((b) => s.find((x) => x.bureau === b)?.score ?? "—")
    .join(" · ");
}
function Login({
  language,
  onLanguageChange,
  onSignedIn,
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
  onSignedIn?: (session: Session) => void;
}) {
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  const [mode, setMode] = useState<"login" | "create">("login"),
    [email, setEmail] = useState(
      isNeonDemo ? "admin@demo.oxxus.local" : "",
    ),
    [password, setPassword] = useState(isNeonDemo ? "Demo2026!Oxxus" : ""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    if (isNeonDemo) {
      const { session, error } = await neonSignIn(email, password);
      if (session) onSignedIn?.(session);
      setMessage(
        error
          ? tr(
              "No pudimos iniciar sesión. Revisa el usuario demo del README.",
              "We could not sign in. Check the demo credentials in the README.",
            )
          : tr("Acceso correcto.", "Signed in successfully."),
      );
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setMessage(
      error
        ? tr(
            "No pudimos iniciar sesión. Si todavía no tienes clave, selecciona Crear contraseña.",
            "We could not sign in. If you do not have a password yet, choose Create password.",
          )
        : tr("Acceso correcto.", "Signed in successfully."),
    );
    setBusy(false);
  }
  async function sendPasswordLink(e: FormEvent) {
    e.preventDefault();
    if (isNeonDemo) {
      setMessage(
        tr(
          "En la demo Neon no se envían correos. Usa el usuario demo precargado.",
          "The Neon demo does not send emails. Use the prefilled demo user.",
        ),
      );
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (!error)
      setMessage(
        tr(
          "Revisa tu correo. Abre el enlace y regresarás aquí para crear tu contraseña.",
          "Check your email. Open the link and you will return here to create your password.",
        ),
      );
    else if (error.status === 429)
      setMessage(
        tr(
          "Supabase alcanzó su límite temporal de correos. Espera unos minutos y vuelve a intentarlo; tu usuario sí está autorizado.",
          "Supabase hit a temporary email limit. Wait a few minutes and try again; your user is authorized.",
        ),
      );
    else
      setMessage(
        tr(
          "No pudimos enviar el correo. Revisa el correo escrito e intenta nuevamente.",
          "We could not send the email. Check the address and try again.",
        ),
      );
    setBusy(false);
  }
  function changeMode(next: "login" | "create") {
    setMode(next);
    setMessage("");
    setPassword("");
  }
  return (
    <main className="login-shell">
      <section className="login-brand">
        <div className="brand logo-brand">
          <img
            className="logo-image logo-light"
            src="/oxxus-logo-light-v2.png"
            alt="OXXUS Credit Solutions"
          />
          <img
            className="logo-image logo-dark"
            src="/oxxus-logo-dark-v2.png"
            alt="OXXUS Credit Solutions"
          />
        </div>
        <h1>
          {tr(
            "Tu operación de reparación de crédito, organizada.",
            "Your credit repair operation, organized.",
          )}
        </h1>
        <p>
          {tr(
            "Clientes, reportes, planes semanales y disputas en un solo lugar protegido.",
            "Clients, reports, weekly plans, and disputes in one protected place.",
          )}
        </p>
        <div className="login-points">
          <div className="login-point">
            <span className="point-ico">
              <IconCheck size={16} />
            </span>
            <b>{tr("Acceso seguro", "Secure access")}</b>
          </div>
          <div className="login-point">
            <span className="point-ico">
              <IconShieldCheck size={16} />
            </span>
            <b>{tr("Permisos según tu rol", "Role-based permissions")}</b>
          </div>
          <div className="login-point">
            <span className="point-ico">
              <IconLock size={16} />
            </span>
            <b>{tr("Datos privados", "Private data")}</b>
          </div>
        </div>
      </section>
      <section className="login-card">
        <div className="login-mobile-logo logo-brand">
          <img
            className="logo-image logo-light"
            src="/oxxus-logo-light-v2.png"
            alt="OXXUS Credit Solutions"
          />
          <img
            className="logo-image logo-dark"
            src="/oxxus-logo-dark-v2.png"
            alt="OXXUS Credit Solutions"
          />
        </div>
        <div className="login-theme-row">
          <LanguageToggle
            language={language}
            onChange={onLanguageChange}
          />
          <ThemeToggle />
          <div>
            <p className="eyebrow">{tr("PORTAL DEL EQUIPO", "TEAM PORTAL")}</p>
            <h2>
              {mode === "login"
                ? tr("Iniciar sesión", "Sign in")
                : tr("Crear contraseña", "Create password")}
            </h2>
            <p>
              {mode === "login"
                ? tr("Entra con tu correo y contraseña.", "Use your email and password.")
                : tr("Te enviaremos un enlace seguro para definir tu clave.", "We will email you a secure link to set your password.")}
            </p>
          </div>
        </div>
        <div className="auth-tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => changeMode("login")}
          >
            {tr("Ya tengo contraseña", "I have a password")}
          </button>
          <button
            className={mode === "create" ? "active" : ""}
            onClick={() => changeMode("create")}
          >
            {tr("Crear contraseña", "Create password")}
          </button>
        </div>
        {mode === "login" ? (
          <form onSubmit={submit}>
            <label>
              {tr("Correo electrónico", "Email")}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              {tr("Contraseña", "Password")}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? tr("Procesando…", "Processing…") : tr("Entrar al sistema", "Sign in")}
            </button>
          </form>
        ) : (
          <form onSubmit={sendPasswordLink}>
            <label>
              {tr("Correo autorizado", "Authorized email")}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={tr("Correo que recibió la invitación", "Email that received the invite")}
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? tr("Enviando…", "Sending…") : tr("Enviarme el enlace para crear mi clave", "Email me a password setup link")}
            </button>
          </form>
        )}
        {message && (
          <p className="login-message" role="status">
            {message}
          </p>
        )}
        <small className="privacy-note">
          {tr("Solo usuarios previamente autorizados por OXXUS.", "Only users previously authorized by OXXUS.")}
        </small>
      </section>
    </main>
  );
}
function PasswordSetup({
  onDone,
  language,
  onLanguageChange,
}: {
  onDone: () => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
}) {
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setMessage(tr("La contraseña debe tener al menos 8 caracteres.", "Password must be at least 8 characters."));
      return;
    }
    if (password !== confirm) {
      setMessage(tr("Las contraseñas no coinciden.", "Passwords do not match."));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error)
      setMessage(tr("No pudimos guardar la contraseña. Solicita un enlace nuevo.", "We could not save the password. Request a new link."));
    else {
      setMessage(
        tr("Contraseña creada correctamente. Continúa con tus datos y reporte.", "Password created. Continue with your details and report."),
      );
      window.history.replaceState({}, document.title, window.location.pathname);
      window.setTimeout(onDone, 700);
    }
    setBusy(false);
  }
  return (
    <main className="login-shell">
      <section className="login-brand">
        <div className="brand logo-brand">
          <img
            className="logo-image logo-light"
            src="/oxxus-logo-light-v2.png"
            alt="OXXUS Credit Solutions"
          />
          <img
            className="logo-image logo-dark"
            src="/oxxus-logo-dark-v2.png"
            alt="OXXUS Credit Solutions"
          />
        </div>
        <h1>{tr("Crea una contraseña segura para tu cuenta.", "Create a secure password for your account.")}</h1>
        <p>{tr("Después completarás tus datos y subirás tu reporte de crédito.", "Next you will complete your details and upload your credit report.")}</p>
        <div className="login-points">
          <div className="login-point">
            <span className="point-ico">
              <IconLock size={16} />
            </span>
            <b>{tr("Clave protegida", "Protected password")}</b>
          </div>
          <div className="login-point">
            <span className="point-ico">
              <IconShieldCheck size={16} />
            </span>
            <b>{tr("Acceso por invitación", "Invite-only access")}</b>
          </div>
          <div className="login-point">
            <span className="point-ico">
              <IconCheck size={16} />
            </span>
            <b>{tr("Siguiente: tu expediente", "Next: your case file")}</b>
          </div>
        </div>
      </section>
      <section className="login-card">
        <div className="login-mobile-logo logo-brand">
          <img
            className="logo-image logo-light"
            src="/oxxus-logo-light-v2.png"
            alt="OXXUS Credit Solutions"
          />
          <img
            className="logo-image logo-dark"
            src="/oxxus-logo-dark-v2.png"
            alt="OXXUS Credit Solutions"
          />
        </div>
        <div className="login-theme-row">
          <LanguageToggle
            language={language}
            onChange={onLanguageChange}
          />
          <ThemeToggle />
          <div>
            <p className="eyebrow">{tr("ACTIVACIÓN DE CUENTA", "ACCOUNT ACTIVATION")}</p>
            <h2>{tr("Definir contraseña", "Set password")}</h2>
            <p>
              {tr("Usa al menos 8 caracteres y guarda tu clave en un lugar seguro.", "Use at least 8 characters and store your password safely.")}
            </p>
          </div>
        </div>
        <form onSubmit={save}>
          <label>
            {tr("Nueva contraseña", "New password")}
            <input
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label>
            {tr("Confirmar contraseña", "Confirm password")}
            <input
              type="password"
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? tr("Guardando…", "Saving…") : tr("Crear contraseña y continuar", "Create password and continue")}
          </button>
        </form>
        {message && (
          <p className="login-message" role="status">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
function EmptyModule({ title, text }: { title: string; text: string }) {
  return (
    <div className="module">
      <section className="module-hero">
        <div>
          <p className="eyebrow">CENTRO DE OPERACIONES</p>
          <h2>{title}</h2>
          <p>Organización por cliente y caso.</p>
        </div>
      </section>
      <section className="panel empty-state">
        <span>✓</span>
        <h3>Módulo preparado</h3>
        <p>{text}</p>
      </section>
    </div>
  );
}
function WebCollaboratorDashboard({
  language,
}: {
  language: Language;
}) {
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">{tr("ENTORNO DE COLABORACIÓN", "COLLABORATION SPACE")}</p>
          <h2>{tr("Espacio para construir y probar OXXUS", "A space to build and test OXXUS")}</h2>
          <p>
            {tr(
              "Tu cuenta puede validar la interfaz y consultar recursos generales sin acceder a información privada de clientes.",
              "Your account can validate the interface and browse general resources without accessing private client data.",
            )}
          </p>
        </div>
      </section>
      <section className="trust-rail">
        <article className="trust-item">
          <span className="trust-ico">
            <IconCheck size={18} />
          </span>
          <div>
            <b>{tr("Acceso seguro", "Secure access")}</b>
            <span>{tr("Rol limitado para colaboración de interfaz.", "Limited role for interface collaboration.")}</span>
          </div>
        </article>
        <article className="trust-item">
          <span className="trust-ico">
            <IconLock size={18} />
          </span>
          <div>
            <b>{tr("Sin datos privados", "No private data")}</b>
            <span>{tr("No incluye clientes, reportes ni administración.", "No clients, reports, or admin access.")}</span>
          </div>
        </article>
        <article className="trust-item">
          <span className="trust-ico">
            <IconChart size={18} />
          </span>
          <div>
            <b>{tr("Documentos generales", "General documents")}</b>
            <span>{tr("Puedes consultar la biblioteca de modelos.", "You can browse the letter library.")}</span>
          </div>
        </article>
      </section>
      <section className="panel empty-state">
        <span>✓</span>
        <h3>{tr("Colaborador del sitio web", "Website collaborator")}</h3>
        <p>
          {tr(
            "Puedes ayudar a mejorar el diseño y funcionamiento. No tienes acceso a clientes, reportes de crédito, disputas, archivos privados, invitaciones, usuarios ni configuraciones administrativas.",
            "You can help improve design and functionality. You do not have access to clients, credit reports, disputes, private files, invitations, users, or admin settings.",
          )}
        </p>
      </section>
    </>
  );
}
export default function Home() {
  const [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(false),
    [recovery, setRecovery] = useState(false),
    [active, setActive] = useState("Dashboard"),
    [selectedCase, setSelectedCase] = useState<CaseRecord | null>(null),
    [cases, setCases] = useState<CaseRecord[]>([]),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [profile, setProfile] = useState<Profile | null>(null),
    [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [forceOnboarding, setForceOnboarding] = useState(false),
    [language, setLanguage] = useState<Language>("es"),
    [temporaryAccessNotice, setTemporaryAccessNotice] = useState(""),
    [previewRole, setPreviewRole] = useState<string | null>(null);
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  const temporaryAccessUrl =
    "https://oxxus-credit-solutions-business.oxxus-org-6997.chatgpt.site/";
  async function copyTemporaryAccessLink() {
    try {
      await navigator.clipboard.writeText(temporaryAccessUrl);
      setTemporaryAccessNotice(
        tr("Enlace temporal copiado.", "Temporary link copied."),
      );
    } catch {
      window.prompt(
        tr("Copia este enlace temporal:", "Copy this temporary link:"),
        temporaryAccessUrl,
      );
    }
  }
  function shareTemporaryAccessOnWhatsApp() {
    const text = tr(
      "Hola, ya puedes acceder a tu portal OXXUS desde este enlace temporal seguro:",
      "Hello, you can now access your secure temporary OXXUS portal here:",
    );
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${text}\n${temporaryAccessUrl}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }
  function changeLanguage(next: Language) {
    setLanguage(next);
    window.localStorage.setItem("oxxus-language", next);
    document.documentElement.lang = next;
  }
  useEffect(() => {
    const saved = window.localStorage.getItem("oxxus-language");
    if (saved === "en" || saved === "es") {
      setLanguage(saved);
      document.documentElement.lang = saved;
    }
  }, []);
  function signOut() {
    if (isNeonDemo) {
      clearNeonSession();
      setSession(null);
      setProfile(null);
      setProfiles([]);
      setCases([]);
      return;
    }
    void supabase.auth.signOut();
  }
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("type=invite")) {
      setRecovery(true);
      if (hash.includes("type=invite")) setForceOnboarding(true);
    }
    if (isNeonDemo) {
      setSession(getNeonSession());
      setAuthReady(true);
      return;
    }
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: l } = supabase.auth.onAuthStateChange((event, s) => {
      if (
        event === "PASSWORD_RECOVERY" ||
        (event === "SIGNED_IN" && window.location.hash.includes("type=invite"))
      ) {
        setRecovery(true);
        if (window.location.hash.includes("type=invite"))
          setForceOnboarding(true);
      }
      setSession(s);
    });
    return () => l.subscription.unsubscribe();
  }, []);
  async function loadData() {
    if (!session) return;
    setLoading(true);
    setError("");
    if (isNeonDemo) {
      const result = await neonLoadDashboard();
      if (result.error) {
        setError(
          "No pudimos cargar los casos. Cierra la sesión y vuelve a entrar.",
        );
      } else {
        setCases(result.cases as CaseRecord[]);
      }
      setProfiles(result.profiles);
      const nextProfile =
        result.profiles.find((x) => x.id === session.user.id) ?? null;
      setProfile(nextProfile);
      setOnboarding(null);
      setLoading(false);
      return;
    }
    const [cr, pr] = await Promise.all([
      supabase.rpc("get_dashboard_cases"),
      supabase
        .from("profiles")
        .select("id,full_name,role,client_id")
        .order("full_name"),
    ]);
    if (cr.error)
      setError(
        "No pudimos cargar los casos. Cierra la sesión y vuelve a entrar.",
      );
    else setCases((cr.data ?? []) as unknown as CaseRecord[]);
    let nextProfile: Profile | null = null;
    if (!pr.error) {
      const p = (pr.data ?? []) as Profile[];
      setProfiles(p);
      nextProfile = p.find((x) => x.id === session.user.id) ?? null;
      setProfile(nextProfile);
    }
    if ((nextProfile ?? profile)?.role === "client" || !nextProfile) {
      const { data: status } = await supabase.rpc("client_onboarding_status");
      if (status) setOnboarding(status as OnboardingStatus);
    } else setOnboarding(null);
    setLoading(false);
  }
  useEffect(() => {
    if (session) void loadData();
    else setLoading(false);
  }, [session]);
  useEffect(() => {
    if (
      profile?.role === "client" &&
      (onboarding?.needs_onboarding || forceOnboarding)
    )
      setActive("Análisis de reporte");
  }, [profile?.role, onboarding?.needs_onboarding, forceOnboarding]);
  const clients = useMemo(() => cases.map((x) => x.clients), [cases]),
    accounts = useMemo(
      () =>
        cases.flatMap((c) => c.credit_accounts.map((a) => ({ ...a, case: c }))),
      [cases],
    ),
    userName =
      profile?.full_name ||
      session?.user.email?.split("@")[0] ||
      "Equipo OXXUS",
    isRealAdmin = profile?.role === "admin",
    viewRole = (isRealAdmin && previewRole) || profile?.role || "",
    isPreviewing = Boolean(
      isRealAdmin && previewRole && previewRole !== profile?.role,
    ),
    role =
      (language === "en" ? roleLabelEnglish : roleLabel)[
        viewRole || profile?.role || ""
      ] ?? tr("Usuario autorizado", "Authorized user"),
    levels = [1, 2, 3, 4].map((n) => cases.filter((c) => c.level === n).length),
    isClient = viewRole === "client",
    isWebCollaborator = viewRole === "web_collaborator",
    needsOnboarding = !!(
      isClient &&
      !isPreviewing &&
      (onboarding?.needs_onboarding || forceOnboarding)
    );
  if (!authReady)
    return <main className="loading-screen">Preparando tu acceso…</main>;
  if (!isNeonDemo && !isSupabaseConfigured)
    return (
      <main className="loading-screen">
        La conexión segura todavía no está configurada.
      </main>
    );
  if (recovery && !isNeonDemo)
    return (
      <PasswordSetup
        language={language}
        onLanguageChange={changeLanguage}
        onDone={() => {
          setRecovery(false);
          setForceOnboarding(true);
          setActive("Análisis de reporte");
          void supabase.auth
            .getSession()
            .then(({ data }) => setSession(data.session));
        }}
      />
    );
  if (!session)
    return (
      <Login
        language={language}
        onLanguageChange={changeLanguage}
        onSignedIn={setSession}
      />
    );
  function view() {
    if (isClient && needsOnboarding) {
      const clientId = onboarding?.client_id || profile?.client_id;
      if (!clientId)
        return (
          <EmptyModule
            title="Expediente no vinculado"
            text="Tu invitación aún no está vinculada a un expediente. Contacta a OXXUS."
          />
        );
      return (
        <ClientOnboarding
          clientId={clientId}
          language={language}
          onCompleted={async () => {
            setForceOnboarding(false);
            await loadData();
            setActive("Análisis de reporte");
          }}
        />
      );
    }
    if (active === "Análisis de reporte") {
      if (isClient)
        return cases[0] ? (
          <ClientCreditReportPortal
            caseRecord={cases[0]}
            onUpdated={loadData}
            language={language}
          />
        ) : (
          <EmptyModule title="Preparando expediente" text="Tu cuenta está activa. Contacta a OXXUS si todavía no aparece la carga de reportes." />
        );
      return (
        <NewCase cases={cases} onSaved={loadData} language={language} />
      );
    }
    if (active === "Enviar invitación")
      return viewRole === "admin" && profile ? (
        <InviteCenter
          viewer={profile}
          profiles={profiles}
          clients={clients}
          standalone
          language={language}
        />
      ) : viewRole === "admin" ? (
        <EmptyModule
          title={tr("Cargando…", "Loading…")}
          text={tr(
            "Confirmando tu perfil de administrador.",
            "Confirming your admin profile.",
          )}
        />
      ) : (
        <EmptyModule
          title="Acceso restringido"
          text="Solo el administrador puede usar esta pantalla."
        />
      );
    if (active === "Clientes")
      return (
        <Module
          title="Clientes"
          subtitle="Registro único de expedientes en la base de datos."
          columns={["CLIENTE", "CONTACTO", "CASO", "REPORTE", "ESTADO"]}
          rows={cases.map((c) => [
            fullName(c.clients),
            c.clients.email || "Por confirmar",
            c.case_number,
            c.has_report || (c.credit_reports?.length ?? 0) > 0
              ? "Cargado"
              : "Pendiente",
            c.level
              ? "Plan preparado"
              : c.has_report
                ? "Pendiente de análisis"
                : "Esperando cliente",
          ])}
          onRow={(i) => setSelectedCase(cases[i])}
        />
      );
    if (active === "Ayuda y recursos")
      return <CreditReportHelp language={language} />;
    if (active === "Informe diario")
      return isClient ? (
        <EmptyModule title="Acceso restringido" text="La bitacora de trabajo esta disponible para el equipo OXXUS." />
      ) : isNeonDemo ? (
        <EmptyModule
          title={tr("Demo portafolio", "Portfolio demo")}
          text={tr(
            "El informe diario usa Storage/RPC de Supabase y no está activo en la demo Neon. El Dashboard y los casos sí usan Neon.",
            "The daily report uses Supabase Storage/RPC and is inactive in the Neon demo. Dashboard and cases use Neon.",
          )}
        />
      ) : (
        <WorkdayReport viewer={profile!} />
      );
    if (active === "Usuarios y roles")
      return isClient ? (
        <EmptyModule
          title="Acceso restringido"
          text="Tu cuenta solamente puede consultar tu propio expediente."
        />
      ) : profile ? (
        <InviteCenter
          viewer={profile}
          profiles={profiles}
          clients={clients}
          language={language}
        />
      ) : (
        <EmptyModule
          title={tr("Cargando…", "Loading…")}
          text={tr(
            "Confirmando tu perfil para abrir usuarios y roles.",
            "Confirming your profile to open users and roles.",
          )}
        />
      );
    if (active === "Documentos")
      return <LetterLibrary language={language} />;
    if (active === "Disputas") {
      if (isClient || isWebCollaborator) {
        return (
          <EmptyModule
            title={tr("Acceso restringido", "Restricted access")}
            text={tr(
              "Las disputas solo estan disponibles para agentes y administracion.",
              "Disputes are only available for agents and administration.",
            )}
          />
        );
      }
      const prioritized = [...cases].sort((a, b) => {
        const weight = (c: (typeof cases)[number]) =>
          (c.credit_accounts || []).reduce((sum, acc) => {
            const badge = badgeForAccount(acc);
            if (badge === "review") return sum + 10;
            if (badge === "disputable") return sum + 3;
            return sum;
          }, 0);
        return weight(b) - weight(a);
      });
      return (
        <DisputesByClient
          cases={prioritized}
          language={language}
          onOpen={(index) => {
            const found = prioritized[index];
            if (found) setSelectedCase(found);
          }}
        />
      );
    }
    if (active === "Asistente OXXUS") {
      if (isClient || isWebCollaborator) {
        return (
          <EmptyModule
            title={tr("Acceso restringido", "Restricted access")}
            text={tr(
              "El asistente OXXUS es solo para agentes y administracion.",
              "OXXUS Assist is only for agents and administration.",
            )}
          />
        );
      }
      return (
        <AgentAssistHub
          cases={cases}
          viewerRole={viewRole}
          language={language}
          onRefresh={loadData}
          onOpenCase={(caseId) => {
            const found = cases.find((c) => c.id === caseId);
            if (found) setSelectedCase(found);
          }}
        />
      );
    }
    return (
      <EmptyModule
        title="Documentos"
        text="Biblioteca de modelos y archivos generales."
      />
    );
  }
  const finalNav = isClient
    ? needsOnboarding
      ? ["Análisis de reporte"]
      : [
          "Dashboard",
          "Análisis de reporte",
          "Ayuda y recursos",
          "Documentos",
        ]
    : isWebCollaborator
      ? ["Dashboard", "Informe diario", "Ayuda y recursos", "Documentos"]
      : viewRole === "admin"
        ? nav
        : nav.filter((x) => x !== "Enviar invitación");
  const mobileNavCount = finalNav.length + 1; // + Salir
  const navLabelFull = (x: string) => {
    if (x === "Análisis de reporte" && isClient) {
      return needsOnboarding
        ? tr("Completar expediente", "Complete case file")
        : tr("Mi plan", "My plan");
    }
    return language === "en" ? navEnglish[x] || x : x;
  };
  const navLabelShort = (x: string) => {
    if (x === "Análisis de reporte" && isClient) {
      return needsOnboarding
        ? tr("Completar", "Complete")
        : tr("Mi plan", "My plan");
    }
    return language === "en"
      ? navShortEn[x] || navEnglish[x] || x
      : navShortEs[x] || x;
  };
  return (
    <main
      className="app-shell"
      data-nav-count={mobileNavCount}
      data-nav-mode={mobileNavCount > 6 ? "scroll" : "fit"}
    >
      {!isClient && !isNeonDemo && <WorkdayTracker section={active} />}
      <aside className="sidebar">
        <div className="brand logo-brand">
          <img
            className="logo-image logo-light"
            src="/oxxus-logo-light-v2.png"
            alt="OXXUS Credit Solutions"
          />
          <img
            className="logo-image logo-dark"
            src="/oxxus-logo-dark-v2.png"
            alt="OXXUS Credit Solutions"
          />
        </div>
        <nav className={mobileNavCount > 6 ? "nav-scroll" : "nav-fit"}>
          {finalNav.map((x) => (
            <button
              key={x}
              type="button"
              className={active === x ? "nav-item active" : "nav-item"}
              title={navLabelFull(x)}
              onClick={() => {
                if (needsOnboarding && x !== "Análisis de reporte") return;
                setActive(x);
              }}
            >
              <NavIcon name={x} />
              <span className="nav-label nav-label-full">{navLabelFull(x)}</span>
              <span className="nav-label nav-label-short">{navLabelShort(x)}</span>
            </button>
          ))}
          <button
            type="button"
            className="nav-item mobile-nav-logout"
            aria-label={tr("Cerrar sesión", "Log out")}
            title={tr("Cerrar sesión", "Log out")}
            onClick={signOut}
          >
            <span className="nav-ico">
              <IconLogout size={16} />
            </span>
            <span className="nav-label nav-label-full">
              {tr("Salir", "Log out")}
            </span>
            <span className="nav-label nav-label-short">
              {tr("Salir", "Exit")}
            </span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{initials(userName)}</div>
          <div>
            <b>{userName}</b>
            <small>{role}</small>
          </div>
          <button
            aria-label={tr("Cerrar sesión", "Log out")}
            title={tr("Cerrar sesión", "Log out")}
            onClick={signOut}
          >
            <IconLogout size={16} />
          </button>
        </div>
        <p className="app-version" title="Comercial.OXXUS.Edjouner.Build">
          {oxxusVersionLabel()}
        </p>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p>
              {isClient
                ? tr("PORTAL DEL CLIENTE", "CLIENT PORTAL")
                : isWebCollaborator
                  ? tr("COLABORACIÓN", "COLLABORATION")
                  : tr("ADMINISTRACIÓN", "ADMINISTRATION")}
            </p>
            <h1>
              {active === "Análisis de reporte" && isClient
                ? tr("Completar expediente", "Complete case file")
                : language === "en"
                  ? navEnglish[active] || active
                  : active}
            </h1>
          </div>
          <div className="top-actions">
            {isRealAdmin && (
              <label className="role-preview-select">
                <span>{tr("Ver como", "View as")}</span>
                <select
                  value={previewRole || profile?.role || "admin"}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPreviewRole(
                      next === (profile?.role || "") ? null : next,
                    );
                    setActive("Dashboard");
                  }}
                  aria-label={tr(
                    "Ver interfaz como rol",
                    "View interface as role",
                  )}
                >
                  <option value="admin">
                    {tr("Administrador", "Administrator")}
                  </option>
                  <option value="repair_agent">
                    {tr("Agente de reparación", "Credit repair agent")}
                  </option>
                  <option value="client">{tr("Cliente", "Client")}</option>
                  <option value="web_collaborator">
                    {tr("Colaborador web", "Web collaborator")}
                  </option>
                </select>
              </label>
            )}
            <LanguageToggle
              language={language}
              onChange={changeLanguage}
            />
            <ThemeToggle />
            <span className="backend online">
              <i />
              {isNeonDemo
                ? tr("Demo Neon · datos ficticios", "Neon demo · sample data")
                : tr("Datos en vivo", "Live data")}
            </span>
            <button
              className="icon-button desktop-refresh"
              aria-label={tr("Actualizar", "Refresh")}
              onClick={() => void loadData()}
            >
              <IconRefresh size={16} />
            </button>
            <div className="avatar pale">{initials(userName)}</div>
            <span
              className="app-version app-version-mobile"
              title="Comercial.OXXUS.Edjouner.Build"
            >
              {oxxusVersionLabel()}
            </span>
          </div>
        </header>
        <div className="content">
          {isRealAdmin && isPreviewing && (
            <div className="role-preview-banner" role="status">
              <div>
                <b>{tr("Vista previa de rol", "Role preview")}</b>
                <span>
                  {tr(
                    "Estás viendo la interfaz como",
                    "You are viewing the interface as",
                  )}{" "}
                  <em>
                    {(language === "en" ? roleLabelEnglish : roleLabel)[
                      previewRole || ""
                    ] || previewRole}
                  </em>
                  .{" "}
                  {tr(
                    "Los datos y permisos reales siguen siendo de administrador.",
                    "Real data and permissions remain administrator-level.",
                  )}
                </span>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setPreviewRole(null);
                  setActive("Dashboard");
                }}
              >
                {tr("Salir de vista previa", "Exit preview")}
              </button>
            </div>
          )}
          {loading ? (
              <section className="panel loading-panel">
              {tr("Cargando información real…", "Loading live data…")}
            </section>
          ) : error ? (
            <section className="panel error-panel">{error}</section>
          ) : needsOnboarding || active !== "Dashboard" ? (
            view()
          ) : isWebCollaborator ? (
            <WebCollaboratorDashboard language={language} />
          ) : (
            <>
              <section className="welcome">
                <div>
                  <p className="eyebrow">
                    {isClient
                      ? tr("TU PROCESO OXXUS", "YOUR OXXUS JOURNEY")
                      : tr("CENTRO DE OPERACIONES", "OPERATIONS CENTER")}
                  </p>
                  <h2>
                    {tr("Buenos días", "Welcome")}, {userName.split(" ")[0]}
                  </h2>
                  <p>
                    {isClient
                      ? tr(
                          "Aquí ves tu avance, tu próxima acción y el estado de tu caso.",
                          "Here you can see your progress, next action, and case status.",
                        )
                      : tr(
                          "Empieza por la cola de trabajo. El detalle queda en cada expediente.",
                          "Start with the work queue. Details live inside each case file.",
                        )}
                  </p>
                </div>
                {!isClient && (
                  <div className="welcome-actions">
                    <button
                      className="primary"
                      onClick={() => setActive("Análisis de reporte")}
                    >
                      <IconPlus size={16} />
                      <span className="btn-label">
                        {tr("Analizar reporte", "Analyze report")}
                      </span>
                    </button>
                    {viewRole === "admin" && (
                      <button
                        className="secondary"
                        onClick={() => setActive("Enviar invitación")}
                      >
                        <span className="btn-label">
                          {tr("Enviar invitación", "Send invitation")}
                        </span>
                      </button>
                    )}
                  </div>
                )}
                {isClient && cases[0] && (
                  <div className="welcome-actions">
                    <button
                      className="primary"
                      onClick={() => setSelectedCase(cases[0])}
                    >
                      {tr("Ver mi expediente", "View my case file")}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setActive("Análisis de reporte")}
                    >
                      {tr("Ver mi plan", "View my plan")}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        setActive("Análisis de reporte");
                        window.setTimeout(() => {
                          document
                            .getElementById("actualizar-credito")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                        }, 120);
                      }}
                    >
                      {tr("Actualizar crédito", "Update credit")}
                    </button>
                  </div>
                )}
              </section>

              {isClient ? (
                cases[0] ? (
                  <>
                    <RepairProgressBar
                      caseRecord={{
                        level: cases[0].level,
                        current_week: cases[0].current_week,
                        duration_weeks: cases[0].duration_weeks,
                        next_action: cases[0].next_action,
                        has_report:
                          cases[0].has_report ||
                          (cases[0].credit_reports?.length ?? 0) > 0,
                        reportCount: cases[0].credit_reports?.length ?? 0,
                        status: cases[0].status,
                      }}
                      language={language}
                    />
                    <section
                      className="client-focus"
                      aria-label={tr("Resumen de tu caso", "Your case summary")}
                    >
                      <article className="client-focus-card next">
                        <p className="eyebrow">
                          {tr("PRÓXIMA ACCIÓN", "NEXT ACTION")}
                        </p>
                        <h3>
                          {localizeNextAction(cases[0].next_action, language)}
                        </h3>
                        <p>
                          {tr(
                            `Caso ${cases[0].case_number} · Semana ${cases[0].current_week}${cases[0].duration_weeks ? ` de ${cases[0].duration_weeks}` : ""}`,
                            `Case ${cases[0].case_number} · Week ${cases[0].current_week}${cases[0].duration_weeks ? ` of ${cases[0].duration_weeks}` : ""}`,
                          )}
                        </p>
                        <button
                          className="primary"
                          onClick={() => setSelectedCase(cases[0])}
                        >
                          {tr("Abrir el expediente", "Open case file")}
                        </button>
                      </article>
                      <article className="client-focus-card">
                        <p className="eyebrow">{tr("TU CASO", "YOUR CASE")}</p>
                        <h3>{cases[0].case_number}</h3>
                        <p>
                          {cases[0].level
                            ? tr(
                                `Nivel ${cases[0].level} · Activo`,
                                `Level ${cases[0].level} · Active`,
                              )
                            : tr(
                                "Pendiente de análisis",
                                "Pending analysis",
                              )}
                        </p>
                        <small>
                          {tr("Cuentas a revisar", "Accounts to review")}:{" "}
                          <b>{accounts.length}</b>
                        </small>
                      </article>
                      <article className="client-focus-card scores">
                        <p className="eyebrow">{tr("PUNTAJES", "SCORES")}</p>
                        <div className="client-score-row">
                          {(
                            ["transunion", "experian", "equifax"] as const
                          ).map((bureau) => {
                            const score = cases[0].credit_reports?.[0]
                              ?.credit_scores?.find(
                                (s) => s.bureau === bureau,
                              )?.score;
                            return (
                              <div key={bureau}>
                                <small>{bureauLabel[bureau]}</small>
                                <strong>{score ?? "—"}</strong>
                              </div>
                            );
                          })}
                        </div>
                        <button
                          className="secondary"
                          onClick={() => {
                            setActive("Análisis de reporte");
                            window.setTimeout(() => {
                              document
                                .getElementById("actualizar-credito")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                });
                            }, 120);
                          }}
                        >
                          {tr("Actualizar crédito", "Update credit")}
                        </button>
                      </article>
                    </section>
                  </>
                ) : (
                  <section className="panel">
                    <h3>
                      {tr(
                        "Tu expediente se está preparando",
                        "Your case is being prepared",
                      )}
                    </h3>
                    <p>
                      {tr(
                        "Cuando el equipo registre tu caso, verás aquí el avance y la próxima acción.",
                        "When the team registers your case, you will see progress and the next action here.",
                      )}
                    </p>
                  </section>
                )
              ) : (
                <>
                  <section className="panel attention work-queue">
                    <div className="panel-heading">
                      <div>
                        <h3>{tr("Cola de trabajo", "Work queue")}</h3>
                        <p>
                          {tr(
                            "Lo más urgente ahora. Abre el expediente para el detalle.",
                            "What needs attention now. Open the case for details.",
                          )}
                        </p>
                      </div>
                      <button onClick={() => setActive("Clientes")}>
                        {tr("Ver clientes →", "View clients →")}
                      </button>
                    </div>
                    <div className="task-list">
                      {cases.slice(0, 6).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedCase(c)}
                        >
                          <span className="task-icon amber">
                            <IconAlert size={16} />
                          </span>
                          <span>
                            <b>
                              {localizeNextAction(c.next_action, language)}
                            </b>
                            <small>
                              {fullName(c.clients)} · {c.case_number}
                            </small>
                          </span>
                          <em>
                            {c.level
                              ? tr(
                                  `Semana ${c.current_week}`,
                                  `Week ${c.current_week}`,
                                )
                              : tr("Análisis", "Analysis")}
                          </em>
                          <i>
                            <IconChevron size={16} />
                          </i>
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="stats stats-compact">
                    <article>
                      <div className="stat-icon blue">
                        <IconUsers size={20} />
                      </div>
                      <div>
                        <p>{tr("CLIENTES ACTIVOS", "ACTIVE CLIENTS")}</p>
                        <strong>{clients.length}</strong>
                        <small>
                          {tr("En tu portafolio", "In your portfolio")}
                        </small>
                      </div>
                    </article>
                    <article>
                      <div className="stat-icon violet">
                        <IconSwap size={20} />
                      </div>
                      <div>
                        <p>
                          {tr("CUENTAS NEGATIVAS", "NEGATIVE ACCOUNTS")}
                        </p>
                        <strong>{accounts.length}</strong>
                        <small>{tr("Detectadas", "Detected")}</small>
                      </div>
                    </article>
                    <article>
                      <div className="stat-icon amber">
                        <IconAlert size={20} />
                      </div>
                      <div>
                        <p>{tr("PLANES LISTOS", "PLANS READY")}</p>
                        <strong>
                          {cases.filter((c) => c.level !== null).length}
                        </strong>
                        <small className="warn">
                          {tr("Confirmar envíos", "Confirm mailings")}
                        </small>
                      </div>
                    </article>
                    {viewRole === "admin" && (
                      <article>
                        <div className="stat-icon green">
                          <IconCheck size={20} />
                        </div>
                        <div>
                          <p>{tr("USUARIOS", "USERS")}</p>
                          <strong>{profiles.length}</strong>
                          <small className="up">
                            {tr("Autorizados", "Authorized")}
                          </small>
                        </div>
                      </article>
                    )}
                  </section>
                  <section className="panel cases">
                    <div className="panel-heading">
                      <div>
                        <h3>{tr("Casos recientes", "Recent cases")}</h3>
                        <p>
                          {tr(
                            "Resumen rápido. Usa la cola de arriba para priorizar.",
                            "Quick summary. Use the queue above to prioritize.",
                          )}
                        </p>
                      </div>
                      <button onClick={() => setActive("Clientes")}>
                        {tr("Ver todos →", "View all →")}
                      </button>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{tr("CLIENTE", "CLIENT")}</th>
                            <th>{tr("CASO", "CASE")}</th>
                            <th>{tr("NIVEL", "LEVEL")}</th>
                            <th>{tr("PROGRESO", "PROGRESS")}</th>
                            <th>
                              {tr("PRÓXIMA ACCIÓN", "NEXT ACTION")}
                            </th>
                            <th>{tr("ESTADO", "STATUS")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cases.slice(0, 8).map((c) => (
                            <tr
                              key={c.id}
                              className="clickable-row"
                              onClick={() => setSelectedCase(c)}
                            >
                              <td>
                                <div className="person blue-person">
                                  {initials(fullName(c.clients))}
                                </div>
                                <span>
                                  <b>{fullName(c.clients)}</b>
                                  <small>{scoresFor(c)}</small>
                                </span>
                              </td>
                              <td>
                                <span className="case-id">
                                  {c.case_number}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`level ${c.level ? `level${c.level}` : ""}`}
                                >
                                  {c.level
                                    ? tr(
                                        `Nivel ${c.level}`,
                                        `Level ${c.level}`,
                                      )
                                    : tr("Pendiente", "Pending")}
                                </span>
                              </td>
                              <td>
                                <div className="progress">
                                  <i
                                    style={{
                                      width: c.duration_weeks
                                        ? `${Math.min(100, (c.current_week / c.duration_weeks) * 100)}%`
                                        : "0%",
                                    }}
                                  />
                                  <small>
                                    {c.case_number}
                                    {" · "}
                                    {c.duration_weeks
                                      ? tr(
                                          `Semana ${c.current_week} de ${c.duration_weeks}`,
                                          `Week ${c.current_week} of ${c.duration_weeks}`,
                                        )
                                      : tr("Sin plan aún", "No plan yet")}
                                  </small>
                                </div>
                              </td>
                              <td>{c.next_action}</td>
                              <td>
                                <span className="status waiting">
                                  {c.level
                                    ? tr("Plan preparado", "Plan ready")
                                    : tr(
                                        "Pendiente de análisis",
                                        "Pending analysis",
                                      )}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
              {isRealAdmin && !isPreviewing && (
                <section className="temporary-access-card" aria-label="Acceso temporal para clientes">
                  <div>
                    <p className="eyebrow">ACCESO TEMPORAL PARA CLIENTES</p>
                    <h3>{tr("Comparte el portal mientras conectamos el dominio", "Share the portal while the domain is connected")}</h3>
                    <p>
                      {tr(
                        "Envía este acceso por WhatsApp o copia el enlace. Cada persona deberá iniciar sesión con sus propias credenciales.",
                        "Send this access through WhatsApp or copy the link. Each person must sign in with their own credentials.",
                      )}
                    </p>
                    {temporaryAccessNotice && <small className="temporary-access-notice">{temporaryAccessNotice}</small>}
                  </div>
                  <div className="temporary-access-actions">
                    <button className="secondary" onClick={() => void copyTemporaryAccessLink()}>
                      {tr("Copiar enlace", "Copy link")}
                    </button>
                    <button className="secondary" onClick={shareTemporaryAccessOnWhatsApp}>
                      {tr("Enviar por WhatsApp", "Send via WhatsApp")}
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </section>
      {selectedCase && (
        <ClientFile
          caseRecord={selectedCase}
          viewerRole={profile?.role || "client"}
          language={language}
          onClose={() => setSelectedCase(null)}
          onUpdated={() => void loadData()}
        />
      )}
    </main>
  );
}
