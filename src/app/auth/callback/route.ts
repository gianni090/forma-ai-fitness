import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get("code");
  const origin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : url.origin;
  const next = url.searchParams.get("next") === "/reset-password" ? "/reset-password" : "/";
  if (code) { try { const client = await createClient(); const { error } = await client.auth.exchangeCodeForSession(code); if (!error) return NextResponse.redirect(new URL(next, origin)); } catch { /* show a safe error */ } }
  return NextResponse.redirect(new URL("/?authError=1", origin));
}
