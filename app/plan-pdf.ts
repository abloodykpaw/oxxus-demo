type PlanAccount = {
  creditor_name: string;
  issue_type: string | null;
  bureaus: string[];
};

export type SimplifiedPlan = {
  clientName?: string;
  caseNumber: string;
  level: number | null;
  durationWeeks: number | null;
  nextAction: string | null;
  overview: string;
  accounts: PlanAccount[];
  scores?: { transunion?: number; experian?: number; equifax?: number };
};

export type WorkdayActivity = {
  title: string;
  detail?: string | null;
  activity_type?: string | null;
  before_url?: string | null;
  after_url?: string | null;
  created_at: string;
};

export type WorkdayPerson = {
  name: string;
  role: string;
  started_at: string;
  last_activity_at: string;
  ended_at?: string | null;
  status: string;
  activities: WorkdayActivity[];
};

export type WorkdayReportData = {
  reportDate: string;
  generatedBy: string;
  people: WorkdayPerson[];
};

type PdfLogo = { data: string; width: number; height: number };
type PdfImage = { data: string; width: number; height: number };
type PdfPage = { commands: string[]; y: number; title: string; subtitle: string };
type Rgb = [number, number, number];

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const NAVY: Rgb = [0.043, 0.165, 0.314];
const BLUE: Rgb = [0.09, 0.412, 0.878];
const SKY: Rgb = [0.925, 0.961, 1];
const PALE: Rgb = [0.957, 0.973, 0.992];
const INK: Rgb = [0.102, 0.188, 0.294];
const MUTED: Rgb = [0.39, 0.475, 0.57];
const LINE: Rgb = [0.84, 0.89, 0.94];
const GREEN: Rgb = [0.06, 0.58, 0.39];
const AMBER: Rgb = [0.86, 0.55, 0.08];
const WHITE: Rgb = [1, 1, 1];

const issueLabels: Record<string, string> = {
  collection: "Cuenta en coleccion",
  charge_off: "Cuenta castigada",
  derogatory: "Registro negativo",
  late_payment: "Pago tardio",
  "repossession/inconsistent": "Reposicion o informacion inconsistente",
};

function latin(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "-");
}

