"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { downloadWorkdayReport, type WorkdayPerson } from "./plan-pdf";

type Profile = { id: string; full_name: string | null; role: string };
type Activity = { id: string; title: string; detail: string | null; activity_type: string; metadata?: { before_path?: string; after_path?: string }; before_url?: string; after_url?: string; created_at: string };
type WorkSession = { id: string; user_id: string; work_date: string; started_at: string; last_activity_at: string; ended_at: string | null; status: string; display_name: string; role: string; work_activity_entries: Activity[] };

function localDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function clock(value: string) {
  return new Date(value).toLocaleTimeString("es-US", { hour: "numeric", minute: "2-digit" });
}

function roleName(role: string) {
  return role === "admin" ? "Administrador" : role === "web_collaborator" ? "Colaborador del sitio web" : "Equipo OXXUS";
}

export function WorkdayTracker({ section }: { section: string }) {
  const lastSection = useRef("");
  const lastInput = useRef(Date.now());

  useEffect(() => {
    const markInput = () => { lastInput.current = Date.now(); };
    window.addEventListener("pointerdown", markInput, { passive: true });
    window.addEventListener("keydown", markInput);
    void supabase.rpc("touch_work_session", { p_activity_type: "presence", p_title: "Acceso al portal", p_detail: "Inicio automatico de actividad en OXXUS." });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastInput.current < 15 * 60 * 1000) {
        void supabase.rpc("touch_work_session", { p_activity_type: "presence", p_title: null, p_detail: null });
      }
    }, 5 * 60 * 1000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", markInput);
      window.removeEventListener("keydown", markInput);
    };
  }, []);

  useEffect(() => {
    if (!section || section === lastSection.current) return;
    lastSection.current = section;
    void supabase.rpc("touch_work_session", { p_activity_type: "navigation", p_title: `Trabajo en ${section}`, p_detail: `Se abrio la seccion ${section}.` });
  }, [section]);

  return null;
}

