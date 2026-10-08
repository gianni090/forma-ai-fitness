import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readBody, assertSameOrigin, json, errorResponse, ApiError } from "@/lib/errors";
import { profileSchema } from "@/lib/validation";
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireUser(); const parsed = profileSchema.safeParse(await readBody(request));
    if (!parsed.success) throw new ApiError(400, "Укажите имя и цель от 1 до 7 тренировок в неделю.");
    await prisma.user.update({ where: { id: user.id }, data: parsed.data });
    return json({ user: parsed.data });
  } catch (error) { return errorResponse(error); }
}
