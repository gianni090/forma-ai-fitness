import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ApiError } from "../errors";
export function authConfigured() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); }
export async function createClient() {
  if (!authConfigured()) throw new ApiError(503, "Для входа нужно настроить Supabase Auth на сервере.", "auth_not_configured");
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: (items) => { for (const { name, value, options } of items) cookieStore.set(name, value, options); } },
  });
}
