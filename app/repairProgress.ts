export type RepairPhaseId =
  | "report"
  | "analysis"
  | "validation"
  | "priorities"
  | "disputes"
  | "followup";

export type RepairPhaseStatus = "done" | "current" | "upcoming";

export type RepairPhase = {
  id: RepairPhaseId;
  status: RepairPhaseStatus;
  labelEs: string;
  labelEn: string;
  hintEs: string;
  hintEn: string;
};

export type RepairProgressInput = {
  level: number | null;
  current_week: number;
  duration_weeks: number | null;
  next_action?: string | null;
  has_report?: boolean;
  reportCount?: number;
  status?: string;
};

export type RepairProgress = {
  percent: number;
  weekLabelEs: string;
  weekLabelEn: string;
  phaseLabelEs: string;
  phaseLabelEn: string;
  nextActionEs: string;
  nextActionEn: string;
  phases: RepairPhase[];
  hasPlan: boolean;
};

const PHASES: Omit<RepairPhase, "status">[] = [
  {
    id: "report",
    labelEs: "Reporte",
    labelEn: "Report",
    hintEs: "Carga de tu historial",
    hintEn: "Upload your credit history",
  },
  {
    id: "analysis",
    labelEs: "Analisis",
    labelEn: "Analysis",
    hintEs: "Plan del equipo OXXUS",
    hintEn: "OXXUS team plan",
  },
  {
    id: "validation",
    labelEs: "Validacion",
    labelEn: "Validation",
    hintEs: "Datos y diferencias",
    hintEn: "Data and discrepancies",
  },
  {
    id: "priorities",
    labelEs: "Prioridades",
    labelEn: "Priorities",
    hintEs: "Orden de revision",
    hintEn: "Review order",
  },
  {
    id: "disputes",
    labelEs: "Disputas",
    labelEn: "Disputes",
    hintEs: "Cartas y respuestas",
    hintEn: "Letters and replies",
  },
  {
    id: "followup",
    labelEs: "Seguimiento",
    labelEn: "Follow-up",
    hintEs: "Cambios y rondas",
    hintEn: "Changes and rounds",
  },
];

function currentPhaseId(input: RepairProgressInput): RepairPhaseId {
  const hasReport =
    Boolean(input.has_report) || (input.reportCount ?? 0) > 0;
  if (!hasReport) return "report";
  if (input.level == null) return "analysis";
  const week = Math.max(0, Number(input.current_week) || 0);
  if (week <= 1) return "validation";
  if (week <= 3) return "priorities";
  if (week <= 7) return "disputes";
  return "followup";
}

function phasePercent(id: RepairPhaseId, input: RepairProgressInput): number {
  const duration = Math.max(1, Number(input.duration_weeks) || 12);
  const week = Math.max(0, Number(input.current_week) || 0);
  switch (id) {
    case "report":
      return 8;
    case "analysis":
      return 18;
    case "validation":
      return 28;
    case "priorities":
      return 42;
    case "disputes":
      return Math.min(78, 55 + Math.round((week / duration) * 20));
    case "followup": {
      const done =
        String(input.status || "").toLowerCase() === "completed" ||
        week >= duration;
      if (done) return 100;
      return Math.min(96, 82 + Math.round((week / duration) * 14));
    }
    default:
      return 0;
  }
}

/** Normalize for lookup: lowercase + strip accents. */
function normKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const NEXT_ACTION_EN: Record<string, string> = {
  "preparar analisis visual del reporte de credito":
    "Prepare a visual analysis of the credit report",
  "preparar analisis comparativo de los tres buros":
    "Prepare a comparative analysis of the three bureaus",
  "analizar el reporte de credito cargado":
    "Analyze the uploaded credit report",
  "sube tu reporte de credito": "Upload your credit report",
  "espera el analisis del equipo": "Wait for the team analysis",
  "revision del asistente oxxus": "OXXUS Assist review",
  "revisa tu proxima accion semanal": "Review your next weekly action",
  "revisar tu expediente": "Review your case file",
  "revisar el plan semanal": "Review the weekly plan",
  "revisar expediente": "Review case file",
};

/**
 * Localize known next_action strings stored in Spanish in the DB.
 * Unknown custom text is returned as-is.
 */
export function localizeNextAction(
  action: string | null | undefined,
  language: "es" | "en" = "es",
): string {
  const raw = action?.trim();
  if (!raw) {
    return language === "es"
      ? "Revisar tu expediente"
      : "Review your case file";
  }
  if (language === "es") return raw;
  return NEXT_ACTION_EN[normKey(raw)] || raw;
}

export function getRepairProgress(input: RepairProgressInput): RepairProgress {
  const activeId = currentPhaseId(input);
  const activeIndex = PHASES.findIndex((phase) => phase.id === activeId);
  const phases: RepairPhase[] = PHASES.map((phase, index) => ({
    ...phase,
    status:
      index < activeIndex
        ? "done"
        : index === activeIndex
          ? "current"
          : "upcoming",
  }));
  const active = phases[activeIndex] ?? phases[0];
  const hasPlan = input.level != null;
  const duration = input.duration_weeks;
  const week = Math.max(0, Number(input.current_week) || 0);
  const fallbackEs =
    activeId === "report"
      ? "Sube tu reporte de credito"
      : activeId === "analysis"
        ? "Revisión del Asistente OXXUS"
        : "Revisa tu proxima accion semanal";
  const nextEs = input.next_action?.trim() || fallbackEs;
  const nextEn = localizeNextAction(nextEs, "en");

  return {
    percent: phasePercent(activeId, input),
    weekLabelEs: hasPlan
      ? duration
        ? `Semana ${week} de ${duration}`
        : `Semana ${week}`
      : "Plan en preparacion",
    weekLabelEn: hasPlan
      ? duration
        ? `Week ${week} of ${duration}`
        : `Week ${week}`
      : "Plan in preparation",
    phaseLabelEs: active.labelEs,
    phaseLabelEn: active.labelEn,
    nextActionEs: nextEs,
    nextActionEn: nextEn,
    phases,
    hasPlan,
  };
}
