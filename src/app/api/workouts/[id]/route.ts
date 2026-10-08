import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { locked, programInclude } from "@/lib/workouts";
import { generatedProgramSchema, equipmentOptions } from "@/lib/ai";
import { readBody, assertSameOrigin, json, errorResponse, ApiError } from "@/lib/errors";
const exercise = z.object({ name: z.string().trim().min(2).max(100), muscleGroup: z.string().trim().min(2).max(40), equipment: z.enum(equipmentOptions), sets: z.number().int().min(1).max(8), reps: z.string().regex(/^\d+(?:[-–]\d+)?$/), restSeconds: z.number().int().min(15).max(300), metric: z.enum(["reps", "seconds"]), notes: z.string().max(300) });
const schema = z.object({ title: z.string().trim().min(2).max(100), exercises: z.array(exercise).min(1).max(12) });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); const user = await requireUser(); const id = (await context.params).id;
    const parsed = schema.safeParse(await readBody(request)); if (!parsed.success) throw new ApiError(400, "Проверьте упражнения: подходы 1–8, отдых 15–300 секунд, повторы числом или диапазоном.");
    const names = new Set(parsed.data.exercises.map(item => item.name.toLocaleLowerCase("ru")));
    if (names.size !== parsed.data.exercises.length) throw new ApiError(400, "Упражнения не должны повторяться.");
    for (const item of parsed.data.exercises) { const [low, high = low] = item.reps.split(/[-–]/).map(Number); if (low < 1 || high < low || high > (item.metric === "seconds" ? 600 : 100)) throw new ApiError(400, "Проверьте диапазон повторов или секунд."); }
    await locked(user.id, async tx => {
      const workout = await tx.planWorkout.findFirst({ where: { id, program: { userId: user.id, archivedAt: null } } }); if (!workout) throw new ApiError(404, "Тренировка не найдена.");
      if (await tx.workoutSession.findFirst({ where: { userId: user.id, planWorkoutId: id, finishedAt: null, cancelledAt: null } })) throw new ApiError(409, "Закройте текущую тренировку перед редактированием этого дня.");
      await tx.planWorkout.update({ where: { id }, data: { title: parsed.data.title } });
      await tx.planExercise.deleteMany({ where: { planWorkoutId: id } });
      for (const [index, item] of parsed.data.exercises.entries()) {
        const record = await tx.exercise.upsert({ where: { name_equipment: { name: item.name, equipment: item.equipment } }, update: {}, create: { name: item.name, muscleGroup: item.muscleGroup, equipment: item.equipment } });
        await tx.planExercise.create({ data: { planWorkoutId: id, exerciseId: record.id, order: index + 1, targetSets: item.sets, targetReps: item.reps, restSeconds: item.restSeconds, metric: item.metric, notes: item.notes, muscleGroup: item.muscleGroup } });
      }
      const program = await tx.program.findUniqueOrThrow({ where: { id: workout.programId }, include: programInclude });
      const previous = generatedProgramSchema.safeParse(program.versions[0]?.data);
      const data = { title: program.name, summary: previous.success ? previous.data.summary : "Программа изменена вручную.", safetyNote: previous.success ? previous.data.safetyNote : "Остановитесь при боли и обратитесь к специалисту.", days: program.planWorkouts.map(day => ({ day: day.dayOfWeek, title: day.title, focus: day.focus, exercises: day.exercises.map(item => ({ name: item.exercise.name, muscleGroup: item.muscleGroup || item.exercise.muscleGroup, equipment: item.exercise.equipment, metric: item.metric, sets: item.targetSets, reps: item.targetReps, restSeconds: item.restSeconds, notes: item.notes })) })) };
      await tx.programVersion.create({ data: { programId: program.id, version: (program.versions[0]?.version || 0) + 1, source: "manual", data: data as Prisma.InputJsonValue } });
    });
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
