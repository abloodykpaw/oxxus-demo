# OXXUS Credit — Demo pública

Portal de reparación de crédito (expediente, onboarding, disputas, cartas, progreso, roles).  
**Plantilla de portafolio.** Configúrala con un proyecto Supabase **nuevo**; no uses credenciales de producción.

## Stack

- vinext / React 19 + TypeScript
- Supabase (Auth, Postgres, Storage, Edge Functions)
- Drizzle (opcional)

## Credenciales demo (tras el seed)

| Email | Password | Rol |
|---|---|---|
| `admin@demo.oxxus.local` | `Demo2026!Oxxus` | admin |

Ver `scripts/seed-demo.mjs` y `DEMO_SETUP.md`.

## Local

```bash
npm install
cp .env.example .env.local
# Completa URL + anon/publishable + service_role de tu proyecto DEMO
npm run setup:admin -- admin@demo.oxxus.local Demo2026!Oxxus "Admin Demo"
# o: node scripts/seed-demo.mjs
npm run dev
```

## Autor

[Edjouner Rojas](https://github.com/abloodykpaw) · [Portafolio](https://abloodykpaw.github.io/portafolio/)
