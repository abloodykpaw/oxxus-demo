import fs from "node:fs";

const path = "app/page.tsx";
let src = fs.readFileSync(path, "utf8");

// 1) Client nav includes plan view
src = src.replace(
  `const finalNav = isClient
    ? needsOnboarding
      ? ["Análisis de reporte"]
      : [
          "Dashboard",
          "Ayuda y recursos",
          "Documentos",
        ]`,
  `const finalNav = isClient
    ? needsOnboarding
      ? ["Análisis de reporte"]
      : [
          "Dashboard",
          "Análisis de reporte",
          "Ayuda y recursos",
          "Documentos",
        ]`,
);

// 2) Nav label for client plan
src = src.replace(
  `{x === "Análisis de reporte" && isClient
                  ? tr("Completar expediente", "Complete case file")
                  : language === "en"
                    ? navEnglish[x] || x
                    : x}`,
  `{x === "Análisis de reporte" && isClient
                  ? needsOnboarding
                    ? tr("Completar expediente", "Complete case file")
                    : tr("Mi plan", "My plan")
                  : language === "en"
                    ? navEnglish[x] || x
                    : x}`,
);

const startMarker = `            <>
              {isClient && cases[0] && (
                <ClientCreditReportPortal
                  caseRecord={cases[0]}
                  onUpdated={loadData}
                />
              )}
              <section className="welcome">`;

const endMarker = `              {isRealAdmin && !isPreviewing && (
                <section className="temporary-access-card" aria-label="Acceso temporal para clientes">`;

const start = src.indexOf(startMarker);
const end = src.indexOf(endMarker);
if (start < 0 || end < 0) {
  console.error("markers missing", { start, end });
  // try alternate portal prop names
  console.log(
    "has portal",
    src.includes("ClientCreditReportPortal"),
    "has welcome",
    src.includes('<section className="welcome">'),
    "has temp",
    src.includes("temporary-access-card"),
  );
  process.exit(1);
}

