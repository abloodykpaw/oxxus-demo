import { supabase } from "../lib/supabase";

/**
 * Score Vision / Assist extraction.
 * Keep false until OPENAI_API_KEY (or another provider) is configured in production.
 */
export const SCORE_VISION_ENABLED = false;

export type ExtractedScores = {
  transunion: number | null;
  experian: number | null;
  equifax: number | null;
  confidence: number | null;
  notes?: string | null;
};

export type ExtractScoresResult =
  | { ok: true; scores: ExtractedScores }
  | { ok: false; message: string; code?: string };

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const MAX_BYTES = 4 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Calls OXXUS Assist Vision (edge function) to prefill bureau scores.
 * Never auto-saves — caller must confirm before record_score_progress.
 */
export async function extractScoresWithAssist(
  file: File,
  language: "es" | "en" = "es",
): Promise<ExtractScoresResult> {
  const tr = (es: string, en: string) => (language === "es" ? es : en);

  if (!SCORE_VISION_ENABLED) {
    return {
      ok: false,
      code: "disabled",
      message: tr(
        "La extracción automática está desactivada por ahora. Escribe los puntajes a mano.",
        "Automatic extraction is disabled for now. Enter scores manually.",
      ),
    };
  }

  if (!IMAGE_TYPES.has((file.type || "").toLowerCase())) {
    return {
      ok: false,
      code: "unsupported_mime",
      message: tr(
        "La extracción del Asistente solo funciona con capturas JPG, PNG o WebP. Para PDF, escribe los puntajes a mano.",
        "Assist extraction only works with JPG, PNG, or WebP screenshots. For PDF, enter scores manually.",
      ),
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      code: "too_large",
      message: tr(
        "La imagen supera 4 MB. Usa una captura más liviana.",
        "Image exceeds 4 MB. Use a lighter screenshot.",
      ),
    };
  }

  let image_base64: string;
  try {
    image_base64 = await fileToBase64(file);
  } catch {
    return {
      ok: false,
      message: tr(
        "No se pudo leer la imagen.",
        "Could not read the image.",
      ),
    };
  }

  const { data, error } = await supabase.functions.invoke(
    "extract-score-image",
    {
      body: {
        image_base64,
        mime_type: file.type || "image/jpeg",
      },
    },
  );

  if (error) {
    const msg = error.message || "";
    if (/OPENAI_API_KEY|missing_openai|503/i.test(msg)) {
      return {
        ok: false,
        code: "missing_openai_key",
        message: tr(
          "El Asistente aún no tiene OPENAI_API_KEY en la función extract-score-image. Configúrala en Supabase Secrets.",
          "Assist does not have OPENAI_API_KEY on extract-score-image yet. Set it in Supabase Secrets.",
        ),
      };
    }
    return {
      ok: false,
      message: tr(
        "No se pudo contactar al Asistente OXXUS. Inténtalo de nuevo.",
        "Could not reach OXXUS Assist. Try again.",
      ),
    };
  }

  const payload = data as {
    ok?: boolean;
    scores?: ExtractedScores;
    error?: string;
    code?: string;
  };

  if (payload?.code === "missing_openai_key") {
    return {
      ok: false,
      code: "missing_openai_key",
      message: tr(
        "Falta OPENAI_API_KEY en la edge function. Añádela en Supabase y vuelve a desplegar.",
        "OPENAI_API_KEY is missing on the edge function. Add it in Supabase and redeploy.",
      ),
    };
  }

  if (payload?.code === "no_scores" || !payload?.scores) {
    return {
      ok: false,
      code: payload?.code || "no_scores",
      message: tr(
        "No se leyeron puntajes claros. Revisa la captura o escribe los valores a mano.",
        "No clear scores were read. Check the screenshot or enter values manually.",
      ),
    };
  }

  if (!payload.ok) {
    return {
      ok: false,
      code: payload.code,
      message:
        payload.error ||
        tr(
          "La extracción no pudo completarse.",
          "Extraction could not be completed.",
        ),
    };
  }

  return { ok: true, scores: payload.scores };
}

export function scoresToFormFields(scores: ExtractedScores) {
  return {
    transunion: scores.transunion != null ? String(scores.transunion) : "",
    experian: scores.experian != null ? String(scores.experian) : "",
    equifax: scores.equifax != null ? String(scores.equifax) : "",
  };
}
