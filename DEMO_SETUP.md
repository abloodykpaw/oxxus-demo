# Setup demo OXXUS (sin tocar producción)

## 1. Proyecto Supabase nuevo

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project** → nombre `oxxus-demo`
2. Auth → Providers → Email: desactiva “Confirm email” para pruebas rápidas
3. Copia URL, `anon`/`publishable` y `service_role` a `.env.local` (nunca al git)

## 2. Migraciones

```bash
npx supabase login
npx supabase link --project-ref TU_REF_DEMO
npx supabase db push
```

O pega en orden los SQL de `supabase/migrations/` en el SQL Editor.

## 3. Admin + datos ficticios

```bash
node scripts/seed-demo.mjs
```

## 4. Deploy

- Repo público: `abloodykpaw/oxxus-demo`
- Vercel / Cloudflare: variables `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (solo públicas)

## Checklist de seguridad

- [ ] Proyecto distinto al de producción (`pyicqwrtazdjzdezgdcn`)
- [ ] Ningún `.env.local` en el commit
- [ ] Clientes del seed son inventados (Ana Demo, Luis Sample, etc.)
