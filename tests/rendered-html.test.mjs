import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the branded OXXUS application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>OXXUS Credit Solutions<\/title>/i);
  assert.match(html, /Gestión profesional de clientes, casos y disputas de crédito/);
  assert.match(html, /Preparando tu acceso/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("includes the workday report and redesigned PDF surfaces", async () => {
  const [page, layout, report, pdf, migration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/WorkdayReport.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/plan-pdf.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/023_workday_reporting.sql", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Informe diario/);
  assert.match(page, /<WorkdayTracker section=\{active\}/);
  assert.match(layout, /workday-report\.css/);
  assert.match(report, /Descargar informe combinado/);
  assert.match(report, /finish_work_session/);
  assert.match(pdf, /INFORME DE ANALISIS DE CREDITO/);
  assert.match(pdf, /RESUMEN SIMPLIFICADO DE LOS 3 BUROS/);
  assert.match(pdf, /INFORME DIARIO DE DESARROLLO/);
  assert.match(migration, /interval '6 hours'/);
  assert.match(migration, /work_activity_entries/);
});

test("supports partial bureau intake without requiring all three PDFs", async () => {
  const [onboarding, teamUpload, validation, migration] = await Promise.all([
    readFile(new URL("../app/ClientOnboarding.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/NewCase.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/uploadValidation.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/029_partial_bureau_intake.sql", import.meta.url), "utf8"),
  ]);

  assert.match(onboarding, /bureauCount > 0/);
  assert.match(teamUpload, /bureauCount > 0/);
  assert.match(validation, /export function bureauUploadCount/);
  assert.match(migration, /Submit at least one bureau PDF or one complete report/);
  assert.match(migration, /when 2 then 'OXXUS 2-Bureau Credit Analysis'/);
  assert.match(migration, /grant execute on function public\.client_submit_credit_reports/);
});
