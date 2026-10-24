-- Canonical client intake is client_submit_credit_reports (022) + client_onboarding_status (022).
-- Revoke legacy onboarding RPCs so only one path remains callable.

revoke all on function public.client_complete_onboarding(
  text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;

revoke all on function public.client_complete_three_bureau_onboarding(
  text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) from public, anon, authenticated;
