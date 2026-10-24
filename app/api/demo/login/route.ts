import { NextResponse } from "next/server";
import { getSql, type DemoUser } from "../../../../lib/neon-db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email y contraseña requeridos" }, { status: 400 });
    }

    const sql = getSql();
    const rows = (await sql`
      select id, email, full_name, role
      from public.demo_users
      where lower(email) = ${email}
        and password_hash = crypt(${password}, password_hash)
      limit 1
    `) as DemoUser[];

    const user = rows[0];
    if (!user) {
      return NextResponse.json({ ok: false, error: "Credenciales incorrectas" }, { status: 401 });
    }

    return NextResponse.json({ ok: true, user });
  } catch (err) {
    console.error("[demo/login]", err);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }
}