const replacement = `            <>
              <section className="welcome">
                <div>
                  <p className="eyebrow">
                    {isClient
                      ? tr("TU PROCESO OXXUS", "YOUR OXXUS JOURNEY")
                      : tr("CENTRO DE OPERACIONES", "OPERATIONS CENTER")}
                  </p>
                  <h2>
                    {tr("Buenos días", "Welcome")}, {userName.split(" ")[0]}
                  </h2>
                  <p>
                    {isClient
                      ? tr(
                          "Aquí ves tu avance, tu próxima acción y el estado de tu caso.",
                          "Here you can see your progress, next action, and case status.",
                        )
                      : tr(
                          "Empieza por la cola de trabajo. El detalle queda en cada expediente.",
                          "Start with the work queue. Details live inside each case file.",
                        )}
                  </p>
                </div>
                {!isClient && (
                  <div className="welcome-actions">
                    <button
                      className="primary"
                      onClick={() => setActive("Análisis de reporte")}
                    >
                      <IconPlus size={16} />
                      <span className="btn-label">
                        {tr("Analizar reporte", "Analyze report")}
                      </span>
                    </button>
                    {viewRole === "admin" && (
                      <button
                        className="secondary"
                        onClick={() => setActive("Enviar invitación")}
                      >
                        <span className="btn-label">
                          {tr("Enviar invitación", "Send invitation")}
                        </span>
                      </button>
                    )}
                  </div>
                )}
                {isClient && cases[0] && (
                  <div className="welcome-actions">
                    <button
                      className="primary"
                      onClick={() => setSelectedCase(cases[0])}
                    >
                      {tr("Ver mi expediente", "View my case file")}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setActive("Análisis de reporte")}
                    >
                      {tr("Ver mi plan", "View my plan")}
                    </button>
                  </div>
                )}
              </section>

              {isClient ? (
                <>
                  {cases[0] ? (
                    <>
                      <RepairProgressBar
                        caseRecord={{
                          level: cases[0].level,
                          current_week: cases[0].current_week,
                          duration_weeks: cases[0].duration_weeks,
                          next_action: cases[0].next_action,
                          has_report:
                            cases[0].has_report ||
                            (cases[0].credit_reports?.length ?? 0) > 0,
                          reportCount: cases[0].credit_reports?.length ?? 0,
                          status: cases[0].status,
                        }}
                        language={language}
                      />
                      <section className="client-focus" aria-label={tr("Resumen de tu caso", "Your case summary")}>
                        <article className="client-focus-card next">
                          <p className="eyebrow">{tr("PRÓXIMA ACCIÓN", "NEXT ACTION")}</p>
                          <h3>
                            {cases[0].next_action ||
                              tr("Revisar tu expediente", "Review your case file")}
                          </h3>
                          <p>
                            {tr(
                              \`Caso \${cases[0].case_number} · Semana \${cases[0].current_week}\${cases[0].duration_weeks ? \` de \${cases[0].duration_weeks}\` : ""}\`,
                              \`Case \${cases[0].case_number} · Week \${cases[0].current_week}\${cases[0].duration_weeks ? \` of \${cases[0].duration_weeks}\` : ""}\`,
                            )}
                          </p>
                          <button
                            className="primary"
                            onClick={() => setSelectedCase(cases[0])}
                          >
                            {tr("Abrir expediente", "Open case file")}
                          </button>
                        </article>
                        <article className="client-focus-card">
                          <p className="eyebrow">{tr("TU CASO", "YOUR CASE")}</p>
                          <h3>{cases[0].case_number}</h3>
                          <p>
                            {cases[0].level
                              ? tr(\`Nivel \${cases[0].level} · Activo\`, \`Level \${cases[0].level} · Active\`)
                              : tr("Pendiente de análisis", "Pending analysis")}
                          </p>
                          <small>
                            {tr("Cuentas a revisar", "Accounts to review")}:{" "}
                            <b>{accounts.length}</b>
                          </small>
                        </article>
                        <article className="client-focus-card scores">
                          <p className="eyebrow">{tr("PUNTAJES", "SCORES")}</p>
                          <div className="client-score-row">
                            {(["transunion", "experian", "equifax"] as const).map((bureau) => {
                              const score =
                                cases[0].credit_reports?.[0]?.credit_scores?.find(
                                  (s) => s.bureau === bureau,
                                )?.score;
                              return (
                                <div key={bureau}>
                                  <small>{bureauLabel[bureau]}</small>
                                  <strong>{score ?? "—"}</strong>
                                </div>
                              );
                            })}
                          </div>
                          <button
                            className="secondary"
                            onClick={() => setActive("Análisis de reporte")}
                          >
                            {tr("Ver análisis", "View analysis")}
                          </button>
                        </article>
                      </section>
                    </>
                  ) : (
                    <section className="panel">
                      <h3>{tr("Tu expediente se está preparando", "Your case is being prepared")}</h3>
                      <p>
                        {tr(
                          "Cuando el equipo registre tu caso, verás aquí el avance y la próxima acción.",
                          "When the team registers your case, you will see progress and the next action here.",
                        )}
                      </p>
                    </section>
                  )}
                </>
              ) : (
                <>
                  <section className="stats stats-compact">
                    <article>
                      <div className="stat-icon blue">
                        <IconUsers size={20} />
                      </div>
                      <div>
                        <p>{tr("CLIENTES ACTIVOS", "ACTIVE CLIENTS")}</p>
                        <strong>{clients.length}</strong>
                        <small>{tr("En tu portafolio", "In your portfolio")}</small>
                      </div>
                    </article>
                    <article>
                      <div className="stat-icon violet">
                        <IconSwap size={20} />
                      </div>
                      <div>
                        <p>{tr("CUENTAS NEGATIVAS", "NEGATIVE ACCOUNTS")}</p>
                        <strong>{accounts.length}</strong>
                        <small>{tr("Detectadas", "Detected")}</small>
                      </div>
                    </article>
                    <article>
                      <div className="stat-icon amber">
                        <IconAlert size={20} />
                      </div>
                      <div>
                        <p>{tr("PLANES LISTOS", "PLANS READY")}</p>
                        <strong>
                          {cases.filter((c) => c.level !== null).length}
                        </strong>
                        <small className="warn">
                          {tr("Confirmar envíos", "Confirm mailings")}
                        </small>
                      </div>
                    </article>
                    {viewRole === "admin" && (
                      <article>
                        <div className="stat-icon green">
                          <IconCheck size={20} />
                        </div>
                        <div>
                          <p>{tr("USUARIOS", "USERS")}</p>
                          <strong>{profiles.length}</strong>
                          <small className="up">{tr("Autorizados", "Authorized")}</small>
                        </div>
                      </article>
                    )}
                  </section>

                  <section className="panel attention work-queue">
                    <div className="panel-heading">
                      <div>
                        <h3>{tr("Cola de trabajo", "Work queue")}</h3>
                        <p>
                          {tr(
                            "Lo más urgente ahora. Abre el expediente para el detalle.",
                            "What needs attention now. Open the case for details.",
                          )}
                        </p>
                      </div>
                      <button onClick={() => setActive("Clientes")}>
                        {tr("Ver clientes →", "View clients →")}
                      </button>
                    </div>
                    <div className="task-list">
                      {cases.length === 0 ? (
                        <p className="empty-queue">
                          {tr(
                            "No hay casos pendientes en esta vista.",
                            "There are no pending cases in this view.",
                          )}
                        </p>
                      ) : (
                        cases.slice(0, 6).map((c) => (
                          <button key={c.id} onClick={() => setSelectedCase(c)}>
                            <span className="task-icon amber">
                              <IconAlert size={16} />
                            </span>
                            <span>
                              <b>
                                {c.next_action ||
                                  tr("Revisar expediente", "Review case file")}
                              </b>
                              <small>
                                {fullName(c.clients)} · {c.case_number}
                              </small>
                            </span>
                            <em>
                              {c.level
                                ? tr(
                                    \`Semana \${c.current_week}\`,
                                    \`Week \${c.current_week}\`,
                                  )
                                : tr("Análisis", "Analysis")}
                            </em>
                            <i>
                              <IconChevron size={16} />
                            </i>
                          </button>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="panel cases">
                    <div className="panel-heading">
                      <div>
                        <h3>{tr("Casos recientes", "Recent cases")}</h3>
                        <p>
                          {tr(
                            "Resumen rápido. Usa la cola de arriba para priorizar.",
                            "Quick summary. Use the queue above to prioritize.",
                          )}
                        </p>
                      </div>
                      <button onClick={() => setActive("Clientes")}>
                        {tr("Ver todos →", "View all →")}
                      </button>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{tr("CLIENTE", "CLIENT")}</th>
                            <th>{tr("CASO", "CASE")}</th>
                            <th>{tr("NIVEL", "LEVEL")}</th>
                            <th>{tr("PROGRESO", "PROGRESS")}</th>
                            <th>{tr("PRÓXIMA ACCIÓN", "NEXT ACTION")}</th>
                            <th>{tr("ESTADO", "STATUS")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cases.slice(0, 8).map((c) => (
                            <tr
                              key={c.id}
                              className="clickable-row"
                              onClick={() => setSelectedCase(c)}
                            >
                              <td>
                                <div className="person blue-person">
                                  {initials(fullName(c.clients))}
                                </div>
                                <span>
                                  <b>{fullName(c.clients)}</b>
                                  <small>{scoresFor(c)}</small>
                                </span>
                              </td>
                              <td>
                                <span className="case-id">{c.case_number}</span>
                              </td>
                              <td>
                                <span
                                  className={\`level \${c.level ? \`level\${c.level}\` : ""}\`}
                                >
                                  {c.level
                                    ? tr(\`Nivel \${c.level}\`, \`Level \${c.level}\`)
                                    : tr("Pendiente", "Pending")}
                                </span>
                              </td>
                              <td>
                                <div className="progress">
                                  <i
                                    style={{
                                      width: c.duration_weeks
                                        ? \`\${Math.min(100, (c.current_week / c.duration_weeks) * 100)}%\`
                                        : "0%",
                                    }}
                                  />
                                  <small>
                                    {c.duration_weeks
                                      ? tr(
                                          \`Semana \${c.current_week} de \${c.duration_weeks}\`,
                                          \`Week \${c.current_week} of \${c.duration_weeks}\`,
                                        )
                                      : tr(
                                          "Pendiente de análisis",
                                          "Pending analysis",
                                        )}
                                  </small>
                                </div>
                              </td>
                              <td>{c.next_action}</td>
                              <td>
                                <span className="status waiting">
                                  {c.level
                                    ? tr("Plan preparado", "Plan ready")
                                    : tr(
                                        "Pendiente de análisis",
                                        "Pending analysis",
                                      )}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}

              `;

src = src.slice(0, start) + replacement + src.slice(end);
fs.writeFileSync(path, src);
console.log("dashboard simplified", {
  navOk: src.includes('"Análisis de reporte",\n          "Ayuda'),
  clientFocus: src.includes("client-focus"),
  workQueue: src.includes("work-queue"),
  noTrustOnDash:
    !src.slice(src.indexOf("TU PROCESO OXXUS"), src.indexOf("temporary-access-card")).includes(
      "trust-rail",
    ),
});
