import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.112.3";
import allowlist from "../_shared/redirect-allowlist.json" with { type: "json" };

const DEFAULT_REDIRECT = `${String(allowlist.defaultSiteUrl).replace(/\/$/, "")}/`;
const ALLOWED_REDIRECT_HOSTS = new Set(
  (allowlist.hosts as string[]).map((host) => host.toLowerCase()),
);

function isAllowedOrigin(origin: string) {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return ALLOWED_REDIRECT_HOSTS.has(host);
  } catch {
    return false;
  }
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin =
    origin && isAllowedOrigin(origin)
      ? origin
      : DEFAULT_REDIRECT.replace(/\/$/, "");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
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

function normalizeRedirectTo(value: unknown, fallback = DEFAULT_REDIRECT) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback.replace(/\/?$/, "/");
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (isLocal && url.protocol !== "http:")
      return fallback.replace(/\/?$/, "/");
    if (!isLocal && url.protocol !== "https:")
      return fallback.replace(/\/?$/, "/");
    if (!ALLOWED_REDIRECT_HOSTS.has(host)) {
      return fallback.replace(/\/?$/, "/");
    }
    return `${url.origin}/`;
  } catch {
    return fallback.replace(/\/?$/, "/");
  }
}

async function rollbackInvite(
  admin: SupabaseClient,
  userId: string | null,
  clientId: string | null,
  createdClient: boolean,
  createdAuthUser: boolean,
) {
  if (createdAuthUser && userId) {
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch {
      // Best-effort compensation; surface original error to the caller.
    }
  }
  if (createdClient && clientId) {
    await admin.from("clients").update({ status: "inactive" }).eq("id", clientId);
  }
}

function isAlreadyRegisteredError(message?: string) {
  return /already|registered|exists|duplicate/i.test(message ?? "");
}

