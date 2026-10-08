import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionInclude, sessionDto, startSession } from "@/lib/workouts";
import { readBody, assertSameOrigin, json, errorResponse, ApiError } from "@/lib/errors";
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const cursor = new URL(request.url).searchParams.get("cursor");
    if (cursor && !await prisma.workoutSession.findFirst({ where: { id: cursor, userId: user.id } })) throw new ApiError(400, "Некорректная страница истории.");
    const sessions = await prisma.workoutSession.findMany({ where: { userId: user.id }, include: sessionInclude, orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: 31, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    return json({ sessions: sessions.slice(0, 30).map(sessionDto), nextCursor: sessions.length > 30 ? sessions[29].id : null });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireUser(); const parsed = z.object({ planId: z.string().min(1).max(100).optional() }).safeParse(await readBody(request));
    if (!parsed.success) throw new ApiError(400, "Выберите тренировку.");
    const result = await startSession(user.id, parsed.data.planId);
    return json(result, result.resumed ? 200 : 201);
  } catch (error) { return errorResponse(error); }
}

