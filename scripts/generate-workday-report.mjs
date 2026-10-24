/**
 * Informe diario / cierre de jornada OXXUS → PDF para dirección.
 *
 * Uso:
 *   node scripts/generate-workday-report.mjs
 *   node scripts/generate-workday-report.mjs --date=2026-08-23
 *   node scripts/generate-workday-report.mjs --content=docs/reports/draft-2026-08-23.json
 *
 * Salida:
 *   docs/reports/Informe-diario-desarrollo-OXXUS-YYYY-MM-DD.pdf
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const logoPng = join(root, "public", "oxxus-logo-light-v2.png");
const logoJpg = join(root, "docs", ".tmp-logo-v2.jpg");
const convertPs1 = join(root, "scripts", "_convert-logo-white.ps1");
const outDir = join(root, "docs", "reports");

const LETTER_W = 612;
const LETTER_H = 792;

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function latin(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "-");
}
function esc(value) {
  return latin(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
function wrap(value, max) {
  const words = latin(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = `${line} ${word}`.trim();
    if (line && next.length > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function gitCommits(dateIso) {
  const next = new Date(`${dateIso}T12:00:00`);
  next.setDate(next.getDate() + 1);
  const nextIso = next.toISOString().slice(0, 10);
  const result = spawnSync(
    "git",
    ["log", `--since=${dateIso}`, `--until=${nextIso}`, "--pretty=format:%h|%s"],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) return [];
  return String(result.stdout || "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, ...rest] = line.split("|");
      return { hash, subject: rest.join("|") };
    });
}

function gitHead() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  return result.status === 0 ? String(result.stdout).trim() : "n/a";
}

/** Contenido por defecto del 2026-08-23 (jornada Assist + intake + plan). */
function defaultContent20260823(dateIso, commits, head) {
  return {
    dateIso,
    title: "INFORME DIARIO DE DESARROLLO",
    subtitle: `OXXUS Credit Solutions · ${dateIso}`,
    audience: "Direccion OXXUS",
    head,
    heroTag: "Resumen ejecutivo",
    heroTitle: "Jornada completa: Assist + intake PDF + plan",
    heroBody:
      "Hoy se cerro el flujo cliente → analisis → plan → cartas, con Asistente OXXUS, proteccion de cuentas, cola de documentos, generacion de plan (RPC), nav Disputas priorizada, menos PII en dashboard, i18n clave, y migraciones 026–028 aplicadas en produccion Supabase.",
    summaryRows: [
      ["Asistente OXXUS", "Hub + copiloto + KB + cuentas protegidas", "En main"],
      ["Intake PDF", "Solo PDF + CTA Analiza mis documentos", "En main"],
      ["Cola analisis", "Cola en Assist + clasificar + Generar plan", "En main"],
      ["Plan automatico", "RPC prepare_case_plan (semanas/mailings)", "En prod DB"],
      ["Disputas", "Nav cableada + priorizacion review>disputable", "En main"],
      ["Privacidad", "Dashboard sin DOB/SSN en RPC", "En prod DB"],
      ["i18n", "LetterLibrary, NewCase, Portal, Disputas", "En main"],
      ["Ops Supabase", "Historial reparado; 001–028 alineadas", "Hecho"],
    ],
    sections: [
      {
        label: "Producto",
        title: "1. Asistente OXXUS y proteccion",
        paragraphs: [
          "Hub Asistente OXXUS (nav) con copiloto en expediente, clasificacion Protegida / Revisar / Disputable, candados DB (is_protected + triggers + audit) y KB versionada con aprobacion admin. Se descarto un bot autonomo con aprendizaje abierto por riesgo legal.",
          "Tambien: responsive casos recientes, progreso de reparacion dinamico, Ver como rol (admin, solo UI), dashboards limpios e invite hardening.",
        ],
      },
      {
        label: "Cliente",
        title: "2. Intake solo PDF + analisis solicitado",
        paragraphs: [
          "Reportes iniciales solo PDF (uploadValidation). CTA Analiza mis documentos / Analyze my documents → status analysis_requested. Superficies: onboarding, NewCase, portal, help y actualizacion de reportes.",
          "El analisis NO parsea PDFs automaticamente. El agente clasifica cuentas y genera el plan. Vision de scores queda detras de flag (apagado).",
        ],
      },
      {
        label: "Agente",
        title: "3. Workstation Analisis → Plan → Cartas",
        paragraphs: [
          "RPC prepare_case_plan fija nivel/duracion, marca reportes analizados y crea case_weeks + weekly_mailings. Cableado en Assist (Colas) y ClientFile como Generar plan (niveles 1–4).",
        ],
        table: {
          headers: ["Paso", "Actor", "Resultado"],
          widths: [140, 100, 280],
          rows: [
            ["Subir PDF", "Cliente", "Reportes en expediente"],
            ["Analiza mis documentos", "Cliente", "analysis_requested"],
            ["Cola Assist", "Agente", "Ve casos pendientes"],
            ["Clasificar", "Agente", "Protegida / Revisar / Disputable"],
            ["Generar plan", "Agente", "Semanas + mailings listos"],
          ],
        },
      },
      {
        label: "Operaciones",
        title: "4. Disputas, PII e i18n",
        paragraphs: [
          "Nav Disputas prioriza review sobre disputable. get_dashboard_cases ya no expone DOB/SSN. LetterLibrary y pantallas clave bilingues ES/EN.",
        ],
      },
      {
        label: "Ops",
        title: "5. Migraciones Supabase (produccion)",
        paragraphs: [
          "026 re-aplicada de verdad (classify_case_accounts + is_protected). 027 analysis_requested. 028 prepare_case_plan + dashboard PII. Historial 001–028 alineado. Token CLI persistido en .env.local + variable de usuario Windows (sin commitear secretos).",
        ],
      },
    ],
    nextSteps: [
      ["1", "Republicar frontend (ChatGPT Sites / Workers)", "Ops"],
      ["2", "Smoke: PDF → Analiza → Cola → Generar plan", "Agente + QA"],
      ["3", "Validar Disputas + toggle EN", "Producto"],
      ["4", "Rotar access token Supabase si se expuso", "Ops"],
      ["5", "Vision opcional: secret + deploy + flag", "Backend"],
    ],
    closing:
      "Hoy el sitio gano el circuito operativo completo del caso nuevo: el cliente entrega PDF y pide analisis; el agente clasifica y genera plan; las cuentas vigentes quedan protegidas en DB; el dashboard expone menos PII. Falta republicar UI a produccion y smoke test real.",
    commits,
  };
}

