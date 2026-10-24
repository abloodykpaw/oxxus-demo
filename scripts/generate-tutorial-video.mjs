/**
 * Genera tutoriales ES + EN (720x1280) con voz neural Edge TTS
 * y logo v2 integrado como en el sitio (sin placa blanca).
 *
 * Run: node scripts/generate-tutorial-video.mjs
 *      node scripts/generate-tutorial-video.mjs --lang=es
 *      node scripts/generate-tutorial-video.mjs --lang=en
 */
import { mkdirSync, existsSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const workDir = join(root, "scripts", "tutorial-video", ".build");
const slidesHtml = join(root, "scripts", "tutorial-video", "slides.html");

const VOICES = {
  es: "es-MX-DaliaNeural",
  en: "en-US-JennyNeural",
};

const OUTPUTS = {
  es: {
    public: join(root, "public", "oxxus-tutorial-reportes-credito.es.mp4"),
    legacy: join(root, "public", "oxxus-tutorial-reportes-credito.mp4"),
    desktop: join(process.env.USERPROFILE || "", "Desktop", "OXXUS_tutorial_reportes_credito_ES.mp4"),
  },
  en: {
    public: join(root, "public", "oxxus-tutorial-reportes-credito.en.mp4"),
    desktop: join(process.env.USERPROFILE || "", "Desktop", "OXXUS_tutorial_credit_reports_EN.mp4"),
  },
};

const SLIDES = {
  es: [
    {
      id: "brand",
      duration: 5,
      animated: true,
      narration:
        "OXXUS Credit Solutions. Guía para obtener y enviar tus reportes de crédito.",
    },
    {
      id: "intro",
      duration: 12,
      narration:
        "Antes de comenzar, usa una red privada y segura. OXXUS nunca pide tus credenciales de los burós. Descarga tú mismo los reportes y súbelos solo en PDF.",
    },
    {
      id: "1",
      duration: 12,
      narration:
        "Paso uno. Abre Annual Credit Report punto com, el sitio oficial para solicitar tus reportes gratuitos. Confirma la dirección antes de continuar.",
    },
    {
      id: "2",
      duration: 11,
      narration:
        "Paso dos. Selecciona Experian, Equifax y TransUnion. Cada buró entrega su reporte por separado.",
    },
    {
      id: "3",
      duration: 12,
      narration:
        "Paso tres. Verifica tu identidad respondiendo directamente en el sitio del buró. Responde solo lo que reconozcas.",
    },
    {
      id: "4",
      duration: 12,
      narration:
        "Paso cuatro. Descarga o guarda cada reporte en PDF antes de salir. OXXUS solo acepta archivos PDF en la carga inicial.",
    },
    {
      id: "5",
      duration: 12,
      narration:
        "Paso cinco. Regresa a OXXUS y sube un PDF por cada buró. También puedes cargar un reporte completo si ya lo tienes.",
    },
    {
      id: "6",
      duration: 13,
      narration:
        "Paso seis. Pulsa Analiza mis documentos para enviar tus PDF al Asistente OXXUS. El equipo los recibirá en cola de análisis.",
    },
  ],
  en: [
    {
      id: "brand",
      duration: 5,
      animated: true,
      narration:
        "OXXUS Credit Solutions. Your guide to get and send your credit reports.",
    },
    {
      id: "intro",
      duration: 12,
      narration:
        "Before you start, use a private and secure network. OXXUS never asks for your bureau credentials. Download the reports yourself and upload them as PDF only.",
    },
    {
      id: "1",
      duration: 12,
      narration:
        "Step one. Open AnnualCreditReport.com, the official site for free credit reports. Confirm the address before you continue.",
    },
    {
      id: "2",
      duration: 11,
      narration:
        "Step two. Select Experian, Equifax, and TransUnion. Each bureau delivers its own report separately.",
    },
    {
      id: "3",
      duration: 12,
      narration:
        "Step three. Verify your identity by answering directly on the bureau website. Answer only what you recognize.",
    },
    {
      id: "4",
      duration: 12,
      narration:
        "Step four. Download or save each report as a PDF before you leave. OXXUS only accepts PDF files for the initial upload.",
    },
    {
      id: "5",
      duration: 12,
      narration:
        "Step five. Return to OXXUS and upload one PDF for each bureau. You can also upload a complete report if you already have one.",
    },
    {
      id: "6",
      duration: 13,
      narration:
        "Step six. Tap Analyze my documents to send your PDFs to OXXUS Assist. The team will receive them in the analysis queue.",
    },
  ],
};

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", stdio: "pipe", ...opts });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")}\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function ensurePlaywright() {
  try {
    run("npx", ["playwright", "--version"], { cwd: root });
  } catch {
    console.log("Installing Playwright Chromium…");
    spawnSync("npx", ["playwright", "install", "chromium"], {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
  }
}

function ensureEdgeTts() {
  const check = spawnSync("python", ["-m", "edge_tts", "--list-voices"], {
    encoding: "utf8",
  });
  if (check.status !== 0) {
    console.log("Installing edge-tts…");
    run("python", ["-m", "pip", "install", "edge-tts", "-q"]);
  }
}

async function renderSlides(lang) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  const fileUrl = `file:///${slidesHtml.replace(/\\/g, "/")}`;
  await page.goto(fileUrl, { waitUntil: "networkidle" });
  await page.evaluate((l) => {
    document.documentElement.lang = l;
  }, lang);
  await page.waitForTimeout(900);

  const langDir = join(workDir, lang);
  mkdirSync(langDir, { recursive: true });

  for (const slide of SLIDES[lang]) {
    const el = page.locator(`[data-slide="${slide.id}"]`);
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: join(langDir, `${slide.id}.png`) });
    console.log(`[${lang}] rendered ${slide.id}`);
  }
  await browser.close();
}

