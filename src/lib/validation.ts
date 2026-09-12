import { z } from "zod";

export const setLogSchema = z.object({
  exerciseId: z.string().min(1),
  reps: z.number().int("Повторы должны быть целым числом").positive("Количество повторов должно быть больше нуля"),
  weight: z.number().finite("Вес должен быть числом").nonnegative("Вес не может быть отрицательным"),
});
