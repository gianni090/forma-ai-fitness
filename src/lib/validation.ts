import { z } from "zod";
export const setLogSchema = z.object({
  exerciseId: z.string().min(1).max(100), reps: z.number().int().min(0).max(1000), weight: z.number().finite().min(0).max(1000),
  durationSeconds: z.number().int().min(1).max(3600).optional(), requestId: z.string().uuid(),
}).refine((value) => value.durationSeconds ? value.reps === 0 && value.weight === 0 : value.reps > 0, "Укажите повторы и вес или длительность подхода в секундах");
export const feedbackSchema = z.object({ sessionId: z.string().min(1), rating: z.number().int().min(1).max(5), effort: z.number().int().min(1).max(10), notes: z.string().trim().max(500).default("") });
export const profileSchema = z.object({ name: z.string().trim().min(1).max(60), weeklyGoal: z.number().int().min(1).max(7), timezone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("ru", { timeZone: value }); return true; } catch { return false; } }, "Некорректный часовой пояс") });