/** Contenido por defecto del 2026-08-24 (tutoriales ES/EN + polish). */
function defaultContent20260824(dateIso, commits, head) {
  return {
    dateIso,
    title: "INFORME DIARIO DE DESARROLLO",
    subtitle: `OXXUS Credit Solutions · ${dateIso}`,
    audience: "Direccion OXXUS",
    head,
    heroTag: "Resumen ejecutivo",
    heroTitle: "Tutoriales bilingues + estabilizacion local",
    heroBody:
      "Se regeneraron los videos tutoriales de reportes de credito en espanol e ingles (logo v2, voz neural, sync A/V), se cablearon al toggle de idioma del sitio, se corrigio un crash de InviteCenter y se estabilizo el entorno local (env BOM + Vite NEXT_PUBLIC). Supabase permanece alineado 001–028.",
    summaryRows: [
      ["Tutorial ES", "Video 9:16 con logo v2 + voz DaliaNeural", "En public/"],
      ["Tutorial EN", "Misma guia en ingles + JennyNeural", "En public/"],
      ["i18n video", "Player cambia ES/EN con el toggle del sitio", "CreditReportHelp"],
      ["Marca", "Logo transparente como en tema oscuro web", "Slides + header"],
      ["Bugfix", "InviteCenter ya no rompe si profile es null", "En main"],
      ["Dev local", "BOM .env.local + envPrefix NEXT_PUBLIC_", "Vite"],
      ["Ops Supabase", "Migraciones 001–028 verificadas; sin pendientes", "Prod OK"],
      ["Proceso", "Generador PDF de jornada reutilizable", "scripts/"],
    ],
    sections: [
      {
        label: "Producto",
        title: "1. Tutoriales de reportes (ES + EN)",
        paragraphs: [
          "Nuevos MP4 verticales alineados al flujo actual: AnnualCreditReport.com → 3 buros → verificar → descargar PDF → subir en OXXUS → Analiza mis documentos.",
          "Intro profesional con logo grande (fade/zoom). Narracion neural Edge TTS. Audio sincronizado con la duracion exacta de cada slide.",
        ],
      },
      {
        label: "Producto",
        title: "2. Integracion en el sitio",
        paragraphs: [
          "CreditReportHelp carga oxxus-tutorial-reportes-credito.es.mp4 o .en.mp4 segun el idioma. Pasos del copy del tutorial actualizados a 6 pasos bilingues.",
        ],
      },
      {
        label: "Estabilidad",
        title: "3. Fixes de sesion local",
        paragraphs: [
          "InviteCenter: guarda cuando viewer/profile es null (evita TypeError role).",
          "Dev: UTF-8 BOM en .env.local impedia leer NEXT_PUBLIC_SUPABASE_URL; Vite ahora expone NEXT_PUBLIC_ via envPrefix.",
        ],
      },
      {
        label: "Ops",
        title: "4. Supabase",
        paragraphs: [
          "Sin migraciones nuevas hoy. Remoto verificado: 001–028 aplicadas; is_protected presente; RPCs de intake/plan en produccion desde jornada previa.",
        ],
      },
    ],
    nextSteps: [
      ["1", "Republicar frontend (ChatGPT Sites / Workers) con videos nuevos", "Ops"],
      ["2", "Smoke login + tutorial ES/EN en localhost y prod", "QA"],
      ["3", "Smoke PDF → Analiza → Cola Assist → Generar plan", "Agente"],
      ["4", "Rotar tokens Supabase si se compartieron en chat", "Ops"],
    ],
    closing:
      "Hoy el cliente gana una guia visual profesional en su idioma, alineada al intake PDF real. El backend Supabase ya estaba al dia; el siguiente paso critico es republicar el frontend para que produccion coincida con main.",
    commits,
  };
}

