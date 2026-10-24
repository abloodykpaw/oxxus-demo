"use client";

import { IconCheck, IconDownload, IconLock, IconUpload } from "./icons";
import { PDF_ACCEPT, pdfIntakeError } from "./uploadValidation";
import {
  ANNUAL_CREDIT_REPORT_URL,
  CREDIT_KARMA_URL,
  CREDIT_UPDATE_PRIVACY,
  IDENTITYIQ_URL,
  localizeSourceField,
} from "./creditUpdateSources";
import "./credit-report-help.css";

export { ANNUAL_CREDIT_REPORT_URL } from "./creditUpdateSources";
export const CREDIT_REPORT_TUTORIAL_URL_ES =
  "/oxxus-tutorial-reportes-credito.es.mp4";
export const CREDIT_REPORT_TUTORIAL_URL_EN =
  "/oxxus-tutorial-reportes-credito.en.mp4";
/** @deprecated Prefer language-specific URLs */
export const CREDIT_REPORT_TUTORIAL_URL = CREDIT_REPORT_TUTORIAL_URL_ES;

export function CreditReportTutorial({
  compact = false,
  language = "es",
}: {
  compact?: boolean;
  language?: "es" | "en";
}) {
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  const videoSrc =
    language === "en"
      ? CREDIT_REPORT_TUTORIAL_URL_EN
      : CREDIT_REPORT_TUTORIAL_URL_ES;
  return (
    <section
      className={compact ? "panel tutorial-card compact" : "panel tutorial-card"}
    >
      <div className="tutorial-video">
        <video
          key={videoSrc}
          controls
          playsInline
          preload="metadata"
          lang={language === "es" ? "es" : "en"}
          aria-label={tr(
            "Tutorial OXXUS para obtener reportes de credito",
            "OXXUS tutorial to get credit reports",
          )}
        >
          <source src={videoSrc} type="video/mp4" />
          {tr(
            "Tu navegador no puede reproducir este video.",
            "Your browser cannot play this video.",
          )}
        </video>
      </div>
      <div className="tutorial-copy">
        <p className="eyebrow">
          {tr("VIDEO TUTORIAL OXXUS", "OXXUS VIDEO TUTORIAL")}
        </p>
        <h3>
          {tr(
            "Como obtener y enviar tus reportes",
            "How to get and send your reports",
          )}
        </h3>
        <p>
          {tr(
            "Mira este video antes de solicitar, descargar o subir un reporte para analisis. Puedes pausarlo y continuar paso a paso desde tu telefono.",
            "Watch this video before requesting, downloading, or uploading a report for analysis. You can pause and continue step by step from your phone.",
          )}
        </p>
        <ol className="tutorial-steps">
          <li>
            {tr(
              "Entra a AnnualCreditReport.com (sitio oficial).",
              "Go to AnnualCreditReport.com (official site).",
            )}
          </li>
          <li>
            {tr(
              "Selecciona Experian, Equifax y TransUnion.",
              "Select Experian, Equifax, and TransUnion.",
            )}
          </li>
          <li>
            {tr(
              "Verifica tu identidad en el sitio del buró.",
              "Verify your identity on the bureau website.",
            )}
          </li>
          <li>
            {tr(
              "Descarga cada reporte en PDF.",
              "Download each report as a PDF.",
            )}
          </li>
          <li>
            {tr(
              "Sube los PDF en OXXUS (un archivo por buró).",
              "Upload the PDFs in OXXUS (one file per bureau).",
            )}
          </li>
          <li>
            {tr(
              "Pulsa Analiza mis documentos para enviarlos al Asistente OXXUS.",
              "Tap Analyze my documents to send them to OXXUS Assist.",
            )}
          </li>
        </ol>
      </div>
    </section>
  );
}