function escapePdf(value: string) {
  return latin(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function rgb(color: Rgb, stroke = false) {
  return `${color.map((value) => value.toFixed(3)).join(" ")} ${stroke ? "RG" : "rg"}`;
}

function wrap(value: string, maxCharacters: number) {
  const words = latin(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = `${line} ${word}`.trim();
    if (line && next.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

class OxxusPdf {
  pages: PdfPage[] = [];
  current!: PdfPage;
  private images: Array<PdfImage & { name: string }> = [];

  constructor(private logo?: PdfLogo) {}

  addPage(title: string, subtitle: string) {
    const page: PdfPage = { commands: [], y: 650, title, subtitle };
    this.pages.push(page);
    this.current = page;
    this.drawHeader(page);
    return page;
  }

  ensure(height: number) {
    if (this.current.y - height < 68) this.addPage(this.current.title, this.current.subtitle);
  }

  private drawHeader(page: PdfPage) {
    this.rect(0, 0, 13, LETTER_HEIGHT, NAVY, page);
    this.rect(13, 700, LETTER_WIDTH - 13, 92, WHITE, page);
    let titleX = 168;
    if (this.logo) {
      // Same idea as the web: object-fit contain — never squash the square mark.
      const maxW = 72;
      const maxH = 62;
      const aspect = this.logo.width / Math.max(1, this.logo.height);
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
      this.text("OXXUS", 47, 748, 17, true, NAVY, page);
      this.text("CREDIT SOLUTIONS", 47, 732, 7, true, BLUE, page);
    }
    this.text(page.title, titleX, 756, 13, true, NAVY, page);
    this.text(page.subtitle, titleX, 738, 7.5, false, MUTED, page);
    this.line(45, 712, 566, 712, 2.4, BLUE, page);
  }

  text(value: string, x: number, y: number, size = 9, bold = false, color: Rgb = INK, page = this.current) {
    page.commands.push("BT", `/${bold ? "FB" : "FR"} ${size} Tf`, rgb(color), `${x} ${y} Td`, `(${escapePdf(value)}) Tj`, "ET");
  }

  rect(x: number, y: number, width: number, height: number, fill: Rgb, page = this.current, stroke?: Rgb) {
    page.commands.push("q", rgb(fill), ...(stroke ? [rgb(stroke, true), "0.6 w"] : []), `${x} ${y} ${width} ${height} re ${stroke ? "B" : "f"}`, "Q");
  }

  line(x1: number, y1: number, x2: number, y2: number, width: number, color: Rgb, page = this.current) {
    page.commands.push("q", rgb(color, true), `${width} w`, `${x1} ${y1} m ${x2} ${y2} l S`, "Q");
  }

  paragraph(value: string, x: number, width: number, size = 9, leading = 13, color: Rgb = INK, bold = false) {
    const lines = wrap(value, Math.max(18, Math.floor(width / (size * 0.53))));
    this.ensure(lines.length * leading + 6);
    for (const line of lines) {
      this.text(line, x, this.current.y, size, bold, color);
      this.current.y -= leading;
    }
    return lines.length * leading;
  }

  section(title: string, label?: string) {
    this.ensure(34);
    if (label) this.text(label.toUpperCase(), 46, this.current.y, 6.8, true, BLUE);
    this.current.y -= label ? 16 : 2;
    this.text(title, 46, this.current.y, 13, true, NAVY);
    this.line(46, this.current.y - 9, 566, this.current.y - 9, 0.7, LINE);
    this.current.y -= 28;
  }

  meta(items: Array<[string, string]>) {
    this.ensure(66);
    const width = 520 / items.length;
    this.rect(46, this.current.y - 49, 520, 54, PALE, this.current, LINE);
    items.forEach(([label, value], index) => {
      const x = 58 + width * index;
      if (index) this.line(46 + width * index, this.current.y - 40, 46 + width * index, this.current.y - 1, 0.5, LINE);
      this.text(label.toUpperCase(), x, this.current.y - 12, 6.2, true, MUTED);
      this.text(value, x, this.current.y - 31, 9.2, true, NAVY);
    });
    this.current.y -= 70;
  }

  hero(title: string, body: string, tag: string) {
    const bodyLines = wrap(body, 82).slice(0, 4);
    const height = 78 + bodyLines.length * 12;
    this.ensure(height + 12);
    const bottom = this.current.y - height;
    this.rect(46, bottom, 520, height, NAVY);
    this.rect(46, bottom, 6, height, BLUE);
    this.text(tag.toUpperCase(), 68, this.current.y - 22, 6.5, true, [0.55, 0.75, 1]);
    this.text(title, 68, this.current.y - 43, 16, true, WHITE);
    bodyLines.forEach((line, index) => this.text(line, 68, this.current.y - 64 - index * 12, 8.3, false, [0.82, 0.89, 0.97]));
    this.current.y = bottom - 20;
  }

  scores(scores: SimplifiedPlan["scores"]) {
    this.ensure(90);
    const cards: Array<[string, number | undefined]> = [["EXPERIAN", scores?.experian], ["EQUIFAX", scores?.equifax], ["TRANSUNION", scores?.transunion]];
    cards.forEach(([name, score], index) => {
      const x = 46 + index * 176;
      this.rect(x, this.current.y - 68, 166, 68, WHITE, this.current, LINE);
      this.rect(x, this.current.y - 68, 4, 68, index === 1 ? GREEN : BLUE);
      this.text(name, x + 16, this.current.y - 18, 6.4, true, MUTED);
      this.text(score ? String(score) : "Pendiente", x + 16, this.current.y - 45, score ? 20 : 12, true, NAVY);
      this.text(score ? "Puntaje reportado" : "En verificacion", x + 80, this.current.y - 43, 6.4, false, MUTED);
    });
    this.current.y -= 88;
  }

  table(headers: string[], rows: string[][], widths: number[]) {
    const rowHeight = 35;
    const headerHeight = 27;
    this.ensure(headerHeight + rowHeight + 6);
    let y = this.current.y;
    const drawHeader = () => {
      this.rect(46, y - headerHeight, 520, headerHeight, NAVY);
      let x = 46;
      headers.forEach((header, index) => {
        this.text(header.toUpperCase(), x + 8, y - 17, 6.3, true, WHITE);
        x += widths[index];
      });
      y -= headerHeight;
    };
    drawHeader();
    rows.forEach((row, rowIndex) => {
      if (y - rowHeight < 68) {
        this.current.y = y;
        this.addPage(this.current.title, this.current.subtitle);
        y = this.current.y;
        drawHeader();
      }
      this.rect(46, y - rowHeight, 520, rowHeight, rowIndex % 2 ? WHITE : PALE, this.current, LINE);
      let cellX = 46;
      row.forEach((cell, index) => {
        const clipped = wrap(cell, Math.max(8, Math.floor(widths[index] / 5.5))).slice(0, 2);
        clipped.forEach((line, lineIndex) => this.text(line, cellX + 8, y - 14 - lineIndex * 10, 7.1, index === 0, index === 0 ? NAVY : INK));
        cellX += widths[index];
      });
      y -= rowHeight;
    });
    this.current.y = y - 18;
  }

  phases() {
    this.ensure(92);
    const phases = [["01", "Verificacion", "Datos, saldos y diferencias"], ["02", "Prioridades", "Orden de revision y soportes"], ["03", "Disputas", "Cartas, envios y respuestas"], ["04", "Seguimiento", "Cambios y nuevas rondas"]];
    phases.forEach(([number, title, detail], index) => {
      const x = 46 + index * 132;
      this.rect(x, this.current.y - 71, 122, 71, index === 0 ? SKY : PALE, this.current, LINE);
      this.text(number, x + 11, this.current.y - 17, 7, true, BLUE);
      this.text(title, x + 11, this.current.y - 36, 8.2, true, NAVY);
      wrap(detail, 25).slice(0, 2).forEach((line, lineIndex) => this.text(line, x + 11, this.current.y - 51 - lineIndex * 9, 6.2, false, MUTED));
    });
    this.current.y -= 91;
  }

  callout(title: string, body: string, color: Rgb = BLUE) {
    const bodyLines = wrap(body, 86).slice(0, 4);
    const height = 45 + bodyLines.length * 11;
    this.ensure(height + 8);
    const bottom = this.current.y - height;
    this.rect(46, bottom, 520, height, PALE, this.current, LINE);
    this.rect(46, bottom, 5, height, color);
    this.text(title, 64, this.current.y - 20, 9, true, NAVY);
    bodyLines.forEach((line, index) => this.text(line, 64, this.current.y - 38 - index * 11, 7.3, false, MUTED));
    this.current.y = bottom - 16;
  }

  private image(image: PdfImage, x: number, y: number, width: number, height: number) {
    const name = `Img${this.images.length + 1}`;
    this.images.push({ ...image, name });
    const scale = Math.min(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drawX = x + (width - drawWidth) / 2;
    const drawY = y + (height - drawHeight) / 2;
    this.current.commands.push("q", `${drawWidth.toFixed(1)} 0 0 ${drawHeight.toFixed(1)} ${drawX.toFixed(1)} ${drawY.toFixed(1)} cm`, `/${name} Do`, "Q");
  }

  visualComparison(title: string, detail: string, before?: PdfImage, after?: PdfImage) {
    const description = wrap(detail || "Actualizacion visual documentada por el equipo.", 88).slice(0, 3);
    const height = 184 + description.length * 10;
    this.ensure(height + 12);
    const top = this.current.y;
    const bottom = top - height;
    this.rect(46, bottom, 520, height, PALE, this.current, LINE);
    this.text("ANTES", 62, top - 22, 6.5, true, MUTED);
    this.text("DESPUES", 327, top - 22, 6.5, true, BLUE);
    this.text(title, 62, top - 40, 10, true, NAVY);
    this.text("->", 298, top - 102, 14, true, BLUE);
    this.rect(62, top - 160, 225, 108, WHITE, this.current, LINE);
    this.rect(327, top - 160, 225, 108, WHITE, this.current, LINE);
    if (before) this.image(before, 66, top - 156, 217, 100);
    else this.text("Imagen no disponible", 114, top - 108, 7, false, MUTED);
    if (after) this.image(after, 331, top - 156, 217, 100);
    else this.text("Imagen no disponible", 379, top - 108, 7, false, MUTED);
    description.forEach((line, index) => this.text(line, 62, top - 176 - index * 10, 7.1, false, INK));
    this.current.y = bottom - 16;
  }

  toBlob() {
    const regularFontId = 3;
    const boldFontId = 4;
    const logoId = this.logo ? 5 : null;
    let nextId = this.logo ? 6 : 5;
    const imageObjects = this.images.map((image) => ({ ...image, id: nextId++ }));
    const pageIds = this.pages.map(() => nextId++);
    const contentIds = this.pages.map(() => nextId++);
    const objects: string[] = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    objects[regularFontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    objects[boldFontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
    if (this.logo && logoId) objects[logoId] = `<< /Type /XObject /Subtype /Image /Width ${this.logo.width} /Height ${this.logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${this.logo.data.length} >>\nstream\n${this.logo.data}\nendstream`;
    imageObjects.forEach((image) => {
      objects[image.id] = `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>\nstream\n${image.data}\nendstream`;
    });
    const xObjects = [
      ...(logoId ? [`/Logo ${logoId} 0 R`] : []),
      ...imageObjects.map((image) => `/${image.name} ${image.id} 0 R`),
    ];
    this.pages.forEach((page, index) => {
      this.text("OXXUS CREDIT SOLUTIONS", 46, 34, 6.3, true, NAVY, page);
      this.text("Documento confidencial", 238, 34, 6.3, false, MUTED, page);
      this.text(`Pagina ${index + 1} de ${this.pages.length}`, 502, 34, 6.3, true, MUTED, page);
      this.line(46, 48, 566, 48, 0.5, LINE, page);
      const content = page.commands.join("\n");
      objects[contentIds[index]] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
      objects[pageIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LETTER_WIDTH} ${LETTER_HEIGHT}] /Resources << /Font << /FR ${regularFontId} 0 R /FB ${boldFontId} 0 R >>${xObjects.length ? ` /XObject << ${xObjects.join(" ")} >>` : ""} >> /Contents ${contentIds[index]} 0 R >>`;
    });
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];
    for (let id = 1; id < objects.length; id += 1) {
      offsets[id] = pdf.length;
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([Uint8Array.from(pdf, (character) => character.charCodeAt(0) & 255)], { type: "application/pdf" });
  }
}

async function loadLogo(): Promise<PdfLogo | undefined> {
  try {
    const image = new Image();
    image.src = "/oxxus-logo-light-v2.png";
    await image.decode();
    // Match site rendering: transparent PNG on clean white, natural aspect.
    const width = 700;
    const height = Math.max(1, Math.round(width * (image.naturalHeight / image.naturalWidth)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const base64 = canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
    return { data: atob(base64), width, height };
  } catch {
    return undefined;
  }
}

async function loadPdfImage(source?: string | null): Promise<PdfImage | undefined> {
  if (!source) return undefined;
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = source;
    await image.decode();
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const base64 = canvas.toDataURL("image/jpeg", 0.88).split(",")[1];
    return { data: atob(base64), width, height };
  } catch {
    return undefined;
  }
}

function formatDate() {
  return new Date().toLocaleDateString("es-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatTime(value?: string | null) {
  if (!value) return "Pendiente";
  return new Date(value).toLocaleTimeString("es-US", { hour: "numeric", minute: "2-digit" });
}

function elapsed(start: string, end?: string | null) {
  const milliseconds = Math.max(0, new Date(end || Date.now()).getTime() - new Date(start).getTime());
  const minutes = Math.round(milliseconds / 60000);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function accountRows(plan: SimplifiedPlan, limit = 14) {
  if (!plan.accounts.length) return [["Revision inicial", "Clasificacion pendiente", "Por confirmar"]];
  return plan.accounts.slice(0, limit).map((account) => [account.creditor_name, issueLabels[account.issue_type || ""] || account.issue_type || "Elemento por revisar", account.bureaus.join(", ") || "Por confirmar"]);
}

function bureauCount(plan: SimplifiedPlan, bureau: string) {
  return plan.accounts.filter((account) => account.bureaus.some((item) => item.toLowerCase().includes(bureau))).length;
}

async function savePdf(fileName: string, report: OxxusPdf) {
  const url = URL.createObjectURL(report.toBlob());
  const link = window.document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createAnalysis(plan: SimplifiedPlan, logo?: PdfLogo) {
  const pdf = new OxxusPdf(logo);
  pdf.addPage("INFORME DE ANALISIS DE CREDITO", "Diagnostico ejecutivo y plan de accion OXXUS");
  pdf.meta([["Preparado para", plan.clientName || "Cliente OXXUS"], ["Expediente", plan.caseNumber], ["Fecha", formatDate()]]);
  pdf.hero("Una lectura clara para tomar accion", plan.overview, "Resumen ejecutivo");
  pdf.section("Panorama de puntuaciones", "Estado actual");
  pdf.scores(plan.scores);
  pdf.section("Hallazgos principales", "Revision del expediente");
  pdf.table(["Cuenta o acreedor", "Hallazgo", "Buro"], accountRows(plan), [210, 190, 120]);
  pdf.section("Ruta recomendada", "Plan de trabajo");
  pdf.phases();
  pdf.meta([["Nivel del caso", plan.level ? `Nivel ${plan.level}` : "Por confirmar"], ["Duracion estimada", plan.durationWeeks ? `${plan.durationWeeks} semanas` : "En evaluacion"], ["Proxima accion", plan.nextAction || "Revisar plan semanal"]]);
  pdf.callout("Conclusion del analisis", `El expediente se trabajara de forma organizada, verificando primero la informacion disponible y documentando cada paso. ${plan.nextAction ? `La siguiente accion es: ${plan.nextAction}.` : "El equipo confirmara la siguiente accion al finalizar la clasificacion."}`, GREEN);
  pdf.callout("Aviso importante", "Este informe organiza la informacion disponible y no garantiza eliminaciones ni aumentos especificos de puntuacion. Los resultados dependen de la verificacion y respuesta de los buros y acreedores.", AMBER);
  return pdf;
}

function createThreeBureau(plan: SimplifiedPlan, logo?: PdfLogo) {
  const pdf = new OxxusPdf(logo);
  pdf.addPage("RESUMEN SIMPLIFICADO DE LOS 3 BUROS", "Experian - Equifax - TransUnion en una sola lectura");
  pdf.meta([["Cliente", plan.clientName || "Cliente OXXUS"], ["Expediente", plan.caseNumber], ["Fecha", formatDate()]]);
  pdf.hero("Tres reportes, una vision organizada", "OXXUS consolida la informacion verificada de los tres buros para explicar diferencias, prioridades y proximos pasos sin reemplazar los reportes originales.", "Lectura consolidada");
  pdf.section("Puntuaciones consolidadas", "Comparacion");
  pdf.scores(plan.scores);
  pdf.section("Vista comparativa", "Resumen por buro");
  pdf.table(["Buro", "Puntuacion", "Elementos identificados", "Estado"], [["Experian", String(plan.scores?.experian || "Pendiente"), String(bureauCount(plan, "experian")), "Revisado en OXXUS"], ["Equifax", String(plan.scores?.equifax || "Pendiente"), String(bureauCount(plan, "equifax")), "Revisado en OXXUS"], ["TransUnion", String(plan.scores?.transunion || "Pendiente"), String(bureauCount(plan, "transunion")), "Revisado en OXXUS"]], [130, 105, 155, 130]);
  pdf.section("Prioridades unificadas", "Hallazgos");
  pdf.table(["Cuenta o acreedor", "Hallazgo", "Presencia"], accountRows(plan, 12), [210, 190, 120]);
  pdf.section("Como trabajaremos el caso", "Plan simplificado");
  pdf.phases();
  pdf.callout("Proximo paso", plan.nextAction || "Revisar el plan semanal, confirmar documentos y preparar la primera ronda de acciones.", GREEN);
  pdf.callout("Nota sobre este documento", "Este resumen facilita la lectura conjunta, pero no sustituye los reportes originales de Experian, Equifax y TransUnion. Conserva los archivos originales como evidencia.", AMBER);
  return pdf;
}

export async function downloadCreditAnalysis(plan: SimplifiedPlan) {
  await savePdf(`OXXUS-analisis-${plan.caseNumber}.pdf`, createAnalysis(plan, await loadLogo()));
}

export async function downloadThreeBureauSummary(plan: SimplifiedPlan) {
  await savePdf(`OXXUS-3-buros-simplificado-${plan.caseNumber}.pdf`, createThreeBureau(plan, await loadLogo()));
}

export function buildCreditAnalysisPdf(plan: SimplifiedPlan) {
  return createAnalysis(plan).toBlob();
}

export function buildThreeBureauPdf(plan: SimplifiedPlan) {
  return createThreeBureau(plan).toBlob();
}

export async function downloadSimplifiedPlan(plan: SimplifiedPlan) {
  await downloadThreeBureauSummary(plan);
}

export async function downloadWorkdayReport(data: WorkdayReportData) {
  const pdf = new OxxusPdf(await loadLogo());
  const activityCount = data.people.reduce((total, person) => total + person.activities.length, 0);
  pdf.addPage("INFORME DIARIO DE DESARROLLO", "Bitacora consolidada del equipo OXXUS");
  pdf.meta([["Fecha de jornada", data.reportDate], ["Preparado por", data.generatedBy], ["Integrantes", String(data.people.length)]]);
  pdf.hero("Trabajo visible, decisiones documentadas", `Este informe consolida ${activityCount} actividades registradas desde el inicio de la jornada de Cristhyam y Edjouner. Las sesiones se cierran manualmente o despues de seis horas sin actividad.`, "Resumen de la jornada");
  for (const person of data.people) {
    pdf.section(person.name, person.role);
    pdf.meta([["Inicio", formatTime(person.started_at)], ["Ultima actividad", formatTime(person.last_activity_at)], ["Duracion", elapsed(person.started_at, person.ended_at || person.last_activity_at)]]);
    const rows = person.activities.length
      ? person.activities.map((activity) => [formatTime(activity.created_at), activity.title, activity.detail || activity.activity_type || "Actividad registrada"])
      : [[formatTime(person.started_at), "Inicio de jornada", "Sin actividades detalladas todavia"]];
    pdf.table(["Hora", "Actividad", "Resultado o detalle"], rows, [75, 185, 260]);
    const visualActivities = person.activities.filter((activity) => activity.activity_type === "visual_update");
    if (visualActivities.length) {
      pdf.section("Cambios visuales", "Antes y despues");
      for (const activity of visualActivities) {
        const [before, after] = await Promise.all([
          loadPdfImage(activity.before_url),
          loadPdfImage(activity.after_url),
        ]);
        pdf.visualComparison(activity.title, activity.detail || "Comparacion visual de la actualizacion realizada.", before, after);
      }
    }
    pdf.callout("Estado de la sesion", person.status === "closed" ? "Jornada finalizada y lista para archivo." : "Jornada abierta. Se cerrara manualmente o al superar seis horas sin actividad.", person.status === "closed" ? GREEN : BLUE);
  }
  pdf.section("Consolidado del equipo", "Cierre");
  pdf.meta([["Personas", String(data.people.length)], ["Actividades", String(activityCount)], ["Regla AFK", "6 horas"]]);
  pdf.callout("Alcance del registro", "La bitacora incluye actividad realizada dentro de OXXUS y notas agregadas por el equipo. No lee conversaciones privadas externas de ChatGPT, correo u otras plataformas.", AMBER);
  await savePdf(`OXXUS-informe-diario-${data.reportDate.replace(/[^0-9-]/g, "-")}.pdf`, pdf);
}

export type AgentAssistReportOptions = {
  language?: "es" | "en";
  preparedBy?: string;
};

/** Owner-facing report of today's product work on the OXXUS website. */
export async function downloadAgentAssistReport(options: AgentAssistReportOptions = {}) {
  const pdf = new OxxusPdf(await loadLogo());
  const preparedBy = options.preparedBy || "Equipo de producto";

  pdf.addPage("REPORTE PARA DIRECCION", "Jornada de producto en el sitio web OXXUS");
  pdf.meta([
    ["Para", "Dueno / Direccion OXXUS"],
    ["Fecha", formatDate()],
    ["Preparado por", preparedBy],
  ]);
  pdf.hero(
    "Lo que se construyo hoy en el sitio",
    "Este documento resume, en lenguaje claro, todo el trabajo de producto aplicado al sitio web OXXUS en esta jornada: experiencia movil, dashboards, progreso de reparacion, vista por rol, y el nuevo Asistente OXXUS con proteccion de cuentas vigentes.",
    "Informe ejecutivo",
  );

  pdf.section("Resumen en una pagina", "Vista del dueno");
  pdf.table(
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
  pdf.callout(
    "Principio de la jornada",
    "Automatizar lo seguro (sugerir, clasificar, organizar) y bloquear lo peligroso (borrar tarjetas vigentes, envios autonomos, promesas de score, aprendizaje abierto en internet).",
    BLUE,
  );

  pdf.addPage("REPORTE PARA DIRECCION", "Detalle de entregas de la jornada");
  pdf.section("1. Experiencia movil y responsive", "Producto");
  pdf.paragraph(
    "Se corrigio la vista en resoluciones tipo iPhone SE (375px). La tabla de Casos recientes ya no comprime la columna de progreso: cada fila pasa a tarjeta con cliente arriba y barra de progreso a ancho completo. Tambien se estabilizo el topbar (selector Ver como, idioma y tema) para que no se desborde.",
    46,
    520,
    9,
    13,
  );
  pdf.current.y -= 6;
  pdf.paragraph(
    "Ademas se refuerzo el sistema responsive general (phone a TV): paddings fluidos, sidebar/nav movil y paneles adaptados a rangos intermedios.",
    46,
    520,
    9,
    13,
  );
  pdf.current.y -= 8;

  pdf.section("2. Progreso de reparacion del cliente", "Producto");
  pdf.paragraph(
    "Se incorporo una barra de progreso dinamica basada en el estado real del caso (reporte, analisis, validacion, prioridades, disputas y seguimiento). El cliente ve avance claro; el equipo mantiene el mismo lenguaje de fases.",
    46,
    520,
    9,
    13,
  );
  pdf.current.y -= 8;

  pdf.section("3. Vista Ver como rol (admin)", "Producto");
  pdf.paragraph(
    "El administrador puede previsualizar la interfaz como agente, cliente o colaborador web. Es solo UI: no cambia permisos reales ni datos. Sirve para validar la experiencia de cada rol sin riesgo operacional.",
    46,
    520,
    9,
    13,
  );
  pdf.current.y -= 8;

  pdf.section("4. Simplificacion de dashboards", "Producto");
  pdf.paragraph(
    "Se limpio el home del agente/admin: cola de trabajo primero, estadisticas compactas y casos recientes. En cliente: bienvenida, progreso y tarjetas de foco (proxima accion, caso, scores), sin ruido visual.",
    46,
    520,
    9,
    13,
  );

  pdf.addPage("REPORTE PARA DIRECCION", "Asistente OXXUS y proteccion del cliente");
  pdf.section("5. Asistente OXXUS (sistema integral)", "Nuevo modulo");
  pdf.paragraph(
    "Se evaluo un bot autonomo con aprendizaje en internet. Se descarto esa autonomia por riesgo legal y de calidad. En su lugar se entrego un sistema integral seguro:",
    46,
    520,
    9,
    13,
  );
  pdf.current.y -= 6;
  pdf.table(
    ["Capa", "Que hace", "Por que importa"],
    [
      ["UI agente", "Hub Asistente + copiloto en expediente", "Acelera el trabajo diario"],
      ["Clasificacion", "Protegida / Revisar / Disputable", "Evita disputar vigentes"],
      ["Candados DB", "is_protected + triggers + audit", "Impide borrados accidentales"],
      ["Knowledge", "KB versionada con aprobacion admin", "Procedimientos controlados"],
    ],
    [100, 210, 210],
  );
  pdf.callout(
    "Ubicacion en el sitio",
    "Navegacion lateral → Asistente OXXUS. Dentro del expediente del cliente: badges en cuentas + panel Copiloto. En disputas: etiquetas protegida vs disputable.",
    GREEN,
  );

  pdf.section("Lo que NO se hizo (a proposito)", "Decisiones");
  pdf.table(
    ["Descartado", "Riesgo", "Sustituto elegido"],
    [
      ["Bot que aprende solo de internet", "Consejos malos / ilegales", "KB curada + aprobacion humana"],
      ["IA que envia disputas sola", "Dano masivo al cliente", "Borrador → revision → envio"],
      ["Confiar solo en el chat", "Se puede saltar la UI", "Candado real en Postgres"],
      ["Promesas de score", "Riesgo regulatorio", "Lenguaje de procedimiento"],
    ],
    [160, 160, 200],
  );

  pdf.addPage("REPORTE PARA DIRECCION", "Estado tecnico y proximos pasos");
  pdf.section("Estado tecnico", "Entrega");
  pdf.table(
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

  pdf.section("Impacto esperado", "Negocio");
  pdf.paragraph(
    "1) Menos errores humanos al tocar cuentas vigentes. 2) Agentes mas rapidos con procedimientos estandarizados. 3) Mejor experiencia movil para operar desde el telefono. 4) Admin puede auditar la UX de cada rol. 5) Base lista para enriquecer el copiloto sin abrir riesgos legales.",
    46,
    520,
    9,
    13,
  );
  pdf.current.y -= 8;

  pdf.section("Proximos pasos recomendados", "Direccion");
  pdf.table(
    ["Prioridad", "Accion", "Dueno sugerido"],
    [
      ["1", "Aplicar migracion 026 en Supabase", "Ops / Backend"],
      ["2", "Clasificar un caso real y validar candados", "Agente + Admin"],
      ["3", "Capacitar agentes en Asistente OXXUS", "Operaciones"],
      ["4", "Publicar SOPs adicionales en la KB", "Admin producto"],
    ],
    [70, 300, 150],
  );

  pdf.callout(
    "Cierre para el dueno",
    "Hoy el sitio no solo se ve mejor en movil: gano un asistente interno responsable y proteccion estructural de las tarjetas/creditos vigentes. El valor esta en velocidad del equipo sin sacrificar la seguridad del cliente.",
    GREEN,
  );
  pdf.callout(
    "Nota",
    "Este PDF usa el mismo logo v2 del sitio (oxxus-logo-light-v2), compuesto sobre fondo blanco y con proporcion natural, como en la marca web.",
    BLUE,
  );

  await savePdf(`OXXUS-reporte-jornada-producto-${new Date().toISOString().slice(0, 10)}.pdf`, pdf);
}