function buildAutoContent(dateIso) {
  const commits = gitCommits(dateIso);
  const head = gitHead();
  if (dateIso === "2026-08-24") return defaultContent20260824(dateIso, commits, head);
  if (dateIso === "2026-08-23") return defaultContent20260823(dateIso, commits, head);

  const commitRows = commits.length
    ? commits.map((c) => [c.hash, c.subject.slice(0, 70), "Commit"])
    : [["—", "Sin commits en esta fecha", "—"]];

  return {
    dateIso,
    title: "INFORME DIARIO DE DESARROLLO",
    subtitle: `OXXUS Credit Solutions · ${dateIso}`,
    audience: "Direccion OXXUS",
    head,
    heroTag: "Resumen ejecutivo",
    heroTitle: "Cierre de jornada de desarrollo",
    heroBody:
      "Informe automatico de la jornada. Completar narrativa de producto en un JSON (--content=...) si se requiere mas detalle para direccion.",
    summaryRows: commitRows,
    sections: [
      {
        label: "Git",
        title: "Commits del dia",
        paragraphs: commits.length
          ? commits.map((c) => `${c.hash} — ${c.subject}`)
          : ["No hubo commits registrados en esta fecha."],
      },
    ],
    nextSteps: [
      ["1", "Revisar smoke en produccion / preview", "QA"],
      ["2", "Republicar frontend si aplica", "Ops"],
    ],
    closing: "Informe de cierre generado automaticamente desde git. Ampliar con narrativa de negocio antes de entregar si hace falta.",
    commits,
  };
}

function loadContent(dateIso) {
  const contentPath = argValue("content");
  if (contentPath) {
    const abs = join(root, contentPath);
    const raw = JSON.parse(readFileSync(abs, "utf8"));
    raw.dateIso = raw.dateIso || dateIso;
    raw.commits = raw.commits || gitCommits(raw.dateIso);
    raw.head = raw.head || gitHead();
    return raw;
  }
  return buildAutoContent(dateIso);
}

