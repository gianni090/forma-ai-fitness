import { prisma } from "@/lib/prisma";

export const DEMO_USER_AUTH_ID = "demo-user";
export const DEMO_PROGRAM_ID = "demo-program";
export const TODAY_WORKOUT_ID = "today-workout";

const exerciseSeed = [
  { id: "squat", name: "Приседания со штангой", muscleGroup: "Ноги", equipment: "Штанга", order: 1, targetSets: 4, targetReps: "6–8", restSeconds: 120 },
  { id: "bench", name: "Жим лёжа", muscleGroup: "Грудь", equipment: "Штанга", order: 2, targetSets: 4, targetReps: "8–10", restSeconds: 90 },
  { id: "row", name: "Тяга верхнего блока", muscleGroup: "Спина", equipment: "Тренажёр", order: 3, targetSets: 3, targetReps: "10–12", restSeconds: 75 },
  { id: "plank", name: "Планка", muscleGroup: "Кор", equipment: "Без оборудования", order: 4, targetSets: 3, targetReps: "45 сек", restSeconds: 60 },
];

let demoDataPromise: ReturnType<typeof initializeDemoData> | undefined;

async function initializeDemoData() {
  const user = await prisma.user.upsert({ where: { authId: DEMO_USER_AUTH_ID }, update: {}, create: { authId: DEMO_USER_AUTH_ID } });
  const program = await prisma.program.upsert({ where: { id: DEMO_PROGRAM_ID }, update: { userId: user.id }, create: { id: DEMO_PROGRAM_ID, userId: user.id, name: "Базовый план" } });
  const workout = await prisma.planWorkout.upsert({ where: { id: TODAY_WORKOUT_ID }, update: { programId: program.id }, create: { id: TODAY_WORKOUT_ID, programId: program.id, title: "Сила · Ноги и верх тела", dayOfWeek: new Date().getDay() } });
  for (const item of exerciseSeed) {
    await prisma.exercise.upsert({ where: { id: item.id }, update: { name: item.name, muscleGroup: item.muscleGroup, equipment: item.equipment }, create: { id: item.id, name: item.name, muscleGroup: item.muscleGroup, equipment: item.equipment } });
    await prisma.planExercise.upsert({ where: { id: `today-${item.id}` }, update: { planWorkoutId: workout.id, exerciseId: item.id, order: item.order, targetSets: item.targetSets, targetReps: item.targetReps, restSeconds: item.restSeconds }, create: { id: `today-${item.id}`, planWorkoutId: workout.id, exerciseId: item.id, order: item.order, targetSets: item.targetSets, targetReps: item.targetReps, restSeconds: item.restSeconds } });
  }
  return { user, program, workout };
}

export function ensureDemoData() {
  demoDataPromise ??= initializeDemoData().catch((error) => {
    demoDataPromise = undefined;
    throw error;
  });
  return demoDataPromise;
}

export function exerciseDto(item: { id: string; name: string; muscleGroup: string; equipment: string }) { return item; }
export function planExerciseDto(item: { exercise: { id: string; name: string; muscleGroup: string; equipment: string }; targetSets: number; targetReps: string; restSeconds: number }) { return { ...exerciseDto(item.exercise), sets: item.targetSets, reps: item.targetReps, restSeconds: item.restSeconds }; }
export function sessionDto(session: { id: string; startedAt: Date; finishedAt: Date | null; exercises: Array<{ exerciseId: string; sets: Array<{ id: string; reps: number; weight: unknown }> }> }) { return { id: session.id, startedAt: session.startedAt.toISOString(), ...(session.finishedAt ? { finishedAt: session.finishedAt.toISOString() } : {}), sets: session.exercises.flatMap((entry) => entry.sets.map((set) => ({ id: set.id, exerciseId: entry.exerciseId, reps: set.reps, weight: Number(set.weight) }))) }; }

export const sessionInclude = { exercises: { include: { sets: true }, orderBy: { order: "asc" as const } } };
