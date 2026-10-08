import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { programInclude, workoutDto, locked, persistProgram } from "@/lib/workouts";
import { readBody, assertSameOrigin, json, errorResponse, ApiError } from "@/lib/errors";
import { type GeneratedProgram } from "@/lib/ai";
const schema = z.object({ name: z.string().trim().min(2).max(80) });
const starter: GeneratedProgram = { title: "Стартовый план", summary: "Базовая тренировка с собственным весом. Скорректируйте упражнения и объём под свой уровень.", safetyNote: "Перед началом оцените свои ограничения. Остановитесь при боли и обратитесь к специалисту.", days: [{ day: 1, title: "Всё тело", focus: "Базовые движения", exercises: [
  { name: "Приседания с собственным весом", muscleGroup: "Ноги", equipment: "Без оборудования", metric: "reps", sets: 2, reps: "8–12", restSeconds: 60, notes: "Двигайтесь в комфортной амплитуде." },
  { name: "Отжимания от стены", muscleGroup: "Грудь", equipment: "Без оборудования", metric: "reps", sets: 2, reps: "8–12", restSeconds: 60, notes: "Сохраняйте корпус прямым, выберите удобное расстояние до стены." },
  { name: "Планка", muscleGroup: "Кор", equipment: "Без оборудования", metric: "seconds", sets: 2, reps: "15–30", restSeconds: 60, notes: "Дышите свободно. Уменьшите время, если техника ухудшается." },
] }] };
export async function GET() {
  try { const user = await requireUser(); const programs = await prisma.program.findMany({ where: { userId: user.id }, include: programInclude, orderBy: { createdAt: "desc" }, take: 100 }); return json({ programs: programs.map(program => ({ ...program, workouts: program.planWorkouts.map(workoutDto) })) }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try { assertSameOrigin(request); const user = await requireUser(); const parsed = schema.safeParse(await readBody(request)); if (!parsed.success) throw new ApiError(400, "Название должно содержать от 2 до 80 символов."); const program = await locked(user.id, tx => persistProgram(tx, user.id, { ...starter, title: parsed.data.name }, "manual")); return json({ programId: program.id }, 201); }
  catch (error) { return errorResponse(error); }
}