function ensureJpeg() {
  mkdirSync(join(root, "docs"), { recursive: true });
  if (!existsSync(logoPng)) return null;
  writeFileSync(
    convertPs1,
    `
Add-Type -AssemblyName System.Drawing
$srcPath = '${logoPng.replace(/'/g, "''")}'
$dstPath = '${logoJpg.replace(/'/g, "''")}'
$src = [System.Drawing.Bitmap]::FromFile($srcPath)
$dst = New-Object System.Drawing.Bitmap $src.Width, $src.Height
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.Clear([System.Drawing.Color]::White)
$g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
$g.DrawImage($src, 0, 0, $src.Width, $src.Height)
$dst.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
Write-Output ("{0},{1}" -f $src.Width, $src.Height)
$g.Dispose(); $dst.Dispose(); $src.Dispose()
`,
  );
  const result = spawnSync("powershell", ["-NoProfile", "-File", convertPs1], {
    encoding: "utf8",
  });
  if (result.status !== 0 || !existsSync(logoJpg)) {
    console.warn("Logo conversion failed", result.stderr || result.stdout);
    return null;
  }
  const [w, h] = String(result.stdout).trim().split(",").map(Number);
  return { data: readFileSync(logoJpg), width: w || 700, height: h || 612 };
}

function buildPdf(logo, report) {
  const pages = [];

  const addPage = (title, subtitle) => {
    const page = { title, subtitle, commands: [], y: 650 };
    pages.push(page);
    page.commands.push("0.043 0.165 0.314 rg", "0 0 13 792 re f");
    page.commands.push("1 1 1 rg", "13 700 599 92 re f");

    let titleX = 168;
    if (logo) {
      const maxW = 72;
      const maxH = 62;
      const aspect = logo.width / Math.max(1, logo.height);
      let width = maxW;
      let height = width / aspect;
      if (height > maxH) {
        height = maxH;
        width = height * aspect;
      }
      const x = 40;
      const y = 708 + (76 - height) / 2;
      page.commands.push(
        "q",
        `${width.toFixed(1)} 0 0 ${height.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)} cm`,
        "/Logo Do",
        "Q",
      );
      titleX = x + width + 16;
    } else {
      page.commands.push("BT", "/FB 17 Tf", "0.043 0.165 0.314 rg", "47 748 Td", "(OXXUS) Tj", "ET");
    }

    page.commands.push(
      "BT",
      "/FB 13 Tf",
      "0.043 0.165 0.314 rg",
      `${titleX.toFixed(1)} 756 Td`,
      `(${esc(title)}) Tj`,
      "ET",
      "BT",
      "/FR 7.5 Tf",
      "0.390 0.475 0.570 rg",
      `${titleX.toFixed(1)} 738 Td`,
      `(${esc(subtitle)}) Tj`,
      "ET",
      "q",
      "0.090 0.412 0.878 RG",
      "2.4 w",
      "45 712 m 566 712 l S",
      "Q",
    );
    return page;
  };

  const text = (page, value, x, y, size = 9, bold = false, color = "0.102 0.188 0.294") => {
    page.commands.push(
      "BT",
      `/${bold ? "FB" : "FR"} ${size} Tf`,
      `${color} rg`,
      `${x} ${y} Td`,
      `(${esc(value)}) Tj`,
      "ET",
    );
  };

  const ensure = (page, h) => {
    if (page.y - h < 68) return addPage(page.title, page.subtitle);
    return page;
  };

  const paragraph = (page, value, maxChars = 92, leading = 12) => {
    const lines = wrap(value, maxChars);
    let p = page;
    for (const line of lines) {
      p = ensure(p, leading + 2);
      text(p, line, 46, p.y, 9, false);
      p.y -= leading;
    }
    p.y -= 6;
    return p;
  };

  const section = (page, title, label) => {
    let p = ensure(page, 36);
    text(p, label.toUpperCase(), 46, p.y, 6.8, true, "0.090 0.412 0.878");
    p.y -= 16;
    text(p, title, 46, p.y, 13, true, "0.043 0.165 0.314");
    p.y -= 10;
    p.commands.push("q", "0.84 0.89 0.94 RG", "0.7 w", `46 ${p.y} m 566 ${p.y} l S`, "Q");
    p.y -= 22;
    return p;
  };

  const callout = (page, title, body, rgb = "0.090 0.412 0.878") => {
    const lines = wrap(body, 86).slice(0, 6);
    const height = 45 + lines.length * 11;
    let p = ensure(page, height + 10);
    const bottom = p.y - height;
    p.commands.push(
      "q",
      "0.957 0.973 0.992 rg",
      "0.84 0.89 0.94 RG",
      "0.6 w",
      `46 ${bottom} 520 ${height} re B`,
      "Q",
      "q",
      `${rgb} rg`,
      `46 ${bottom} 5 ${height} re f`,
      "Q",
    );
    text(p, title, 64, p.y - 20, 9, true, "0.043 0.165 0.314");
    lines.forEach((line, i) => text(p, line, 64, p.y - 38 - i * 11, 7.3, false, "0.390 0.475 0.570"));
    p.y = bottom - 16;
    return p;
  };

  const table = (page, headers, rows, widths) => {
    let p = page;
    const rowH = 32;
    const headH = 24;
    const drawHead = () => {
      p.commands.push("q", "0.043 0.165 0.314 rg", `46 ${p.y - headH} 520 ${headH} re f`, "Q");
      let x = 46;
      headers.forEach((h, i) => {
        text(p, h.toUpperCase(), x + 6, p.y - 15, 6.2, true, "1 1 1");
        x += widths[i];
      });
      p.y -= headH;
    };
    p = ensure(p, headH + rowH + 8);
    drawHead();
    rows.forEach((row, ri) => {
      if (p.y - rowH < 68) {
        p = addPage(p.title, p.subtitle);
        drawHead();
      }
      const fill = ri % 2 ? "1 1 1" : "0.957 0.973 0.992";
      p.commands.push(
        "q",
        `${fill} rg`,
        "0.84 0.89 0.94 RG",
        "0.5 w",
        `46 ${p.y - rowH} 520 ${rowH} re B`,
        "Q",
      );
      let x = 46;
      row.forEach((cell, i) => {
        const clipped = wrap(cell, Math.max(8, Math.floor(widths[i] / 5.2))).slice(0, 2);
        clipped.forEach((line, li) =>
          text(
            p,
            line,
            x + 6,
            p.y - 12 - li * 10,
            7,
            i === 0,
            i === 0 ? "0.043 0.165 0.314" : "0.102 0.188 0.294",
          ),
        );
        x += widths[i];
      });
      p.y -= rowH;
    });
    p.y -= 14;
    return p;
  };

  const meta = (page, items) => {
    const p = ensure(page, 66);
    const width = 520 / items.length;
    p.commands.push(
      "q",
      "0.957 0.973 0.992 rg",
      "0.84 0.89 0.94 RG",
      "0.6 w",
      `46 ${p.y - 49} 520 54 re B`,
      "Q",
    );
    items.forEach(([label, value], index) => {
      const x = 58 + width * index;
      if (index) {
        p.commands.push(
          "q",
          "0.84 0.89 0.94 RG",
          "0.5 w",
          `${46 + width * index} ${p.y - 40} m ${46 + width * index} ${p.y - 1} l S`,
          "Q",
        );
      }
      text(p, label.toUpperCase(), x, p.y - 12, 6.2, true, "0.390 0.475 0.570");
      text(p, value, x, p.y - 31, 9, true, "0.043 0.165 0.314");
    });
    p.y -= 70;
    return p;
  };

  const hero = (page, title, body, tag) => {
    const bodyLines = wrap(body, 82).slice(0, 5);
    const height = 78 + bodyLines.length * 12;
    const p = ensure(page, height + 12);
    const bottom = p.y - height;
    p.commands.push(
      "q",
      "0.043 0.165 0.314 rg",
      `46 ${bottom} 520 ${height} re f`,
      "Q",
      "q",
      "0.090 0.412 0.878 rg",
      `46 ${bottom} 6 ${height} re f`,
      "Q",
    );
    text(p, tag.toUpperCase(), 68, p.y - 22, 6.5, true, "0.55 0.75 1");
    text(p, title, 68, p.y - 43, 14, true, "1 1 1");
    bodyLines.forEach((line, i) => text(p, line, 68, p.y - 64 - i * 12, 8.2, false, "0.82 0.89 0.97"));
    p.y = bottom - 18;
    return p;
  };

  let page = addPage(report.title, report.subtitle);
  page = meta(page, [
    ["Para", report.audience || "Direccion OXXUS"],
    ["Fecha", report.dateIso],
    ["Repo", `main @ ${report.head}`],
  ]);
  page = hero(page, report.heroTitle, report.heroBody, report.heroTag || "Resumen ejecutivo");

  page = section(page, "Entregas en una vista", "Hoy");
  page = table(page, ["Bloque", "Resultado", "Estado"], report.summaryRows, [120, 280, 120]);

  if (report.commits?.length) {
    page = callout(
      page,
      "Commits del dia",
      report.commits.map((c) => `${c.hash} ${c.subject}`).join(" · "),
      "0.06 0.58 0.39",
    );
  }

  page = addPage(report.title, "Detalle de entregas");
  for (const sec of report.sections || []) {
    page = section(page, sec.title, sec.label || "Producto");
    for (const para of sec.paragraphs || []) page = paragraph(page, para);
    if (sec.table) {
      page = table(page, sec.table.headers, sec.table.rows, sec.table.widths);
    }
  }

  page = addPage(report.title, "Proximos pasos y cierre");
  page = section(page, "Proximos pasos recomendados", "Direccion");
  page = table(page, ["#", "Accion", "Dueno"], report.nextSteps || [], [40, 340, 140]);
  page = callout(page, "Cierre para direccion", report.closing || "", "0.06 0.58 0.39");
  page = callout(
    page,
    "Proceso",
    "Al cerrar cada jornada o bloque entregable se genera este PDF con: node scripts/generate-workday-report.mjs",
  );

  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const logoId = logo ? 5 : null;
  let nextId = logo ? 6 : 5;
  const pageIds = pages.map(() => nextId++);
  const contentIds = pages.map(() => nextId++);
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  pages.forEach((p, index) => {
    text(p, "OXXUS CREDIT SOLUTIONS", 46, 34, 6.3, true, "0.043 0.165 0.314");
    text(p, `Confidencial · Informe ${report.dateIso}`, 200, 34, 6.3, false, "0.390 0.475 0.570");
    text(p, `Pagina ${index + 1} de ${pages.length}`, 502, 34, 6.3, true, "0.390 0.475 0.570");
    p.commands.push("q", "0.84 0.89 0.94 RG", "0.5 w", "46 48 m 566 48 l S", "Q");
    const content = p.commands.join("\n");
    objects[contentIds[index]] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    objects[pageIds[index]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LETTER_W} ${LETTER_H}] /Resources << /Font << /FR 3 0 R /FB 4 0 R >>${logoId ? ` /XObject << /Logo ${logoId} 0 R >>` : ""} >> /Contents ${contentIds[index]} 0 R >>`;
  });

  const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [0];
  for (let id = 1; id < nextId; id += 1) {
    offsets[id] = chunks.reduce((n, b) => n + b.length, 0);
    if (logo && id === logoId) {
      const header = Buffer.from(
        `${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.data.length} >>\nstream\n`,
        "latin1",
      );
      const end = Buffer.from("\nendstream\nendobj\n", "latin1");
      chunks.push(header, logo.data, end);
    } else {
      chunks.push(Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`, "latin1"));
    }
  }
  const xref = chunks.reduce((n, b) => n + b.length, 0);
  let xrefBlock = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextId; id += 1) {
    xrefBlock += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  xrefBlock += `trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  chunks.push(Buffer.from(xrefBlock, "latin1"));
  return Buffer.concat(chunks);
}

const dateIso = argValue("date") || todayIso();
const report = loadContent(dateIso);
mkdirSync(outDir, { recursive: true });
const outPdf = join(outDir, `Informe-diario-desarrollo-OXXUS-${report.dateIso}.pdf`);
const logo = ensureJpeg();
const pdf = buildPdf(logo, report);
writeFileSync(outPdf, pdf);
if (existsSync(logoJpg)) unlinkSync(logoJpg);
if (existsSync(convertPs1)) unlinkSync(convertPs1);
console.log(`Wrote ${outPdf} (${pdf.length} bytes)${logo ? " · logo v2" : ""}`);
