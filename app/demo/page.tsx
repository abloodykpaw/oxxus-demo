import { redirect } from "next/navigation";

/** La demo Neon usa la UI real en `/` (NEXT_PUBLIC_DEMO_BACKEND=neon). */
export default function DemoRedirectPage() {
  redirect("/");
}
