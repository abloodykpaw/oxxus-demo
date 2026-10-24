# Deploy checklist — OXXUS Credit Solutions

Use this after merging P0/P1/P2 before promoting to production.

## 1. Database

Apply migrations in order (see also `docs/P0-MIGRATIONS-CHECKLIST.md`):

```bash
npx supabase db push
```

Confirm `024` (web_collaborator) and `025` (deprecate legacy onboarding RPCs) are applied.

## 2. Edge function

```bash
npm run deploy:invite-user
# same as: npx supabase functions deploy invite-user

npx supabase functions deploy extract-score-image
npx supabase secrets set OPENAI_API_KEY=sk-...
```

`invite-user` now:

- rolls back incomplete invites
- validates `agent_id`
- uses shared redirect allowlist
- **re-invites** existing users (resend link) instead of failing

`extract-score-image` powers **Extraer con Asistente OXXUS** on score screenshots (Vision). Requires `OPENAI_API_KEY` secret.
## 3. Auth email + redirect URLs

```bash
npm run deploy:auth-config
# same as: npm run setup:email-templates
```

This reads `supabase/functions/_shared/redirect-allowlist.json` and updates:

- Site URL → `https://oxxuscreditsolutions.com`
- URI allow list (prod + ChatGPT Sites + localhost)
- Invite / recovery HTML templates

## 4. Frontend host

Republish the ChatGPT Site / Business workspace (or Cloudflare Workers) so the domain serves the latest `main`.

## 5. Smoke test

1. Login light/dark + mobile logo
2. Invite new client (email + link)
3. Re-invite same email → should say user already existed / resent
4. Client onboarding via report upload only
5. Admin sees OXX-#### case

## Shared config

Edit redirects in one place only:

`supabase/functions/_shared/redirect-allowlist.json`
