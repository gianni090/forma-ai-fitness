import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

const setLogSchema = z.object({
  exerciseId: z.string().min(1),
  reps: z.number().int().positive(),
  weight: z.number().finite().nonnegative(),
});

test("accepts a completed bodyweight set", () => {
  assert.equal(setLogSchema.safeParse({ exerciseId: "plank", reps: 45, weight: 0 }).success, true);
});

test("rejects missing reps and negative weight", () => {
  assert.equal(setLogSchema.safeParse({ exerciseId: "squat", weight: -2 }).success, false);
  assert.equal(setLogSchema.safeParse({ exerciseId: "squat", reps: 0, weight: 20 }).success, false);
});