async function findAuthUserIdByEmail(admin: SupabaseClient, email: string) {
  // Prefer invite/recovery link lookup first; fall back to a small user list scan.
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const match = data.users.find(
      (user) => String(user.email ?? "").toLowerCase() === email,
    );
    if (match?.id) return match.id;
    if ((data.users?.length ?? 0) < 200) break;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST")
    return reply(req, { error: "Método no permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);
    if (userError || !user)
      return reply(req, { error: "Sesión no válida." }, 401);

    // profiles.role is the source of truth for authorization (matches RLS helpers).
    const { data: profile, error: profileLookupError } = await admin
      .from("profiles")
      .select("id,role,full_name")
      .eq("id", user.id)
      .maybeSingle();
    const profileRole = String(profile?.role ?? "");
    const metadataRoleEarly = String(user.app_metadata?.role ?? "");
    // Admin wins from either source so a stale JWT cannot downgrade a real admin.
    const secureRole =
      profileRole === "admin" || metadataRoleEarly === "admin"
        ? "admin"
        : profileRole || metadataRoleEarly;
    const caller = {
      id: user.id,
      role: secureRole,
      full_name: profile?.full_name ?? user.email ?? "Usuario",
    };

    if (!["admin", "repair_agent"].includes(secureRole)) {
      return reply(
        req,
        {
          error: profileLookupError
            ? "No se pudo verificar tu rol. Vuelve a iniciar sesión."
            : "No tienes permiso para invitar usuarios.",
        },
        403,
      );
    }

    // Keep JWT app_metadata aligned with profiles when they drift.
    const metadataRole = String(user.app_metadata?.role ?? "");
    if (metadataRole !== secureRole) {
      await admin.auth.admin.updateUserById(user.id, {
        app_metadata: {
          ...(user.app_metadata ?? {}),
          role: secureRole,
          client_id: user.app_metadata?.client_id ?? null,
        },
      });
    }

    const body = await req.json();
    if (body.action === "update_user") {
      if (caller.role !== "admin") {
        return reply(
          req,
          { error: "Solo el administrador puede editar usuarios." },
          403,
        );
      }
      const targetId = String(body.user_id ?? "").trim();
      const fullName = String(body.full_name ?? "").trim();
      const email = String(body.email ?? "")
        .trim()
        .toLowerCase();
      const role = String(body.role ?? "");
      if (
        !targetId ||
        !fullName ||
        !email ||
        !["admin", "repair_agent", "client", "web_collaborator"].includes(role)
      ) {
        return reply(req, { error: "Completa nombre, correo y rol." }, 400);
      }
      const { data: target, error: targetError } =
        await admin.auth.admin.getUserById(targetId);
      if (targetError || !target.user)
        return reply(req, { error: "No se encontró ese usuario." }, 404);
      if (
        targetId === caller.id &&
        (role !== "admin" ||
          email !== String(target.user.email ?? "").toLowerCase())
      ) {
        return reply(
          req,
          {
            error:
              "Por seguridad, no puedes cambiar tu propio correo ni quitarte el rol de administrador.",
          },
          400,
        );
      }
      const { data: targetProfile } = await admin
        .from("profiles")
        .select("client_id")
        .eq("id", targetId)
        .maybeSingle();
      const clientId =
        targetProfile?.client_id ?? target.user.app_metadata?.client_id ?? null;
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(
        targetId,
        {
          email,
          user_metadata: { ...target.user.user_metadata, full_name: fullName },
          app_metadata: {
            ...target.user.app_metadata,
            role,
            client_id: clientId,
          },
        },
      );
      if (authUpdateError) {
        return reply(
          req,
          {
            error:
              authUpdateError.message || "No se pudo actualizar el acceso.",
          },
          400,
        );
      }
      const { error: profileUpdateError } = await admin
        .from("profiles")
        .update({ full_name: fullName, role })
        .eq("id", targetId);
      if (profileUpdateError) {
        return reply(
          req,
          { error: "El acceso cambió, pero no se pudo actualizar el perfil." },
          500,
        );
      }
      if (clientId)
        await admin.from("clients").update({ email }).eq("id", clientId);
      await admin
        .from("invitations")
        .update({ email, full_name: fullName, role })
        .eq("auth_user_id", targetId);
      return reply(req, {
        ok: true,
        message: `Información actualizada para ${fullName}.`,
      });
    }

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const fullName = String(body.full_name ?? "").trim();
    const role = String(body.role ?? "");
    if (
      !email ||
      !fullName ||
      !["repair_agent", "client", "web_collaborator"].includes(role)
    ) {
      return reply(req, { error: "Completa nombre, correo y rol." }, 400);
    }
    if (caller.role === "repair_agent" && role !== "client") {
      return reply(
        req,
        { error: "Los agentes solamente pueden invitar clientes." },
        403,
      );
    }

    let clientId: string | null = body.client_id || null;
    let agentId: string | null =
      role === "client"
        ? caller.role === "repair_agent"
          ? caller.id
          : body.agent_id || null
        : null;
    let createdClient = false;

    if (role === "client" && caller.role === "admin" && agentId) {
      const { data: agentProfile } = await admin
        .from("profiles")
        .select("id,role")
        .eq("id", agentId)
        .maybeSingle();
      if (!agentProfile || agentProfile.role !== "repair_agent") {
        return reply(
          req,
          { error: "El preparador seleccionado no es un agente de reparación válido." },
          400,
        );
      }
    }

    if (role === "client" && !clientId) {
      const parts = fullName.split(/\s+/);
      const firstName = parts.shift() || fullName;
      const lastName = parts.join(" ") || "Cliente";
      const { data: client, error } = await admin
        .from("clients")
        .insert({
          first_name: firstName,
          last_name: lastName,
          email,
          status: "active",
          agent_id: agentId,
        })
        .select("id")
        .single();
      if (error || !client) {
        return reply(
          req,
          { error: "No se pudo preparar el expediente del cliente." },
          400,
        );
      }
      clientId = client.id;
      createdClient = true;
    }

    if (role === "client" && clientId) {
      const { data: client } = await admin
        .from("clients")
        .select("id,agent_id")
        .eq("id", clientId)
        .single();
      if (
        !client ||
        (caller.role === "repair_agent" && client.agent_id !== caller.id)
      ) {
        if (createdClient) {
          await admin
            .from("clients")
            .update({ status: "inactive" })
            .eq("id", clientId);
        }
        return reply(req, { error: "No puedes invitar a ese cliente." }, 403);
      }
    }

    const redirectTo = normalizeRedirectTo(
      body.redirect_to ?? body.redirectTo ?? Deno.env.get("SITE_URL"),
    );
    const delivery = body.delivery === "link" ? "link" : "email";
    let userId = "";
    let actionLink: string | null = null;
    let inviteError: { message?: string } | null = null;
    let createdAuthUser = false;
    let resent = false;

    if (delivery === "link") {
      const { data: generated, error } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo, data: { full_name: fullName } },
      });
      inviteError = error;
      userId = generated?.user?.id ?? "";
      actionLink = generated?.properties?.action_link ?? null;
      createdAuthUser = Boolean(userId && !error);
    } else {
      const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(
        email,
        { redirectTo, data: { full_name: fullName } },
      );
      inviteError = error;
      userId = invited?.user?.id ?? "";
      createdAuthUser = Boolean(userId && !error);
    }

    // Re-invite path: user already exists → resend invite/recovery link instead of failing.
    if (
      (inviteError && isAlreadyRegisteredError(inviteError.message)) ||
      (!userId && inviteError)
    ) {
      if (isAlreadyRegisteredError(inviteError?.message)) {
        const existingId = await findAuthUserIdByEmail(admin, email);
        const { data: generated, error: resendError } =
          await admin.auth.admin.generateLink({
            type: "invite",
            email,
            options: { redirectTo, data: { full_name: fullName } },
          });
        if (!resendError && (generated?.user?.id || existingId)) {
          userId = generated?.user?.id || existingId || "";
          actionLink = generated?.properties?.action_link ?? null;
          inviteError = null;
          createdAuthUser = false;
          resent = true;
        } else {
          // Confirmed users sometimes need a recovery link instead of invite.
          const { data: recovery, error: recoveryError } =
            await admin.auth.admin.generateLink({
              type: "recovery",
              email,
              options: { redirectTo },
            });
          if (!recoveryError && (recovery?.user?.id || existingId)) {
            userId = recovery?.user?.id || existingId || "";
            actionLink = recovery?.properties?.action_link ?? null;
            inviteError = null;
            createdAuthUser = false;
            resent = true;
          } else {
            inviteError = resendError || recoveryError || inviteError;
          }
        }
      }
    }

    if (inviteError || !userId || (delivery === "link" && !actionLink)) {
      if (createdClient && clientId) {
        await admin
          .from("clients")
          .update({ status: "inactive" })
          .eq("id", clientId);
      }
      return reply(
        req,
        { error: inviteError?.message || "No se pudo preparar la invitación." },
        400,
      );
    }

    // Email re-invite of an existing user: ensure we still have a usable link when possible.
    if (resent && delivery === "email" && !actionLink) {
      const { data: generated } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo, data: { full_name: fullName } },
      });
      actionLink = generated?.properties?.action_link ?? null;
      userId = generated?.user?.id || userId;
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        full_name: fullName,
        role,
        client_id: clientId,
        invited_by: caller.id,
      })
      .eq("id", userId);
    if (profileError) {
      await rollbackInvite(admin, userId, clientId, createdClient, createdAuthUser);
      return reply(
        req,
        {
          error:
            "No se pudo asignar el rol. Se revirtió la invitación para no dejar un usuario incompleto.",
        },
        500,
      );
    }

    const { error: metadataError } = await admin.auth.admin.updateUserById(
      userId,
      {
        app_metadata: { role, client_id: clientId },
      },
    );
    if (metadataError) {
      await rollbackInvite(admin, userId, clientId, createdClient, createdAuthUser);
      return reply(
        req,
        {
          error:
            "No se pudo asegurar el rol de acceso. Se revirtió la invitación para no dejar un usuario incompleto.",
        },
        500,
      );
    }

    if (role === "client" && clientId) {
      await admin
        .from("clients")
        .update({ owner_user_id: userId, agent_id: agentId, email })
        .eq("id", clientId);
      const { error: caseError } = await admin.rpc("ensure_client_case", {
        p_client_id: clientId,
        p_source: "invite",
        p_assigned_to: agentId,
        p_created_by: caller.id,
      });
      if (caseError) {
        await rollbackInvite(admin, userId, clientId, createdClient, createdAuthUser);
        return reply(
          req,
          {
            error:
              "No se pudo registrar el caso único. Se revirtió la invitación para no dejar un usuario incompleto.",
          },
          500,
        );
      }
      if (agentId) {
        await admin
          .from("cases")
          .update({ assigned_to: agentId })
          .eq("client_id", clientId);
      }
    }

    const { data: pendingInvite } = await admin
      .from("invitations")
      .select("id")
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    const invitationPayload = {
      email,
      full_name: fullName,
      role,
      invited_by: caller.id,
      agent_id: agentId,
      client_id: clientId,
      auth_user_id: userId,
      status: "pending",
    };

    const { error: invitationError } = pendingInvite
      ? await admin
          .from("invitations")
          .update(invitationPayload)
          .eq("id", pendingInvite.id)
      : await admin.from("invitations").insert(invitationPayload);

    if (invitationError) {
      await rollbackInvite(admin, userId, clientId, createdClient, createdAuthUser);
      return reply(
        req,
        {
          error:
            "No se pudo guardar el registro de invitación. Se revirtió el acceso para no dejar un usuario incompleto.",
        },
        500,
      );
    }

    return reply(req, {
      ok: true,
      resent,
      message: resent
        ? delivery === "link"
          ? `Usuario ya existía. Nuevo enlace preparado para ${email}.`
          : `Usuario ya existía. Se reenvió el acceso a ${email}.`
        : delivery === "link"
          ? `Enlace de invitación preparado para ${email}.`
          : `Invitación enviada a ${email}.`,
      action_link: actionLink,
    });
  } catch (error) {
    return reply(
      req,
      { error: error instanceof Error ? error.message : "Error inesperado." },
      500,
    );
  }
});
