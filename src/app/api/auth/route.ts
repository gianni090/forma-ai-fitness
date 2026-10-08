import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { readBody, assertSameOrigin, json, errorResponse, ApiError } from "@/lib/errors";
const schema = z.object({ mode: z.enum(["signin", "signup", "forgot", "reset", "signout"]), email: z.email().optional(), password: z.string().min(8).max(128).optional(), name: z.string().trim().min(1).max(60).optional() });
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await readBody(request));
    if (!parsed.success) throw new ApiError(400, "Проверьте email. Пароль должен содержать от 8 символов.");
    const { mode, email, password, name } = parsed.data;
    const client = await createClient();
    const origin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(request.url).origin;
    if (mode === "signout") { const { error } = await client.auth.signOut(); if (error) throw new ApiError(503, "Не удалось выйти. Повторите."); return json({ ok: true }); }
    if (mode === "reset") {
      if (!password) throw new ApiError(400, "Введите новый пароль.");
      const { error } = await client.auth.updateUser({ password });
      if (error) throw new ApiError(400, "Ссылка устарела или пароль не подходит. Запросите новую ссылку.");
      return json({ ok: true });
    }
    if (!email) throw new ApiError(400, "Введите email.");
    if (mode === "forgot") {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
      if (error) throw new ApiError(429, "Не удалось отправить письмо. Повторите позже.");
      return json({ message: "Если аккаунт существует, на почту отправлена ссылка восстановления." });
    }
    if (!password) throw new ApiError(400, "Введите пароль.");
    if (mode === "signup") {
      const { data, error } = await client.auth.signUp({ email, password, options: { data: { name: name || "Спортсмен" }, emailRedirectTo: `${origin}/auth/callback` } });
      if (error) throw new ApiError(400, "Не удалось зарегистрироваться. Проверьте данные или повторите позже.");
      return json({ ok: Boolean(data.session), message: data.session ? "Аккаунт создан." : "Проверьте почту и подтвердите регистрацию." });
    }
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new ApiError(401, "Неверные данные входа или почта ещё не подтверждена.");
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