function synthesizeSpeech(text, voice, outMp3) {
  run("python", [
    "-m",
    "edge_tts",
    "--voice",
    voice,
    "--rate=-4%",
    "--pitch=+0Hz",
    "--text",
    text,
    "--write-media",
    outMp3,
  ]);
}

function probeDuration(file) {
  const out = run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const n = parseFloat(String(out).trim());
  return Number.isFinite(n) ? n : 0;
}

/** Exact A/V duration: video = audio + tail pad (no drift). */
function segmentDuration(audio, fallbackSec) {
  if (!existsSync(audio)) return fallbackSec;
  // Small breathing room after narration so cuts don't feel abrupt
  return Math.round((probeDuration(audio) + 0.45) * 1000) / 1000;
}

function buildBrandSegment(png, audio, outMp4, duration) {
  const hasAudio = existsSync(audio);
  const frames = Math.max(48, Math.round(duration * 24));
  const fadeOutStart = Math.max(0.8, duration - 0.5);
  const vf = [
    `scale=720:1280:force_original_aspect_ratio=decrease`,
    `pad=720:1280:(ow-iw)/2:(oh-ih)/2`,
    `zoompan=z='min(1.12,0.92+0.20*on/${frames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=24`,
    `fade=t=in:st=0:d=0.55`,
    `fade=t=out:st=${fadeOutStart}:d=0.45`,
    `format=yuv420p`,
  ].join(",");

  const args = [
    "-y",
    "-loop",
    "1",
    "-framerate",
    "24",
    "-t",
    String(duration),
    "-i",
    png,
  ];
  if (hasAudio) {
    args.push("-i", audio);
  } else {
    args.push("-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono:d=${duration}`);
  }
  args.push(
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-ac",
    "1",
  );
  if (hasAudio) {
    args.push("-af", `apad=whole_dur=${duration},loudnorm=I=-16:TP=-1.5:LRA=11`);
  }
  args.push("-t", String(duration), "-fps_mode", "cfr", "-r", "24", outMp4);
  run("ffmpeg", args);
}

function buildSegment(png, audio, outMp4, fallbackSec, animated = false) {
  const duration = segmentDuration(audio, fallbackSec);
  if (animated) {
    buildBrandSegment(png, audio, outMp4, duration);
    return;
  }
  const hasAudio = existsSync(audio);
  const args = [
    "-y",
    "-loop",
    "1",
    "-framerate",
    "24",
    "-t",
    String(duration),
    "-i",
    png,
  ];
  if (hasAudio) {
    args.push("-i", audio);
  } else {
    args.push("-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono:d=${duration}`);
  }
  args.push(
    "-vf",
    "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
    "-c:v",
    "libx264",
    "-tune",
    "stillimage",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-ac",
    "1",
  );
  if (hasAudio) {
    args.push("-af", `apad=whole_dur=${duration},loudnorm=I=-16:TP=-1.5:LRA=11`);
  }
  args.push("-t", String(duration), "-fps_mode", "cfr", "-r", "24", outMp4);
  run("ffmpeg", args);
}

function concatSegments(segmentPaths, outPath) {
  const listFile = join(workDir, "concat.txt");
  writeFileSync(
    listFile,
    segmentPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"),
  );
  run("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-fflags",
    "+genpts",
    "-fps_mode",
    "cfr",
    "-af",
    "aresample=async=1:first_pts=0",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "24",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-ac",
    "1",
    "-movflags",
    "+faststart",
    outPath,
  ]);
}

async function buildLang(lang) {
  const slides = SLIDES[lang];
  const voice = VOICES[lang];
  const langDir = join(workDir, lang);
  mkdirSync(langDir, { recursive: true });

  await renderSlides(lang);

  const segments = [];
  for (const slide of slides) {
    const png = join(langDir, `${slide.id}.png`);
    const mp3 = join(langDir, `${slide.id}.mp3`);
    const seg = join(langDir, `${slide.id}.mp4`);
    console.log(`[${lang}] voice ${slide.id} (${voice})`);
    synthesizeSpeech(slide.narration, voice, mp3);
    buildSegment(png, mp3, seg, slide.duration, Boolean(slide.animated));
    segments.push(seg);
  }

  const out = OUTPUTS[lang];
  concatSegments(segments, out.public);
  if (out.legacy) copyFileSync(out.public, out.legacy);
  try {
    copyFileSync(out.public, out.desktop);
    console.log(`[${lang}] Desktop: ${out.desktop}`);
  } catch {
    console.warn(`[${lang}] Could not copy to Desktop`);
  }

  const probe = spawnSync(
    "ffprobe",
    ["-v", "quiet", "-show_entries", "format=duration,size", "-of", "default=noprint_wrappers=1", out.public],
    { encoding: "utf8" },
  );
  console.log(`[${lang}] Wrote ${out.public}`);
  console.log(probe.stdout?.trim() || "");
}

async function main() {
  mkdirSync(workDir, { recursive: true });
  ensurePlaywright();
  ensureEdgeTts();

  const only = argValue("lang");
  const langs = only ? [only] : ["es", "en"];
  for (const lang of langs) {
    if (!SLIDES[lang]) throw new Error(`Unknown lang: ${lang}`);
    await buildLang(lang);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
