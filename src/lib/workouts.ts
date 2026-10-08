import { Prisma, type User } from "@prisma/client";
import { prisma } from "./prisma";
import { ApiError } from "./errors";
import { type GeneratedProgram, type Questionnaire, type TrainingContext, inputHash, aiConfig } from "./ai";
import { feedbackSchema, setLogSchema } from "./validation";

export const workoutInclude = { exercises: { include: { exercise: true }, orderBy: { order: "asc" as const } } } satisfies Prisma.PlanWorkoutInclude;
export const programInclude = { planWorkouts: { include: workoutInclude, orderBy: { dayOfWeek: "asc" as const } }, versions: { orderBy: { version: "desc" as const }, take: 1 } } satisfies Prisma.ProgramInclude;
export const sessionInclude = { planWorkout: { select: { title: true } }, exercises: { include: { exercise: true, sets: { orderBy: { completedAt: "asc" as const } } }, orderBy: { order: "asc" as const } }, feedback: { take: 1 } } satisfies Prisma.WorkoutSessionInclude;
type FullSession = Prisma.WorkoutSessionGetPayload<{ include: typeof sessionInclude }>;
type FullWorkout = Prisma.PlanWorkoutGetPayload<{ include: typeof workoutInclude }>;
export function workoutDto(workout: FullWorkout) {
  return { id: workout.id, title: workout.title, day: workout.dayOfWeek, focus: workout.focus, exercises: workout.exercises.map(item => ({ ...item.exercise, muscleGroup: item.muscleGroup || item.exercise.muscleGroup, planExerciseId: item.id, sets: item.targetSets, reps: item.targetReps, restSeconds: item.restSeconds, metric: item.metric, notes: item.notes })) };
}
export function sessionDto(session: FullSession) {
  return {
    id: session.id, planId: session.planWorkoutId, title: session.title || session.planWorkout?.title || "Тренировка",
    startedAt: session.startedAt.toISOString(), finishedAt: session.finishedAt?.toISOString(), cancelledAt: session.cancelledAt?.toISOString(),
    exercises: session.exercises.map(item => ({ ...item.exercise, muscleGroup: item.muscleGroup || item.exercise.muscleGroup, sets: item.targetSets, reps: item.targetReps, restSeconds: item.restSeconds, metric: item.metric, notes: item.notes })),
    sets: session.exercises.flatMap(item => item.sets.map(set => ({ id: set.id, exerciseId: item.exerciseId, name: item.exercise.name, reps: set.reps, weight: Number(set.weight), durationSeconds: set.durationSeconds, completedAt: set.completedAt.toISOString() }))),
    feedback: session.feedback[0] || null,
  };
}
export async function locked<T>(userId: string, action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    return action(tx);
  }, { maxWait: 15_000, timeout: 20_000 });
}
async function ownSession(tx: Prisma.TransactionClient, userId: string, id: string) {
  const session = await tx.workoutSession.findFirst({ where: { id, userId }, include: sessionInclude });
  if (!session) throw new ApiError(404, "Тренировка не найдена.");
  return session;
}
async function snapshot(tx: Prisma.TransactionClient, session: FullSession) {
  if (!session.planWorkoutId) return;
  const plan = await tx.planExercise.findMany({ where: { planWorkoutId: session.planWorkoutId } });
  for (const item of plan) {
    const existing = session.exercises.find(e => e.exerciseId === item.exerciseId);
    if (existing && existing.targetSets > 0) continue;
    const data = { order: item.order, targetSets: item.targetSets, targetReps: item.targetReps, restSeconds: item.restSeconds, metric: item.metric, notes: item.notes, muscleGroup: item.muscleGroup };
    await tx.sessionExercise.upsert({ where: { sessionId_exerciseId: { sessionId: session.id, exerciseId: item.exerciseId } }, update: data, create: { sessionId: session.id, exerciseId: item.exerciseId, ...data } });
  }
}
export async function startSession(userId: string, planId?: string) {
  return locked(userId, async tx => {
    const active = await tx.workoutSession.findFirst({ where: { userId, finishedAt: null, cancelledAt: null }, orderBy: { startedAt: "desc" }, include: sessionInclude });
    if (active) {
      if (planId && planId !== active.planWorkoutId) throw new ApiError(409, "Сначала завершите или отмените текущую тренировку.");
      await snapshot(tx, active);
      return { session: sessionDto(await ownSession(tx, userId, active.id)), resumed: true };
    }
    const workout = await tx.planWorkout.findFirst({ where: { ...(planId ? { id: planId } : {}), program: { userId, archivedAt: null } }, include: workoutInclude, orderBy: { dayOfWeek: "asc" } });
    if (!workout || !workout.exercises.length) throw new ApiError(400, "Выберите день программы с упражнениями.");
    const created = await tx.workoutSession.create({ data: { userId, title: workout.title, planWorkoutId: workout.id, exercises: { create: workout.exercises.map(item => ({ exerciseId: item.exerciseId, order: item.order, targetSets: item.targetSets, targetReps: item.targetReps, restSeconds: item.restSeconds, metric: item.metric, notes: item.notes, muscleGroup: item.muscleGroup })) } }, include: sessionInclude });
    return { session: sessionDto(created), resumed: false };
  });
}
export async function writeSet(userId: string, sessionId: string, input: unknown, setId?: string) {
  const parsed = setLogSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Проверьте подход.");
  const values = parsed.data;
  return locked(userId, async tx => {
    const session = await ownSession(tx, userId, sessionId);
    if (session.finishedAt || session.cancelledAt) throw new ApiError(409, "Тренировка уже закрыта.");
    await snapshot(tx, session);
    const item = await tx.sessionExercise.findUnique({ where: { sessionId_exerciseId: { sessionId, exerciseId: values.exerciseId } } });
    if (!item) throw new ApiError(400, "Упражнение отсутствует в тренировке.");
    if ((item.metric === "seconds") !== Boolean(values.durationSeconds)) throw new ApiError(400, "Для этого упражнения используйте правильную единицу измерения.");
    const data = { reps: values.reps, weight: values.weight, durationSeconds: values.durationSeconds ?? null };
    if (setId) {
      const result = await tx.setLog.updateMany({ where: { id: setId, sessionExerciseId: item.id }, data });
      if (!result.count) throw new ApiError(404, "Подход не найден.");
    } else {
      await tx.setLog.upsert({ where: { sessionExerciseId_clientKey: { sessionExerciseId: item.id, clientKey: values.requestId } }, update: {}, create: { sessionExerciseId: item.id, clientKey: values.requestId, ...data } });
    }
    return sessionDto(await ownSession(tx, userId, sessionId));
  });
}
export async function deleteSet(userId: string, sessionId: string, setId: string) {
  return locked(userId, async tx => {
    const session = await ownSession(tx, userId, sessionId);
    if (session.finishedAt || session.cancelledAt) throw new ApiError(409, "Тренировка уже закрыта.");
    const result = await tx.setLog.deleteMany({ where: { id: setId, sessionExercise: { sessionId } } });
    if (!result.count) throw new ApiError(404, "Подход не найден.");
    return sessionDto(await ownSession(tx, userId, sessionId));
  });
}
export async function closeSession(userId: string, id: string, cancel = false) {
  return locked(userId, async tx => {
    const session = await ownSession(tx, userId, id);
    if (session.finishedAt || session.cancelledAt) return sessionDto(session);
    if (!cancel && session.exercises.every(item => !item.sets.length)) throw new ApiError(400, "Запишите хотя бы один подход.");
    const updated = await tx.workoutSession.update({ where: { id }, data: cancel ? { cancelledAt: new Date() } : { finishedAt: new Date() }, include: sessionInclude });
    return sessionDto(updated);
  });
}
export async function saveFeedback(userId: string, input: unknown) {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, "Проверьте оценку и сложность тренировки.");
  return locked(userId, async tx => {
    const session = await ownSession(tx, userId, parsed.data.sessionId);
    if (!session.finishedAt) throw new ApiError(400, "Оценить можно завершённую тренировку.");
    const old = await tx.feedback.findFirst({ where: { sessionId: session.id, userId } });
    const data = { ...parsed.data, userId };
    return old ? tx.feedback.update({ where: { id: old.id }, data }) : tx.feedback.create({ data });
  });
}
export async function trainingContext(userId: string): Promise<TrainingContext> {
  const [sessions, feedback] = await Promise.all([
    prisma.workoutSession.findMany({ where: { userId, finishedAt: { not: null } }, take: 10, orderBy: { finishedAt: "desc" }, include: sessionInclude }),
    prisma.feedback.findMany({ where: { userId }, take: 10, orderBy: { createdAt: "desc" }, select: { rating: true, effort: true, notes: true } }),
  ]);
  return { workouts: sessions.map(session => ({ date: session.finishedAt!.toISOString(), sets: session.exercises.reduce((sum, item) => sum + item.sets.length, 0), volume: session.exercises.reduce((sum, item) => sum + item.sets.reduce((n, set) => n + set.reps * Number(set.weight), 0), 0) })), feedback };
}
async function consume(tx: Prisma.TransactionClient, key: string, max: number, resetAt: Date) {
  const current = await tx.rateLimit.findUnique({ where: { key } });
  const live = current && current.resetAt > new Date();
  if (live && current.count >= max) throw new ApiError(429, "Лимит генераций исчерпан. Повторите позже.", "quota_exceeded");
  await tx.rateLimit.upsert({ where: { key }, update: live ? { count: { increment: 1 } } : { count: 1, resetAt }, create: { key, count: 1, resetAt } });
}
export async function reserveGeneration(userId: string, input: Questionnaire, requestId: string) {
  const config = aiConfig();
  return locked(userId, async tx => {
    const previous = await tx.aiRun.findUnique({ where: { requestKey: `${userId}:${requestId}` } });
    if (previous?.status === "completed") return previous;
    if (previous?.status === "running") throw new ApiError(409, previous.createdAt.getTime() < Date.now() - 130_000 ? "Предыдущая попытка прервалась. Повторите генерацию." : "Эта программа ещё создаётся. Подождите.", previous.createdAt.getTime() < Date.now() - 130_000 ? "ai_expired" : "ai_running");
    if (previous) throw new ApiError(409, "Предыдущая попытка завершилась ошибкой. Начните новую генерацию.");
    const running = await tx.aiRun.findFirst({ where: { userId, status: "running", createdAt: { gt: new Date(Date.now() - 130_000) } } });
    if (running) throw new ApiError(409, "Дождитесь завершения текущей генерации.", "ai_running");
    const daily = Math.min(100, Math.max(1, Number(process.env.AI_DAILY_LIMIT) || 10));
    const midnight = new Date(); midnight.setUTCHours(24, 0, 0, 0);
    await consume(tx, `${userId}:ai:minute`, 5, new Date(Date.now() + 60_000));
    await consume(tx, `${userId}:ai:day`, daily, midnight);
    return tx.aiRun.create({ data: { userId, ...config, requestKey: `${userId}:${requestId}`, inputHash: inputHash(input), status: "running", latencyMs: 0 } });
  });
}
export async function persistProgram(tx: Prisma.TransactionClient, userId: string, program: GeneratedProgram, source: string) {
  const created = await tx.program.create({ data: { userId, name: program.title } });
  for (const day of program.days) {
    const workout = await tx.planWorkout.create({ data: { programId: created.id, title: day.title, focus: day.focus, dayOfWeek: day.day } });
    for (const [index, item] of day.exercises.entries()) {
      const exercise = await tx.exercise.upsert({ where: { name_equipment: { name: item.name, equipment: item.equipment } }, update: {}, create: { name: item.name, muscleGroup: item.muscleGroup, equipment: item.equipment } });
      await tx.planExercise.create({ data: { planWorkoutId: workout.id, exerciseId: exercise.id, order: index + 1, targetSets: item.sets, targetReps: item.reps, restSeconds: item.restSeconds, metric: item.metric, notes: item.notes, muscleGroup: item.muscleGroup } });
    }
  }
  await tx.programVersion.create({ data: { programId: created.id, version: 1, source, data: program as unknown as Prisma.InputJsonValue } });
  await tx.user.update({ where: { id: userId }, data: { activeProgramId: created.id } });
  return created;
}
export async function completeGeneration(user: User, runId: string, input: Questionnaire, result: { program: GeneratedProgram; provider: string; latencyMs: number }) {
  return locked(user.id, async tx => {
    const program = await persistProgram(tx, user.id, result.program, result.provider);
    await tx.aiRun.update({ where: { id: runId }, data: { status: "completed", output: result.program as unknown as Prisma.InputJsonValue, latencyMs: result.latencyMs, programId: program.id } });
    await tx.user.update({ where: { id: user.id }, data: { questionnaire: input as unknown as Prisma.InputJsonValue } });
    return program.id;
  });
}
