import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const SCORE_MIN = 300;
const SCORE_MAX = 850;
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
]);

type Extracted = {
  transunion: number | null;
  experian: number | null;
  equifax: number | null;
  confidence: number | null;
  notes?: string | null;
};

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
    "Content-Type": "application/json",
  };
}

function reply(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(req),
  });
}

function clampScore(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < SCORE_MIN || rounded > SCORE_MAX) return null;
  return rounded;
}

function normalizePayload(raw: Record<string, unknown>): Extracted {
  const confidenceRaw = Number(raw.confidence);
  return {
    transunion: clampScore(raw.transunion ?? raw.TransUnion ?? raw.tu),
    experian: clampScore(raw.experian ?? raw.Experian ?? raw.ex),
    equifax: clampScore(raw.equifax ?? raw.Equifax ?? raw.eq),
    confidence: Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : null,
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 280) : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return reply(req, { error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!supabaseUrl || !anonKey) {
    return reply(req, { error: "Supabase env missing" }, 500);
  }
  if (!openaiKey) {
    return reply(
      req,
      {
        error:
          "OPENAI_API_KEY is not configured on the extract-score-image function",
        code: "missing_openai_key",
      },
      503,
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return reply(req, { error: "Unauthorized" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return reply(req, { error: "Unauthorized" }, 401);
  }

  let body: {
    image_base64?: string;
    mime_type?: string;
  };
  try {
    body = await req.json();
  } catch {
    return reply(req, { error: "Invalid JSON body" }, 400);
  }

  const mime = String(body.mime_type || "").toLowerCase();
  const b64 = String(body.image_base64 || "").replace(/\s/g, "");
  if (!ALLOWED_MIME.has(mime)) {
    return reply(
      req,
      {
        error:
          "Only JPEG, PNG, or WebP screenshots are supported for score extraction",
        code: "unsupported_mime",
      },
      400,
    );
  }
  if (!b64 || b64.length < 32) {
    return reply(req, { error: "Missing image_base64" }, 400);
  }
  // Rough byte size from base64 length
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    return reply(
      req,
      { error: "Image exceeds 4 MB limit for Assist extraction", code: "too_large" },
      413,
    );
  }

  const prompt = `You extract US credit scores from a screenshot.
Return ONLY JSON with keys: transunion, experian, equifax, confidence, notes.
Each score must be an integer 300-850 or null if not clearly visible.
confidence is 0-1 for how sure you are overall.
notes is a short English string or null.
Do not invent scores. Prefer null over guessing.`;

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mime};base64,${b64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  });

  if (!openaiRes.ok) {
    const detail = await openaiRes.text();
    console.error("openai_error", openaiRes.status, detail.slice(0, 500));
    return reply(
      req,
      { error: "Vision provider failed", code: "openai_error" },
      502,
    );
  }

  const openaiJson = await openaiRes.json();
  const content = openaiJson?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return reply(req, { error: "Empty vision response" }, 502);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    return reply(req, { error: "Could not parse vision JSON" }, 502);
  }

  const scores = normalizePayload(parsed);
  const found = [scores.transunion, scores.experian, scores.equifax].some(
    (v) => v != null,
  );
  if (!found) {
    return reply(
      req,
      {
        error: "No readable bureau scores found in the image",
        code: "no_scores",
        scores,
      },
      422,
    );
  }

  return reply(req, {
    ok: true,
    scores,
    extracted_by: "oxxus_assist_vision",
    user_id: user.id,
  });
});
