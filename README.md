# OXXUS Credit — Demo pública

Portal de reparación de crédito (versión portafolio).  
**Datos 100% ficticios.** La producción real sigue en Supabase y no se toca.

## Demo Neon (recomendada)

Misma UI que producción (`app/page.tsx`). Backend: **Neon Free** (branch `oxxus-demo`).  
**No toca** `G:\oxxus-credit-solutions` ni el Supabase de clientes.

| | |
|---|---|
| Ruta local | http://127.0.0.1:3000/ |
| Email | `admin@demo.oxxus.local` |
| Password | `Demo2026!Oxxus` |

```bash
npm install
# .env.local: DATABASE_URL + NEXT_PUBLIC_DEMO_BACKEND=neon
npm run dev
```

Login → Dashboard real con casos/scores/cuentas ficticios.

> Windows: el script `dev` usa `-H 127.0.0.1`.  
> Módulos que dependen de Storage/RPC de Supabase (informe diario, invitaciones, uploads) quedan fuera de la demo Neon.

## Stack

- vinext / React 19 + TypeScript
- Neon Postgres (`@neondatabase/serverless`) cuando `NEXT_PUBLIC_DEMO_BACKEND=neon`
- Código Supabase original sigue en el repo como referencia; producción real no se modifica aquí

## Autor

[Edjouner Rojas](https://github.com/abloodykpaw) · [Portafolio](https://abloodykpaw.github.io/portafolio/)
