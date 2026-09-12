import { randomUUID } from "crypto";

export type Exercise = { id: string; name: string; muscleGroup: string; equipment: string };
export type PlanExercise = Exercise & { sets: number; reps: string; restSeconds: number };
export type SetLog = { id: string; exerciseId: string; reps: number; weight: number; completedAt: string };
export type WorkoutSession = { id: string; planId: string; startedAt: string; finishedAt?: string; sets: SetLog[] };

export const exercises: Exercise[] = [
  { id: "squat", name: "Приседания со штангой", muscleGroup: "Ноги", equipment: "Штанга" },
  { id: "bench", name: "Жим лёжа", muscleGroup: "Грудь", equipment: "Штанга" },
  { id: "row", name: "Тяга верхнего блока", muscleGroup: "Спина", equipment: "Тренажёр" },
  { id: "plank", name: "Планка", muscleGroup: "Кор", equipment: "Без оборудования" },
];

export const todayPlan: PlanExercise[] = [
  { ...exercises[0], sets: 4, reps: "6–8", restSeconds: 120 },
  { ...exercises[1], sets: 4, reps: "8–10", restSeconds: 90 },
  { ...exercises[2], sets: 3, reps: "10–12", restSeconds: 75 },
];

const sessions: WorkoutSession[] = [];
export function listSessions() { return sessions.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt)); }
export function createSession(planId = "today") { const session: WorkoutSession = { id: randomUUID(), planId, startedAt: new Date().toISOString(), sets: [] }; sessions.push(session); return session; }
export function getSession(id: string) { return sessions.find((item) => item.id === id); }
export function addSet(session: WorkoutSession, input: { exerciseId: string; reps: number; weight: number }) { const set: SetLog = { id: randomUUID(), ...input, completedAt: new Date().toISOString() }; session.sets.push(set); return session; }