export default function WorkdayReport({ viewer }: { viewer: Profile }) {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [note, setNote] = useState("");
  const [visualTitle, setVisualTitle] = useState("");
  const [visualDetail, setVisualDetail] = useState("");
  const [beforeImage, setBeforeImage] = useState<File | null>(null);
  const [afterImage, setAfterImage] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const reportDate = localDate();

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("work_sessions").select("id,user_id,work_date,started_at,last_activity_at,ended_at,status,display_name,role,work_activity_entries(id,title,detail,activity_type,metadata,created_at)").eq("work_date", reportDate).order("started_at", { ascending: true });
    if (error) setMessage("La bitacora estara disponible cuando se aplique la actualizacion de base de datos.");
    else {
      const hydrated = await Promise.all(((data || []) as WorkSession[]).map(async (session) => ({
        ...session,
        work_activity_entries: await Promise.all((session.work_activity_entries || []).map(async (activity) => {
          const [before, after] = await Promise.all([
            activity.metadata?.before_path ? supabase.storage.from("workday-visuals").createSignedUrl(activity.metadata.before_path, 3600) : Promise.resolve({ data: null }),
            activity.metadata?.after_path ? supabase.storage.from("workday-visuals").createSignedUrl(activity.metadata.after_path, 3600) : Promise.resolve({ data: null }),
          ]);
          return { ...activity, before_url: before.data?.signedUrl, after_url: after.data?.signedUrl };
        })),
      })));
      setSessions(hydrated);
    }
  }, [reportDate]);

  useEffect(() => { void load(); }, [load]);

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc("touch_work_session", { p_activity_type: "note", p_title: "Nota de trabajo", p_detail: note.trim() });
    setMessage(error ? "No pudimos guardar la nota." : "Nota agregada a la jornada.");
    if (!error) setNote("");
    await load();
    setBusy(false);
  }

  async function finish() {
    setBusy(true);
    const { error } = await supabase.rpc("finish_work_session", { p_note: note.trim() || null });
    setMessage(error ? "No pudimos cerrar la jornada." : "Jornada cerrada y lista para el informe.");
    if (!error) setNote("");
    await load();
    setBusy(false);
  }

  async function addVisualUpdate() {
    if (!visualTitle.trim() || !beforeImage || !afterImage) {
      setMessage("Agrega un titulo y selecciona las imagenes de antes y despues.");
      return;
    }
    setBusy(true);
    setMessage("");
    const upload = async (file: File, label: "before" | "after") => {
      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${viewer.id}/${reportDate}/${crypto.randomUUID()}-${label}.${extension}`;
      const { error } = await supabase.storage.from("workday-visuals").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      return path;
    };
    try {
      const beforePath = await upload(beforeImage, "before");
      const afterPath = await upload(afterImage, "after");
      const { error } = await supabase.rpc("record_visual_work_activity", { p_title: visualTitle.trim(), p_detail: visualDetail.trim() || null, p_before_path: beforePath, p_after_path: afterPath });
      if (error) throw error;
      setVisualTitle("");
      setVisualDetail("");
      setBeforeImage(null);
      setAfterImage(null);
      setMessage("Comparacion visual agregada a la jornada.");
      await load();
    } catch {
      setMessage("No pudimos guardar la comparacion visual.");
    }
    setBusy(false);
  }

  const people = useMemo<WorkdayPerson[]>(() => {
    const grouped = new Map<string, WorkSession[]>();
    sessions.forEach((session) => grouped.set(session.user_id, [...(grouped.get(session.user_id) || []), session]));
    return Array.from(grouped.values()).map((personSessions) => {
      const first = personSessions[0];
      const last = personSessions[personSessions.length - 1];
      return {
        name: first.display_name,
        role: roleName(first.role),
        started_at: first.started_at,
        last_activity_at: last.last_activity_at,
        ended_at: last.ended_at,
        status: personSessions.every((item) => item.status !== "active") ? "closed" : "active",
        activities: personSessions.flatMap((item) => item.work_activity_entries || []).sort((a, b) => a.created_at.localeCompare(b.created_at)),
      };
    });
  }, [sessions]);

  return <div className="workday-module">
    <section className="module-hero workday-hero"><div><p className="eyebrow">BITACORA DEL EQUIPO</p><h2>Informe diario de desarrollo</h2><p>La jornada comienza con la primera actividad dentro de OXXUS y se cierra manualmente o despues de 6 horas sin actividad.</p></div><span>{reportDate}</span></section>
    <section className="workday-summary-grid">
      {people.length ? people.map((person) => <article key={`${person.name}-${person.started_at}`}><header><div className="avatar">{person.name.split(" ").map((part) => part[0]).slice(0,2).join("")}</div><div><b>{person.name}</b><small>{person.role}</small></div><span className={person.status}>{person.status === "closed" ? "Finalizada" : "Activa"}</span></header><div className="workday-times"><span><small>INICIO</small><b>{clock(person.started_at)}</b></span><span><small>ULTIMA ACTIVIDAD</small><b>{clock(person.last_activity_at)}</b></span><span><small>REGISTROS</small><b>{person.activities.length}</b></span></div><ol>{person.activities.slice(-5).map((activity, index) => <li key={`${activity.created_at}-${index}`}><time>{clock(activity.created_at)}</time><div><b>{activity.title}</b><small>{activity.detail || activity.activity_type}</small></div></li>)}</ol>{person.activities.some((activity) => activity.activity_type === "visual_update") && <div className="workday-visual-gallery">{person.activities.filter((activity) => activity.activity_type === "visual_update").map((activity) => <article key={activity.id}><div className="visual-update-heading"><div><small>ACTUALIZACION VISUAL</small><b>{activity.title}</b></div><time>{clock(activity.created_at)}</time></div><div className="before-after-grid"><figure><figcaption>ANTES</figcaption>{activity.before_url ? <img src={activity.before_url} alt={`Antes: ${activity.title}`} /> : <span>Imagen no disponible</span>}</figure><i>→</i><figure><figcaption>DESPUES</figcaption>{activity.after_url ? <img src={activity.after_url} alt={`Despues: ${activity.title}`} /> : <span>Imagen no disponible</span>}</figure></div>{activity.detail && <p>{activity.detail}</p>}</article>)}</div>}</article>) : <article className="workday-empty"><b>La jornada comenzara automaticamente</b><p>Abre una seccion o agrega la primera nota para crear el registro de hoy.</p></article>}
    </section>
    <section className="panel workday-controls"><div><p className="eyebrow">REGISTRO MANUAL</p><h3>Agrega un avance, resultado o despedida</h3><p>Las acciones principales se registran automaticamente. Usa esta nota para explicar decisiones o trabajo realizado fuera de OXXUS.</p></div><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ejemplo: Termine la nueva vista del reporte y valide el flujo movil." rows={4}/><div className="workday-actions"><button className="secondary" type="button" disabled={busy || !note.trim()} onClick={() => void addNote()}>Agregar a la jornada</button><button className="secondary" type="button" disabled={busy} onClick={() => void finish()}>Finalizar mi jornada</button><button className="primary" type="button" disabled={!people.length} onClick={() => void downloadWorkdayReport({ reportDate, generatedBy: viewer.full_name || "Equipo OXXUS", people })}>Descargar informe combinado</button></div>{message && <p className="workday-message" role="status">{message}</p>}</section>
    <section className="panel visual-update-form"><div><p className="eyebrow">CAMBIO VISUAL</p><h3>Muestra el antes y el despues</h3><p>Para rediseños, logos o cambios de interfaz, agrega dos capturas. Apareceran juntas en la bitacora y en el informe descargable.</p></div><label>Titulo del cambio<input value={visualTitle} onChange={(event) => setVisualTitle(event.target.value)} placeholder="Ej. Rediseño del modo oscuro" /></label><label>Explicacion breve<textarea value={visualDetail} onChange={(event) => setVisualDetail(event.target.value)} placeholder="Que cambio y por que mejora la experiencia." rows={3} /></label><div className="visual-file-grid"><label className="visual-file-picker"><span>ANTES</span><b>{beforeImage?.name || "Seleccionar captura inicial"}</b><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setBeforeImage(event.target.files?.[0] || null)} /></label><label className="visual-file-picker after"><span>DESPUES</span><b>{afterImage?.name || "Seleccionar captura final"}</b><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setAfterImage(event.target.files?.[0] || null)} /></label></div><button className="primary" type="button" disabled={busy || !visualTitle.trim() || !beforeImage || !afterImage} onClick={() => void addVisualUpdate()}>Agregar comparacion visual</button></section>
    <p className="workday-privacy">El informe combina solamente actividad registrada dentro de OXXUS y notas del equipo. No lee chats privados, correo ni aplicaciones externas.</p>
  </div>;
}
