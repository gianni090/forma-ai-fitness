import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { generateProgram, questionnaireSchema } from "@/lib/ai";
import { reserveGeneration, trainingContext, completeGeneration } from "@/lib/workouts";
import { prisma } from "@/lib/prisma";
import { readBody, assertSameOrigin, json, errorResponse, ApiError } from "@/lib/errors";
export const maxDuration = 180;
const schema = questionnaireSchema.extend({ requestId: z.string().uuid() });
export async function POST(request: Request) {
  let runId: string | undefined;
  const started = Date.now();
  try {
    assertSameOrigin(request); const user = await requireUser();
    const parsed = schema.safeParse(await readBody(request));
    if (!parsed.success) throw new ApiError(400, "Проверьте анкету и доступное оборудование.");
    const { requestId, ...input } = parsed.data;
    const run = await reserveGeneration(user.id, input, requestId); runId = run.id;
    if (run.status === "completed") return json({ program: run.output, programId: run.programId, resumed: true });
    const result = await generateProgram(input, await trainingContext(user.id));
    const programId = await completeGeneration(user, run.id, input, result);
    return json({ program: result.program, programId }, 201);
  } catch (error) {
    if (runId) await prisma.aiRun.updateMany({ where: { id: runId, status: "running" }, data: { status: "failed", latencyMs: Date.now() - started, error: error instanceof ApiError ? error.code : "internal_error" } }).catch(() => undefined);
    return errorResponse(error);
  }
}

