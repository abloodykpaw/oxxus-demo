import { neon } from "@neondatabase/serverless";

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no configurada");
  return neon(url);
}

export type DemoUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
};

export type DemoCaseRow = {
  case_number: string;
  status: string;
  level: number;
  next_action: string | null;
  first_name: string;
  last_name: string;
  city: string | null;
  state: string | null;
};
