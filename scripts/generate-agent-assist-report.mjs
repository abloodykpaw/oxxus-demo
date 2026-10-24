/**
 * Owner report PDF with site logo v2 (transparent PNG composited on white,
 * natural aspect — same idea as the website brand mark).
 *
 * Run: node scripts/generate-agent-assist-report.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const logoPng = join(root, "public", "oxxus-logo-light-v2.png");
const logoJpg = join(root, "docs", ".tmp-logo-v2.jpg");
const outPdf = join(root, "docs", "OXXUS-reporte-jornada-producto.pdf");
const convertPs1 = join(root, "scripts", "_convert-logo-white.ps1");

const LETTER_W = 612;
const LETTER_H = 792;

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

function buildPdf(logo) {
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
      page.commands.push(
        "BT",
        "/FB 17 Tf",
        "0.043 0.165 0.314 rg",
        "47 748 Td",
        "(OXXUS) Tj",
        "ET",
      );
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
    const lines = wrap(body, 86).slice(0, 5);
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
    const bodyLines = wrap(body, 82).slice(0, 4);
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

  const today = new Date().toLocaleDateString("es-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let page = addPage("REPORTE PARA DIRECCION", "Jornada de producto en el sitio web OXXUS");
  page = meta(page, [
    ["Para", "Dueno / Direccion OXXUS"],
    ["Fecha", today],
    ["Preparado por", "Equipo de producto"],
  ]);
  page = hero(
    page,
    "Lo que se construyo hoy en el sitio",
    "Este documento resume, en lenguaje claro, todo el trabajo de producto aplicado al sitio web OXXUS en esta jornada: experiencia movil, dashboards, progreso de reparacion, vista por rol, y el nuevo Asistente OXXUS con proteccion de cuentas vigentes.",
    "Informe ejecutivo",
  );

  page = section(page, "Resumen en una pagina", "Vista del dueno");
  page = table(
    page,
    ["Bloque", "Resultado para el negocio", "Donde se ve"],
    [
      ["Movil / responsive", "Casos recientes legibles en iPhone SE; progreso completo", "Dashboard agente"],
      ["Progreso de reparacion", "Barra dinamica de fases del plan del cliente", "Portal / dashboard cliente"],
      ["Ver como rol", "Admin puede previsualizar vistas sin impersonar", "Topbar admin"],
      ["Dashboards limpios", "Menos ruido; cola y casos primero", "Dashboard agente/admin"],
      ["Asistente OXXUS", "Copiloto + cuentas protegidas + KB gobernada", "Nav Asistente OXXUS"],
    ],
    [130, 230, 160],
  );
  page = callout(
    page,
    "Principio de la jornada",
    "Automatizar lo seguro (sugerir, clasificar, organizar) y bloquear lo peligroso (borrar tarjetas vigentes, envios autonomos, promesas de score, aprendizaje abierto en internet).",
  );

  page = addPage("REPORTE PARA DIRECCION", "Detalle de entregas de la jornada");
  page = section(page, "1. Experiencia movil y responsive", "Producto");
  page = paragraph(
    page,
    "Se corrigio la vista en resoluciones tipo iPhone SE (375px). La tabla de Casos recientes ya no comprime la columna de progreso: cada fila pasa a tarjeta con cliente arriba y barra de progreso a ancho completo. Tambien se estabilizo el topbar (selector Ver como, idioma y tema) para que no se desborde.",
  );
  page = paragraph(
    page,
    "Ademas se refuerzo el sistema responsive general (phone a TV): paddings fluidos, sidebar/nav movil y paneles adaptados a rangos intermedios.",
  );

  page = section(page, "2. Progreso de reparacion del cliente", "Producto");
  page = paragraph(
    page,
    "Se incorporo una barra de progreso dinamica basada en el estado real del caso (reporte, analisis, validacion, prioridades, disputas y seguimiento). El cliente ve avance claro; el equipo mantiene el mismo lenguaje de fases.",
  );

  page = section(page, "3. Vista Ver como rol (admin)", "Producto");
  page = paragraph(
    page,
    "El administrador puede previsualizar la interfaz como agente, cliente o colaborador web. Es solo UI: no cambia permisos reales ni datos. Sirve para validar la experiencia de cada rol sin riesgo operacional.",
  );

  page = section(page, "4. Simplificacion de dashboards", "Producto");
  page = paragraph(
    page,
    "Se limpio el home del agente/admin: cola de trabajo primero, estadisticas compactas y casos recientes. En cliente: bienvenida, progreso y tarjetas de foco (proxima accion, caso, scores), sin ruido visual.",
  );

  page = addPage("REPORTE PARA DIRECCION", "Asistente OXXUS y proteccion del cliente");
  page = section(page, "5. Asistente OXXUS (sistema integral)", "Nuevo modulo");
  page = paragraph(
    page,
    "Se evaluo un bot autonomo con aprendizaje en internet. Se descarto esa autonomia por riesgo legal y de calidad. En su lugar se entrego un sistema integral seguro:",
  );
  page = table(
    page,
    ["Capa", "Que hace", "Por que importa"],
    [
      ["UI agente", "Hub Asistente + copiloto en expediente", "Acelera el trabajo diario"],
      ["Clasificacion", "Protegida / Revisar / Disputable", "Evita disputar vigentes"],
      ["Candados DB", "is_protected + triggers + audit", "Impide borrados accidentales"],
      ["Knowledge", "KB versionada con aprobacion admin", "Procedimientos controlados"],
    ],
    [100, 210, 210],
  );
  page = callout(
    page,
    "Ubicacion en el sitio",
    "Navegacion lateral → Asistente OXXUS. Dentro del expediente del cliente: badges en cuentas + panel Copiloto. En disputas: etiquetas protegida vs disputable.",
    "0.06 0.58 0.39",
  );

  page = section(page, "Lo que NO se hizo (a proposito)", "Decisiones");
  page = table(
    page,
    ["Descartado", "Riesgo", "Sustituto elegido"],
    [
      ["Bot que aprende solo de internet", "Consejos malos / ilegales", "KB curada + aprobacion humana"],
      ["IA que envia disputas sola", "Dano masivo al cliente", "Borrador → revision → envio"],
      ["Confiar solo en el chat", "Se puede saltar la UI", "Candado real en Postgres"],
      ["Promesas de score", "Riesgo regulatorio", "Lenguaje de procedimiento"],
    ],
    [160, 160, 200],
  );

  page = addPage("REPORTE PARA DIRECCION", "Estado tecnico y proximos pasos");
  page = section(page, "Estado tecnico", "Entrega");
  page = table(
    page,
    ["Entregable", "Archivo / superficie", "Estado"],
    [
      ["Migracion cuentas protegidas", "026_agent_assist_protected_accounts.sql", "Lista para aplicar"],
      ["Hub Asistente OXXUS", "Nav del sitio", "Visible en UI"],
      ["Copiloto en expediente", "ClientFile", "Visible en UI"],
      ["Clasificador local + RPC", "agentAssist.ts + classify_case_accounts", "UI lista; RPC con migracion"],
      ["KB gobernada", "kb_documents / change_requests", "UI + seed SOP"],
      ["Responsive casos recientes", "globals.css", "En produccion UI"],
    ],
    [170, 220, 130],
  );

  page = section(page, "Impacto esperado", "Negocio");
  page = paragraph(
    page,
    "1) Menos errores humanos al tocar cuentas vigentes. 2) Agentes mas rapidos con procedimientos estandarizados. 3) Mejor experiencia movil para operar desde el telefono. 4) Admin puede auditar la UX de cada rol. 5) Base lista para enriquecer el copiloto sin abrir riesgos legales.",
  );

  page = section(page, "Proximos pasos recomendados", "Direccion");
  page = table(
    page,
    ["Prioridad", "Accion", "Dueno sugerido"],
    [
      ["1", "Aplicar migracion 026 en Supabase", "Ops / Backend"],
      ["2", "Clasificar un caso real y validar candados", "Agente + Admin"],
      ["3", "Capacitar agentes en Asistente OXXUS", "Operaciones"],
      ["4", "Publicar SOPs adicionales en la KB", "Admin producto"],
    ],
    [70, 300, 150],
  );

  page = callout(
    page,
    "Cierre para el dueno",
    "Hoy el sitio no solo se ve mejor en movil: gano un asistente interno responsable y proteccion estructural de las tarjetas/creditos vigentes. El valor esta en velocidad del equipo sin sacrificar la seguridad del cliente.",
    "0.06 0.58 0.39",
  );
  page = callout(
    page,
    "Nota de marca",
    "Este PDF usa el mismo logo v2 del sitio (oxxus-logo-light-v2), compuesto sobre fondo blanco y con proporcion natural, como en la marca web.",
  );

  // assemble
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
    text(p, "Documento confidencial · Direccion", 210, 34, 6.3, false, "0.390 0.475 0.570");
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

const logo = ensureJpeg();
const pdf = buildPdf(logo);
writeFileSync(outPdf, pdf);
if (existsSync(logoJpg)) unlinkSync(logoJpg);
if (existsSync(convertPs1)) unlinkSync(convertPs1);
const old = join(root, "docs", "OXXUS-reporte-asistente-integral.pdf");
try {
  if (existsSync(old)) unlinkSync(old);
} catch {
  // Old file may be open in the IDE viewer; ignore.
}
console.log(`Wrote ${outPdf} (${pdf.length} bytes)${logo ? " · logo v2 blanco + proporcion natural" : ""}`);