export default function CreditReportHelp({
  language = "es",
  compact = false,
}: {
  language?: "es" | "en";
  compact?: boolean;
}) {
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  return (
    <section className={compact ? "report-help compact" : "report-help"}>
      {!compact && (
        <header className="report-help-hero">
          <div>
            <p className="eyebrow">
              {tr("AYUDA Y RECURSOS", "HELP AND RESOURCES")}
            </p>
            <h2>
              {tr(
                "Obtén tus reportes de crédito gratis",
                "Get your free credit reports",
              )}
            </h2>
            <p>
              {tr(
                "Te guiamos desde la fuente oficial hasta la carga segura en OXXUS.",
                "We guide you from the official source to secure upload in OXXUS.",
              )}
            </p>
          </div>
          <span>{tr("Fuente oficial", "Official source")}</span>
        </header>
      )}

      <div className="official-report-card">
        <div className="official-report-copy">
          <span className="official-icon">
            <IconDownload size={22} />
          </span>
          <div>
            <p className="eyebrow">ANNUALCREDITREPORT.COM</p>
            <h3>
              {tr(
                "Solicita Experian, Equifax y TransUnion",
                "Request Experian, Equifax, and TransUnion",
              )}
            </h3>
            <p>
              {tr(
                "Es el sitio autorizado para solicitar gratuitamente tus reportes. Cada buró entrega su reporte por separado.",
                "This is the authorized website for free credit reports. Each bureau provides a separate report.",
              )}
            </p>
          </div>
        </div>
        <a
          className="primary official-report-link"
          href={ANNUAL_CREDIT_REPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {tr(
            "Obtener mis 3 reportes gratis",
            "Get my 3 free reports",
          )}
        </a>
      </div>

      {!compact && (
        <>
          <div className="report-help-grid">
            <section className="panel report-instructions">
              <div className="panel-heading">
                <div>
                  <h3>{tr("Paso a paso", "Step by step")}</h3>
                  <p>
                    {tr(
                      "Guarda cada reporte antes de salir del sitio del buró.",
                      "Save each report before leaving the bureau website.",
                    )}
                  </p>
                </div>
              </div>
              <ol>
                <li>
                  <b>1</b>
                  <span>
                    <strong>{tr("Abre el sitio oficial", "Open the official site")}</strong>
                    <small>AnnualCreditReport.com</small>
                  </span>
                </li>
                <li>
                  <b>2</b>
                  <span>
                    <strong>{tr("Selecciona uno o más burós", "Select one or more bureaus")}</strong>
                    <small>Experian · Equifax · TransUnion</small>
                  </span>
                </li>
                <li>
                  <b>3</b>
                  <span>
                    <strong>{tr("Verifica tu identidad", "Verify your identity")}</strong>
                    <small>
                      {tr(
                        "Responde directamente en el sitio del buró.",
                        "Answer directly on the bureau website.",
                      )}
                    </small>
                  </span>
                </li>
                <li>
                  <b>4</b>
                  <span>
                    <strong>{tr("Descarga cada archivo", "Download each file")}</strong>
                    <small>
                      {tr("Preferiblemente en PDF.", "Preferably as a PDF.")}
                    </small>
                  </span>
                </li>
                <li>
                  <b>5</b>
                  <span>
                    <strong>{tr("Regresa y súbelos a OXXUS", "Return and upload them to OXXUS")}</strong>
                    <small>
                      {tr(
                        "Un archivo por cada buró.",
                        "One file for each bureau.",
                      )}
                    </small>
                  </span>
                </li>
              </ol>
            </section>

            <CreditReportTutorial language={language} />
          </div>

          <section className="panel report-resource-links">
            <div className="panel-heading">
              <div>
                <h3>{tr("Enlaces confiables", "Trusted links")}</h3>
                <p>
                  {tr(
                    "Reportes oficiales y herramientas de monitoreo de score. OXXUS nunca pide tus contraseñas.",
                    "Official reports and score monitoring tools. OXXUS never asks for your passwords.",
                  )}
                </p>
              </div>
            </div>
            <div className="resource-link-list">
              <a
                href={ANNUAL_CREDIT_REPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconCheck size={18} />
                <span>
                  <b>AnnualCreditReport.com</b>
                  <small>
                    {tr(
                      "Solicitud oficial de reportes gratuitos (PDF de buró)",
                      "Official free report request (bureau PDF)",
                    )}
                  </small>
                </span>
              </a>
              <a
                href={CREDIT_KARMA_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconCheck size={18} />
                <span>
                  <b>Credit Karma</b>
                  <small>
                    {tr(
                      "Monitoreo de score — captura y súbela a OXXUS",
                      "Score monitoring — screenshot and upload to OXXUS",
                    )}
                  </small>
                </span>
              </a>
              <a
                href={IDENTITYIQ_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconCheck size={18} />
                <span>
                  <b>IdentityIQ</b>
                  <small>
                    {tr(
                      "Monitoreo de score — captura y súbela a OXXUS",
                      "Score monitoring — screenshot and upload to OXXUS",
                    )}
                  </small>
                </span>
              </a>
              <a
                href="https://consumer.ftc.gov/articles/free-credit-reports"
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconCheck size={18} />
                <span>
                  <b>{tr("Comisión Federal de Comercio", "Federal Trade Commission")}</b>
                  <small>
                    {tr(
                      "Guía oficial sobre reportes gratuitos",
                      "Official guide to free credit reports",
                    )}
                  </small>
                </span>
              </a>
              <a
                href="https://www.identitytheft.gov/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconLock size={18} />
                <span>
                  <b>IdentityTheft.gov</b>
                  <small>
                    {tr(
                      "Ayuda oficial si reconoces cuentas que no son tuyas",
                      "Official help if you find accounts that are not yours",
                    )}
                  </small>
                </span>
              </a>
            </div>
            <div className="report-privacy-note report-privacy-inline">
              <IconLock size={18} />
              <div>
                <b>
                  {localizeSourceField(CREDIT_UPDATE_PRIVACY.title, language)}
                </b>
                <span>
                  {localizeSourceField(CREDIT_UPDATE_PRIVACY.body, language)}
                </span>
              </div>
            </div>
          </section>
        </>
      )}

      {compact && <CreditReportTutorial compact language={language} />}

      <div className="report-privacy-note">
        <IconLock size={18} />
        <div>
          <b>
            {localizeSourceField(CREDIT_UPDATE_PRIVACY.title, language)}
          </b>
          <span>
            {localizeSourceField(CREDIT_UPDATE_PRIVACY.body, language)}
          </span>
        </div>
      </div>
    </section>
  );
}

export function BureauUploadCard({
  bureau,
  file,
  onChange,
  onInvalid,
}: {
  bureau: "Experian" | "Equifax" | "TransUnion";
  file: File | null;
  onChange: (file: File | null) => void;
  onInvalid?: (message: string) => void;
}) {
  return (
    <label className={`bureau-upload ${file ? "complete" : ""}`}>
      <span className="bureau-upload-icon">
        {file ? <IconCheck size={19} /> : <IconUpload size={19} />}
      </span>
      <div>
        <b>{bureau}</b>
        <small>
          {file
            ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`
            : "Solo PDF · máximo 25 MB"}
        </small>
      </div>
      <em>{file ? "Cambiar" : "Subir PDF"}</em>
      <input
        type="file"
        accept={PDF_ACCEPT}
        required
        onChange={(event) => {
          const next = event.target.files?.[0] || null;
          if (!next) {
            onChange(null);
            return;
          }
          const err = pdfIntakeError(next, "es");
          if (err) {
            event.target.value = "";
            onInvalid?.(err);
            onChange(null);
            return;
          }
          onChange(next);
        }}
      />
    </label>
  );
}

export function BureauLogoUploadCard({
  bureau,
  logo,
  file,
  onChange,
  onInvalid,
}: {
  bureau: "Experian" | "Equifax" | "TransUnion";
  logo: string;
  file: File | null;
  onChange: (file: File | null) => void;
  onInvalid?: (message: string) => void;
}) {
  return (
    <label className={`bureau-logo-upload bureau-logo-${bureau.toLowerCase()} ${file ? "complete" : ""}`}>
      <span className="bureau-logo-image">
        <img src={logo} alt={`Logo de ${bureau}`} />
      </span>
      <strong>{file ? "PDF listo" : `Subir ${bureau}`}</strong>
      <small>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : "Solo PDF · máximo 25 MB"}</small>
      <em>{file ? <><IconCheck size={15} /> Cambiar PDF</> : <><IconUpload size={15} /> Seleccionar PDF</>}</em>
      <input
        type="file"
        accept={PDF_ACCEPT}
        onChange={(event) => {
          const next = event.target.files?.[0] || null;
          if (!next) {
            onChange(null);
            return;
          }
          const err = pdfIntakeError(next, "es");
          if (err) {
            event.target.value = "";
            onInvalid?.(err);
            onChange(null);
            return;
          }
          onChange(next);
        }}
      />
    </label>
  );
}
