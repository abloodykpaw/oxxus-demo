"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseKey, supabaseUrl } from "../lib/supabase";
import "./user-editor.css";

type Viewer = { id: string; role: string; full_name: string | null };
type Person = { id: string; role: string; full_name: string | null };
type Client = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone?: string | null;
  agent_id?: string | null;
};
type Invitation = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  created_at: string;
};
type DirectoryUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  client_id: string | null;
  confirmed: boolean;
};
type InviteResult = {
  name: string;
  email: string;
  phone: string;
  actionLink: string;
};

const labels: Record<string, string> = {
  admin: "Administrador",
  repair_agent: "Agente de reparación",
  client: "Cliente",
  web_collaborator: "Colaborador del sitio web",
  specialist: "Especialista",
  reviewer: "Revisor",
};
const emptyForm = {
  full_name: "",
  email: "",
  phone: "",
  role: "client",
  client_id: "",
  agent_id: "",
};

export default function InviteCenter({
  viewer,
  profiles,
  clients,
  standalone = false,
  language = "es",
}: {
  viewer: Viewer | null;
  profiles: Person[];
  clients: Client[];
  standalone?: boolean;
  language?: "es" | "en";
}) {
  const [form, setForm] = useState(emptyForm);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>(() =>
    Object.fromEntries(clients.map((c) => [c.id, c.agent_id || ""])),
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<DirectoryUser | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    email: "",
    role: "client",
  });
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<"email" | "sms">(
    "email",
  );
  const tr = (es: string, en: string) => (language === "es" ? es : en);
  const isAdmin = viewer?.role === "admin";
  const agents = useMemo(
    () =>
      isAdmin
        ? users.filter((u) => u.role === "repair_agent")
        : profiles
            .filter((p) => p.role === "repair_agent")
            .map((p) => ({
              id: p.id,
              full_name: p.full_name,
              role: p.role,
              email: "",
              client_id: null,
              confirmed: true,
            })),
    [isAdmin, users, profiles],
  );

  async function load() {
    const { data } = await supabase
      .from("invitations")
      .select("id,email,full_name,role,status,created_at")
      .order("created_at", { ascending: false });
    setInvitations((data ?? []) as Invitation[]);
    if (isAdmin) {
      const { data: directory } = await supabase.rpc("get_user_directory");
      setUsers((directory ?? []) as unknown as DirectoryUser[]);
    }
  }
  useEffect(() => {
    if (!viewer) return;
    void load();
  }, [viewer?.id, viewer?.role]);

  if (!viewer) {
    return (
      <div className="panel">
        <p className="eyebrow">{tr("USUARIOS", "USERS")}</p>
        <h3>{tr("Cargando perfil…", "Loading profile…")}</h3>
        <p>
          {tr(
            "Espera un momento mientras confirmamos tu acceso.",
            "Please wait while we confirm your access.",
          )}
        </p>
      </div>
    );
  }

  async function createInvitation(delivery: "email" | "link") {
    if (delivery === "link" && !form.phone.trim()) {
      setMessage(
        tr(
          "Escribe el teléfono que recibirá el mensaje de texto.",
          "Enter the phone number that will receive the text message.",
        ),
      );
      return;
    }
    setBusy(true);
    setMessage("");
    setInviteResult(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setMessage(
        "Tu sesión venció. Cierra la sesión y vuelve a entrar antes de enviar la invitación.",
      );
      setBusy(false);
      return;
    }
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/invite-user`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: supabaseKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          delivery,
          client_id: form.client_id || null,
          agent_id: form.agent_id || null,
          redirect_to: window.location.origin,
        }),
      });
      const data = await response.json();
      setMessage(
        data?.message ||
          data?.error ||
          (response.ok
            ? "Invitación preparada correctamente."
            : "No se pudo preparar la invitación."),
      );
      if (response.ok) {
        if (data?.action_link)
          setInviteResult({
            name: form.full_name,
            email: form.email,
            phone: form.phone,
            actionLink: data.action_link,
          });
        setForm(emptyForm);
        await load();
      }
    } catch {
      setMessage("No se pudo conectar con el servicio de invitaciones.");
    }
    setBusy(false);
  }

  async function copyLink() {
    if (!inviteResult) return;
    try {
      await navigator.clipboard.writeText(inviteResult.actionLink);
      setMessage(
        "Enlace copiado. Ya puedes pegarlo en un mensaje de texto o WhatsApp.",
      );
    } catch {
      setMessage(
        "No se pudo copiar automáticamente. Mantén presionado el enlace para copiarlo.",
      );
    }
  }

  async function shareLink() {
    if (!inviteResult) return;
    const text = invitationText(inviteResult);
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Invitación de OXXUS Credit Solutions",
          text,
        });
        setMessage("Invitación compartida.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }
    await copyLink();
  }

  function invitationText(result: InviteResult) {
    return tr(
      `Hola ${result.name.split(" ")[0]}, OXXUS Credit Solutions te invita a crear tu cuenta y consultar tu expediente. Este enlace es personal: ${result.actionLink}`,
      `Hello ${result.name.split(" ")[0]}, OXXUS Credit Solutions invites you to create your account and view your case. This link is personal: ${result.actionLink}`,
    );
  }

  function openSms() {
    if (!inviteResult) return;
    const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "&" : "?";
    window.location.href = `sms:${inviteResult.phone}${separator}body=${encodeURIComponent(invitationText(inviteResult))}`;
  }

  function openWhatsApp() {
    if (!inviteResult) return;
    const phone = inviteResult.phone.replace(/\D/g, "");
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(invitationText(inviteResult))}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function selectClient(clientId: string) {
    if (!clientId) {
      setForm({ ...form, client_id: "" });
      return;
    }
    const client = clients.find((c) => c.id === clientId);
    setForm({
      ...form,
      client_id: clientId,
      full_name: client
        ? `${client.first_name} ${client.last_name}`.trim()
        : form.full_name,
      email: client?.email || form.email,
      phone: client?.phone || form.phone,
      agent_id: client?.agent_id || form.agent_id,
    });
  }
  function openEditor(user: DirectoryUser) {
    setEditing(user);
    setEditForm({
      full_name: user.full_name || "",
      email: user.email,
      role: user.role,
    });
    setMessage("");
  }
  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setMessage("");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setMessage("Tu sesión venció. Vuelve a iniciar sesión.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/invite-user`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: supabaseKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update_user",
          user_id: editing.id,
          ...editForm,
        }),
      });
      const data = await response.json();
      setMessage(
        data?.message ||
          data?.error ||
          (response.ok
            ? "Usuario actualizado."
            : "No se pudo actualizar el usuario."),
      );
      if (response.ok) {
        setEditing(null);
        await load();
      }
    } catch {
      setMessage("No se pudo conectar con el servicio de usuarios.");
    }
    setBusy(false);
  }
  async function assign(client: Client, agentId: string) {
    setBusy(true);
    const { error } = await supabase.rpc("assign_client_to_agent", {
      p_client_id: client.id,
      p_agent_id: agentId || null,
    });
    if (error) setMessage("No se pudo cambiar la asignación.");
    else {
      setAssignments({ ...assignments, [client.id]: agentId });
      setMessage(
        `${client.first_name} ${client.last_name} fue reasignado correctamente.`,
      );
    }
    setBusy(false);
  }

  const invitationForm = (
    <form
      className="panel form-card invite-card"
      onSubmit={(e) => {
        e.preventDefault();
        void createInvitation(deliveryMethod === "email" ? "email" : "link");
      }}
    >
      <h3>{tr("Invitar una persona", "Invite someone")}</h3>
      <p>
        {tr(
          "El correo crea la cuenta. Elige si entregas la invitación por correo o por teléfono.",
          "The email creates the account. Choose whether to deliver the invitation by email or phone.",
        )}
      </p>
      <div
        className="delivery-selector"
        aria-label={tr("Método de envío", "Delivery method")}
      >
        <button
          type="button"
          className={deliveryMethod === "email" ? "active" : ""}
          onClick={() => setDeliveryMethod("email")}
        >
          {tr("Por correo", "By email")}
        </button>
        <button
          type="button"
          className={deliveryMethod === "sms" ? "active" : ""}
          onClick={() => setDeliveryMethod("sms")}
        >
          {tr("Por teléfono / texto", "By phone / text")}
        </button>
      </div>
      <div className="form-grid">
        <label>
          {tr("Nombre completo", "Full name")}
          <input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />
        </label>
        <label>
          {tr(
            "Correo electrónico (obligatorio para la cuenta)",
            "Email (required for the account)",
          )}
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </label>
        {deliveryMethod === "sms" && (
          <label>
            {tr("Teléfono que recibirá el texto", "Phone receiving the text")}
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 555 555 5555"
              required
            />
          </label>
        )}
        {isAdmin && (
          <label>
            Rol
            <select
              value={form.role}
              onChange={(e) =>
                setForm({
                  ...form,
                  role: e.target.value,
                  client_id: "",
                  agent_id: "",
                })
              }
            >
              <option value="client">Cliente</option>
              <option value="repair_agent">Agente de reparación</option>
              <option value="web_collaborator">
                Colaborador del sitio web
              </option>
            </select>
          </label>
        )}
        {form.role === "client" && (
          <label>
            Expediente existente (opcional)
            <select
              value={form.client_id}
              onChange={(e) => selectClient(e.target.value)}
            >
              <option value="">Crear expediente nuevo</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                </option>
              ))}
            </select>
          </label>
        )}
        {isAdmin && form.role === "client" && (
          <label>
            Preparador responsable
            <select
              value={form.agent_id}
              onChange={(e) => setForm({ ...form, agent_id: e.target.value })}
            >
              <option value="">Administrado directamente por OXXUS</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name || a.email}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="permission-note">
        <b>
          {form.role === "repair_agent"
            ? "Acceso del preparador"
            : form.role === "web_collaborator"
              ? "Acceso del colaborador"
              : "Acceso del cliente"}
        </b>
        <span>
          {form.role === "repair_agent"
            ? "Podrá invitar y administrar solamente sus clientes, además de tener su propio expediente personal."
            : form.role === "web_collaborator"
              ? "Podrá probar la interfaz y consultar recursos generales, sin acceso a clientes, reportes, archivos privados ni administración."
              : "Podrá ver únicamente su expediente, archivos y avances."}
        </span>
      </div>
      <div className="form-actions invite-delivery-actions">
        {deliveryMethod === "email" ? (
          <button type="submit" className="primary" disabled={busy}>
            {busy
              ? tr("Procesando…", "Processing…")
              : tr("Enviar invitación por correo", "Send email invitation")}
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            disabled={busy || !form.full_name || !form.email || !form.phone}
            onClick={() => void createInvitation("link")}
          >
            {busy
              ? tr("Procesando…", "Processing…")
              : tr(
                  "Preparar invitación por texto",
                  "Prepare text invitation",
                )}
          </button>
        )}
      </div>
    </form>
  );

  return (
    <div className="module">
      <section className="module-hero">
        <div>
          <p className="eyebrow">CONTROL DE ACCESO</p>
          <h2>
            {standalone
              ? tr("Enviar invitación", "Send invitation")
              : "Usuarios, roles y asignaciones"}
          </h2>
          <p>
            {standalone
              ? tr(
                  "Entrega el acceso por correo, mensaje de texto o WhatsApp.",
                  "Deliver access by email, text message, or WhatsApp.",
                )
              : isAdmin
                ? "Administra todos los accesos y decide qué preparador atiende a cada cliente."
                : "Invita clientes; quedarán asignados automáticamente a tu cartera."}
          </p>
        </div>
        <span className="record-count">
          {tr("Acceso protegido", "Protected access")}
        </span>
      </section>
      {message && (
        <p className="admin-message" role="status">
          {message}
        </p>
      )}
      <div className="invite-grid">
        {invitationForm}
        <section className="panel invite-history">
          <div className="panel-heading">
            <div>
              <h3>
                {inviteResult
                  ? "Invitación preparada"
                  : "Invitaciones recientes"}
              </h3>
              <p>
                {inviteResult
                  ? "El enlace es personal y debe usarse lo antes posible."
                  : "Personas invitadas desde la plataforma."}
              </p>
            </div>
          </div>
          {inviteResult ? (
            <div className="share-invite-result">
              <strong>{inviteResult.name}</strong>
              <small>{inviteResult.email}</small>
              <small>{inviteResult.phone}</small>
              <div
                className="share-link-preview"
                aria-label="Enlace de invitación"
              >
                {tr(
                  "Enlace seguro listo para compartir",
                  "Secure link ready to share",
                )}
              </div>
              <div className="share-link-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void copyLink()}
                >
                  {tr("Copiar enlace", "Copy link")}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={openSms}
                >
                  {tr("Abrir mensaje de texto", "Open text message")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={openWhatsApp}
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void shareLink()}
                >
                  {tr("Más opciones", "More options")}
                </button>
              </div>
            </div>
          ) : invitations.length ? (
            <div className="invitation-list">
              {invitations
                .slice(0, standalone ? 5 : invitations.length)
                .map((i) => (
                  <article key={i.id}>
                    <span className="person blue-person">
                      {i.full_name
                        .split(" ")
                        .map((x) => x[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div>
                      <b>{i.full_name}</b>
                      <small>{i.email}</small>
                    </div>
                    <em>{labels[i.role] || i.role}</em>
                    <i>{i.status === "pending" ? "Pendiente" : "Confirmada"}</i>
                  </article>
                ))}
            </div>
          ) : (
            <div className="empty-invites">
              Todavía no hay invitaciones enviadas.
            </div>
          )}
        </section>
      </div>
      {!standalone && isAdmin && (
        <>
          <section className="panel user-directory">
            <div className="panel-heading">
              <div>
                <h3>Todos los usuarios</h3>
                <p>
                  Edita nombre, correo, rol y consulta el estado de cada cuenta.
                </p>
              </div>
              <span>{users.length} usuarios</span>
            </div>
            <div className="admin-table">
              {users.map((u) => (
                <article key={u.id}>
                  <div className="person blue-person">
                    {(u.full_name || u.email)
                      .split(" ")
                      .map((x) => x[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div>
                    <b>{u.full_name || "Nombre pendiente"}</b>
                    <small>{u.email}</small>
                  </div>
                  <span className="role-label">{labels[u.role] || u.role}</span>
                  <em className={u.confirmed ? "confirmed" : "pending"}>
                    {u.confirmed ? "Confirmado" : "Pendiente"}
                  </em>
                  <button
                    type="button"
                    className="edit-user-button"
                    onClick={() => openEditor(u)}
                  >
                    Editar
                  </button>
                </article>
              ))}
            </div>
          </section>
          <section className="panel assignment-manager">
            <div className="panel-heading">
              <div>
                <h3>Clientes asignados por preparador</h3>
                <p>Cambia quién administra cada expediente.</p>
              </div>
              <span>{clients.length} clientes</span>
            </div>
            <div className="assignment-list">
              {clients.map((c) => (
                <article key={c.id}>
                  <div>
                    <b>
                      {c.first_name} {c.last_name}
                    </b>
                    <small>{c.email || "Correo pendiente"}</small>
                  </div>
                  <label>
                    Preparador
                    <select
                      value={assignments[c.id] || ""}
                      disabled={busy}
                      onChange={(e) => void assign(c, e.target.value)}
                    >
                      <option value="">OXXUS / Sin preparador</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.full_name || a.email}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      {editing && (
        <div
          className="user-editor-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Editar usuario"
        >
          <form className="user-editor" onSubmit={saveUser}>
            <div className="user-editor-heading">
              <div>
                <p className="eyebrow">USUARIO</p>
                <h3>Editar información</h3>
              </div>
              <button
                type="button"
                className="close-editor"
                onClick={() => setEditing(null)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <label>
              Nombre completo
              <input
                value={editForm.full_name}
                onChange={(e) =>
                  setEditForm({ ...editForm, full_name: e.target.value })
                }
                required
              />
            </label>
            <label>
              Correo electrónico
              <input
                type="email"
                value={editForm.email}
                disabled={editing.id === viewer.id}
                onChange={(e) =>
                  setEditForm({ ...editForm, email: e.target.value })
                }
                required
              />
            </label>
            <label>
              Rol
              <select
                value={editForm.role}
                disabled={editing.id === viewer.id}
                onChange={(e) =>
                  setEditForm({ ...editForm, role: e.target.value })
                }
              >
                <option value="admin">Administrador</option>
                <option value="repair_agent">Agente de reparación</option>
                <option value="web_collaborator">
                  Colaborador del sitio web
                </option>
                <option value="client">Cliente</option>
              </select>
            </label>
            {editing.id === viewer.id && (
              <p className="self-protection">
                Tu correo y rol están protegidos para evitar que pierdas el
                acceso de administrador.
              </p>
            )}
            <div className="editor-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
