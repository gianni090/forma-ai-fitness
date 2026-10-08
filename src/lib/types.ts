import type { GeneratedProgram, Questionnaire } from "./ai";
export type Exercise = { id: string; name: string; muscleGroup: string; equipment: string; sets: number; reps: string; restSeconds: number; metric: string; notes: string };
export type Workout = { id: string; title: string; day: number; focus: string; exercises: Exercise[] };
export type SetEntry = { id: string; exerciseId: string; name: string; reps: number; weight: number; durationSeconds: number | null; completedAt: string };
export type Session = { id: string; planId: string; title: string; startedAt: string; finishedAt?: string; cancelledAt?: string; exercises: Exercise[]; sets: SetEntry[]; feedback: { rating: number; effort: number; notes?: string } | null };
export type Program = { id: string; name: string; archivedAt: string | null; createdAt: string; data?: GeneratedProgram; workouts: Workout[] };
export type DashboardData = { user: { name: string; weeklyGoal: number; timezone: string; activeProgramId: string | null; questionnaire?: Questionnaire }; programs: Program[]; active: Session | null; aiConfigured: boolean; demo: boolean; stats: { total: number; weekCount: number; monthCount: number; weekVolume: number; days: Array<{ date: string; count: number; volume: number }> } };
