import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { locked } from "@/lib/workouts";
import { readBody, assertSameOrigin, json, errorResponse, ApiError } from "@/lib/errors";
const schema = z.object({ action: z.enum(["activate", "archive", "restore", "rename"]), name: z.string().trim().min(2).max(80).optional() });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); const user = await requireUser(); const id = (await context.params).id;
    const parsed = schema.safeParse(await readBody(request));
    if (!parsed.success) throw new ApiError(400, "Проверьте действие и название.");
    await locked(user.id, async tx => {
      const program = await tx.program.findFirst({ where: { id, userId: user.id } });
      if (!program) throw new ApiError(404, "Программа не найдена.");
      if (parsed.data.action === "activate") {
        if (program.archivedAt) throw new ApiError(400, "Сначала восстановите программу из архива.");
        await tx.user.update({ where: { id: user.id }, data: { activeProgramId: id } });
      } else if (parsed.data.action === "rename") {
        if (!parsed.data.name) throw new ApiError(400, "Введите название.");
        await tx.program.update({ where: { id }, data: { name: parsed.data.name } });
      } else {
        await tx.program.update({ where: { id }, data: { archivedAt: parsed.data.action === "archive" ? new Date() : null } });
        if (parsed.data.action === "archive") await tx.user.updateMany({ where: { id: user.id, activeProgramId: id }, data: { activeProgramId: null } });
      }
    });
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
