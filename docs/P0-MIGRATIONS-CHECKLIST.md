# P0 — Migraciones 016–025 (producción)

Aplicar en orden en el proyecto Supabase de producción.

Para el deploy completo (DB + edge + emails + frontend), ver también `docs/DEPLOY-CHECKLIST.md`.

| # | Archivo | Qué hace |
|---|---------|----------|
| 016 | `016_client_credit_report_intake.sql` | Intake de reportes + RLS storage |
| 017 | `017_service_role_grants.sql` | Grants service_role (sin DELETE) |
| 018 | `018_sync_role_metadata.sql` | Sync `profiles.role` ↔ `app_metadata` |
| 019 | `019_client_self_onboarding.sql` | Onboarding completo (legacy) |
| 020 | `020_unique_case_registry.sql` | Casos OXX-#### + `ensure_client_case` |
| 021 | `021_three_bureau_credit_intake.sql` | Intake 3 burós |
| 022 | `022_report_only_client_intake.sql` | Intake solo reporte (canonical) |
| 023 | `023_workday_reporting.sql` | Bitácora de jornada |
| 024 | `024_restore_web_collaborator_role.sql` | Restaura rol `web_collaborator` en RPC |
| 025 | `025_deprecate_legacy_onboarding_rpcs.sql` | Deja solo `client_submit_credit_reports` |

## Cómo verificar

```bash
npx supabase db push
# o aplicar una por una en SQL Editor
```

Comprobar que existen:

```sql
select proname
from pg_proc
where proname in (
  'ensure_client_case',
  'admin_set_user_role',
  'client_submit_credit_reports'
);

select enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'app_role'
order by enumlabel;
```

## Después de migrar

1. Redesplegar edge function:
   `npx supabase functions deploy invite-user`
2. Actualizar plantillas Auth + allowlist:
   `node scripts/update-auth-email-templates.mjs`
3. Confirmar Site URL + Redirect URLs en Auth = hosts de
   `supabase/functions/_shared/redirect-allowlist.json`
