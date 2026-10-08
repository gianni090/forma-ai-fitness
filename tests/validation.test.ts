import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setLogSchema, profileSchema, feedbackSchema } from "../src/lib/validation";
import { computeStats } from "../src/lib/stats";
import { assertSameOrigin, ApiError } from "../src/lib/errors";
const set = { exerciseId: "pushup", reps: 8, weight: 0, requestId: randomUUID() };
test("validates the real repetition and timed set schemas", () => {
  assert.equal(setLogSchema.safeParse(set).success, true);
  for (const body of [{ ...set, reps: 0 }, { ...set, weight: -1 }, { ...set, reps: 1.5 }, { ...set, weight: Infinity }, { ...set, requestId: "duplicate" }]) assert.equal(setLogSchema.safeParse(body).success, false);
  assert.equal(setLogSchema.safeParse({ ...set, reps: 0, durationSeconds: 30 }).success, true);
  assert.equal(setLogSchema.safeParse({ ...set, durationSeconds: 30 }).success, false);
  assert.equal(setLogSchema.safeParse({ ...set, reps: 0, durationSeconds: 30, weight: 5 }).success, false);
});
test("validates profile timezone and bounded feedback", () => {
  assert.equal(profileSchema.safeParse({ name: "Анна", weeklyGoal: 3, timezone: "Europe/Moscow" }).success, true);
  assert.equal(profileSchema.safeParse({ name: "Анна", weeklyGoal: 8, timezone: "invalid" }).success, false);
  assert.equal(feedbackSchema.safeParse({ rating: 5, effort: 11, sessionId: "s" }).success, false);
});
test("computes volume from repetitions, excludes cancellations, and uses the user's calendar", () => {
  const stats = computeStats([
    { finishedAt: "2026-09-30T22:30:00Z", sets: [{ reps: 10, weight: 20 }, { reps: 0, weight: 0, durationSeconds: 30 }] },
    { finishedAt: "2026-10-01T10:00:00Z", sets: [{ reps: 5, weight: 10 }] },
    { cancelledAt: "2026-10-01T11:00:00Z", sets: [{ reps: 100, weight: 50 }] },
    { sets: [{ reps: 10, weight: 50 }] },
  ], new Date("2026-10-01T12:00:00Z"), "Europe/Moscow");
  assert.equal(stats.monthCount, 2); assert.equal(stats.weekCount, 2); assert.equal(stats.weekVolume, 250);
  assert.deepEqual(stats.days.at(-1), { date: "2026-10-01", count: 2, volume: 250 });
});
test("blocks cross-site mutations", () => {
  const old = process.env.APP_URL; delete process.env.APP_URL;
  try {
    assertSameOrigin(new Request("https://forma.example/api/programs", { headers: { Origin: "https://forma.example" } }));
    assert.throws(() => assertSameOrigin(new Request("https://forma.example/api/programs", { headers: { Origin: "https://evil.example" } })), error => error instanceof ApiError && error.status === 403);
  } finally { if (old === undefined) delete process.env.APP_URL; else process.env.APP_URL = old; }
});
