import { prisma } from "./prisma";
import { ApiError } from "./errors";
import { createClient } from "./supabase/server";
export async function requireUser() {
  if (process.env.AUTH_DEMO_MODE === "true" && process.env.NODE_ENV !== "production") return prisma.user.upsert({ where: { authId: "demo-user" }, update: {}, create: { authId: "demo-user", name: "Демо-пользователь" } });
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ApiError(401, "Войдите в аккаунт, чтобы продолжить.", "unauthorized");
  const authUser = data.user;
  return prisma.user.upsert({ where: { authId: authUser.id }, update: {}, create: { authId: authUser.id, name: typeof authUser.user_metadata.name === "string" ? authUser.user_metadata.name.slice(0, 60) : "Спортсмен" } });
}
