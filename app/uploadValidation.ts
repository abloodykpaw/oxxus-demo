/** Shared intake rules for credit-report uploads (step 1: PDF only). */

export const PDF_ACCEPT = "application/pdf,.pdf";

export const PDF_MAX_BYTES = 25 * 1024 * 1024;

export function isPdfFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (type === "application/pdf") return true;
  // Some browsers leave type empty or use octet-stream for PDFs.
  if (
    (!type || type === "application/octet-stream") &&
    name.endsWith(".pdf")
  ) {
    return true;
  }
  return false;
}

export function bureauUploadCount(
  reports: Record<string, File | null>,
): number {
  return Object.values(reports).filter(Boolean).length;
}

export function pdfIntakeError(
  file: File,
  language: "es" | "en" = "es",
): string | null {
  if (!isPdfFile(file)) {
    return language === "es"
      ? "En esta etapa solo se permiten reportes en PDF. Las capturas de pantalla se usan más adelante para puntajes."
      : "At this stage only PDF reports are allowed. Screenshots are used later for score updates.";
  }
  if (file.size > PDF_MAX_BYTES) {
    return language === "es"
      ? "Cada archivo debe pesar 25 MB o menos."
      : "Each file must be 25 MB or less.";
  }
  return null;
}
