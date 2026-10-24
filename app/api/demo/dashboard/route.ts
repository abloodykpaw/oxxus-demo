import { NextResponse } from "next/server";
import { getSql } from "../../../../lib/neon-db";

export const runtime = "nodejs";

type CaseRow = {
  id: string;
  case_number: string;
  client_id: string;
  level: number | null;
  duration_weeks: number | null;
  current_week: number | null;
  status: string;
  next_action: string | null;
  created_at: string;
  registry_source: string | null;
  client_first_name: string;
  client_last_name: string;
  client_email: string | null;
  client_phone: string | null;
  client_status: string | null;
  client_address_line1: string | null;
  client_city: string | null;
  client_state: string | null;
  client_postal_code: string | null;
};

type ReportRow = {
  id: string;
  case_id: string;
  provider: string | null;
  storage_path: string | null;
  processing_status: string | null;
  created_at: string;
};

type ScoreRow = { report_id: string; bureau: string; score: number };

type AccountRow = {
  id: string;
  case_id: string;
  creditor_name: string;
  balance: number | null;
  issue_type: string | null;
  bureaus: string[] | null;
  status: string;
  account_type: string | null;
  account_class: string | null;
  account_status_norm: string | null;
  is_protected: boolean | null;
  protection_reason: string | null;
  classification_source: string | null;
  classification_confidence: number | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string;
};

export async function GET() {
  try {
    const sql = getSql();

    const [cases, reports, scores, accounts, profiles] = (await Promise.all([
      sql`
        select
          c.id,
          c.case_number,
          c.client_id,
          c.level,
          c.duration_weeks,
          c.current_week,
          c.status,
          c.next_action,
          c.created_at,
          c.registry_source,
          cl.first_name as client_first_name,
          cl.last_name as client_last_name,
          cl.email as client_email,
          cl.phone as client_phone,
          cl.status as client_status,
          cl.address_line1 as client_address_line1,
          cl.city as client_city,
          cl.state as client_state,
          cl.postal_code as client_postal_code
        from public.demo_cases c
        join public.demo_clients cl on cl.id = c.client_id
        order by c.created_at desc
      `,
      sql`
        select id, case_id, provider, storage_path, processing_status, created_at
        from public.demo_credit_reports
        order by created_at desc
      `,
      sql`
        select report_id, bureau, score
        from public.demo_credit_scores
      `,
      sql`
        select
          id, case_id, creditor_name, balance, issue_type, bureaus, status,
          account_type, account_class, account_status_norm, is_protected,
          protection_reason, classification_source, classification_confidence
        from public.demo_credit_accounts
        order by created_at
      `,
      sql`
        select id, full_name, role::text as role
        from public.demo_users
        order by full_name
      `,
    ])) as [
      CaseRow[],
      ReportRow[],
      ScoreRow[],
      AccountRow[],
      ProfileRow[],
    ];

    const scoresByReport = new Map<string, { bureau: string; score: number }[]>();
    for (const s of scores) {
      const list = scoresByReport.get(s.report_id) ?? [];
      list.push({ bureau: s.bureau, score: Number(s.score) });
      scoresByReport.set(s.report_id, list);
    }

    const reportsByCase = new Map<string, ReportRow[]>();
    for (const r of reports) {
      const list = reportsByCase.get(r.case_id) ?? [];
      list.push(r);
      reportsByCase.set(r.case_id, list);
    }

    const accountsByCase = new Map<string, AccountRow[]>();
    for (const a of accounts) {
      const list = accountsByCase.get(a.case_id) ?? [];
      list.push(a);
      accountsByCase.set(a.case_id, list);
    }

    const shaped = cases.map((c) => {
      const caseReports = reportsByCase.get(c.id) ?? [];
      const latest = caseReports[0];
      const credit_reports = latest
        ? [
            {
              id: latest.id,
              provider: latest.provider,
              storage_path: latest.storage_path,
              processing_status: latest.processing_status,
              created_at: latest.created_at,
              credit_scores: scoresByReport.get(latest.id) ?? [],
            },
          ]
        : [];

      return {
        id: c.id,
        case_number: c.case_number,
        client_id: c.client_id,
        level: c.level,
        duration_weeks: c.duration_weeks ?? 16,
        current_week: c.current_week ?? 1,
        status: c.status,
        next_action: c.next_action,
        created_at: c.created_at,
        registry_source: c.registry_source ?? "demo",
        has_report: caseReports.length > 0,
        document_count: 0,
        clients: {
          id: c.client_id,
          first_name: c.client_first_name,
          last_name: c.client_last_name,
          email: c.client_email,
          phone: c.client_phone,
          status: c.client_status ?? "active",
          address_line1: c.client_address_line1,
          city: c.client_city,
          state: c.client_state,
          postal_code: c.client_postal_code,
          agent_id: null,
          owner_user_id: null,
          access_status: "not_invited" as const,
        },
        credit_reports,
        credit_accounts: (accountsByCase.get(c.id) ?? []).map((a) => ({
          id: a.id,
          creditor_name: a.creditor_name,
          balance: a.balance === null ? null : Number(a.balance),
          issue_type: a.issue_type,
          bureaus: a.bureaus ?? [],
          status: a.status,
          account_type: a.account_type,
          account_class: a.account_class,
          account_status_norm: a.account_status_norm,
          is_protected: Boolean(a.is_protected),
          protection_reason: a.protection_reason,
          classification_source: a.classification_source,
          classification_confidence:
            a.classification_confidence === null
              ? null
              : Number(a.classification_confidence),
        })),
      };
    });

    return NextResponse.json({
      ok: true,
      cases: shaped,
      profiles: profiles.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        role: p.role,
        client_id: null,
      })),
    });
  } catch (err) {
    console.error("[demo/dashboard]", err);
    return NextResponse.json(
      { ok: false, error: "Error de servidor" },
      { status: 500 },
    );
  }
}
