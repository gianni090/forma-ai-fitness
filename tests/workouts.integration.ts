import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { startSession, writeSet, closeSession, deleteSet, saveFeedback, persistProgram, locked, reserveGeneration, completeGeneration, sessionInclude, sessionDto } from "../src/lib/workouts";
import { ApiError } from "../src/lib/errors";
import type { GeneratedProgram, Questionnaire } from "../src/lib/ai";
import { PATCH as editWorkout } from "../src/app/api/workouts/[id]/route";
import { GET as getMe } from "../src/app/api/me/route";
if (process.env.INTEGRATION_TESTS !== "true") throw new Error("Run integration tests only against a dedicated test DB with INTEGRATION_TESTS=true.");
test("PostgreSQL ownership, concurrency, snapshots, idempotency and quotas", async t => {
  Object.assign(process.env, { NODE_ENV: "test", AUTH_DEMO_MODE: "true", OPENROUTER_API_KEY: "test-only", AI_PROVIDER: "openrouter", AI_DAILY_LIMIT: "2" });
  const user = await prisma.user.upsert({ where: { authId: "demo-user" }, update: {}, create: { authId: "demo-user" } });
  const other = await prisma.user.create({ data: { authId: randomUUID() } });
  const suffix = randomUUID().slice(0, 8);
  const program: GeneratedProgram = { title: "Integration plan", summary: "Integration testing fixture program.", safetyNote: "Integration testing safety placeholder.", days: [{ day: 1, title: "Integration workout", focus: "Тест", exercises: [
    { name: `Squat ${suffix}`, muscleGroup: "Ноги", equipment: "Без оборудования", metric: "reps", sets: 2, reps: "8–12", restSeconds: 60, notes: "Test notes" },
    { name: `Plank ${suffix}`, muscleGroup: "Кор", equipment: "Без оборудования", metric: "seconds", sets: 2, reps: "30", restSeconds: 60, notes: "Timed exercise" },
  ] }] };
  const input: Questionnaire = { goal: "health", level: "beginner", daysPerWeek: 1, durationMinutes: 30, equipment: ["Без оборудования"], limitations: "" };
  try {
    const saved = await locked(user.id, tx => persistProgram(tx, user.id, program, "manual"));
    const workout = await prisma.planWorkout.findFirstOrThrow({ where: { programId: saved.id } });
    let sessionId = "", squatId = "", plankId = "", setId = "";
    await t.test("parallel starts create one active session", async () => {
      const responses = await Promise.all(Array.from({ length: 6 }, () => startSession(user.id, workout.id)));
      assert.equal(new Set(responses.map(result => result.session.id)).size, 1);
      assert.equal(responses.filter(result => !result.resumed).length, 1);
      sessionId = responses[0].session.id; squatId = responses[0].session.exercises[0].id; plankId = responses[0].session.exercises[1].id;
      assert.equal(responses[0].session.exercises.length, 2);
    });
    await t.test("a different user cannot write or finish this session", async () => {
      await assert.rejects(closeSession(other.id, sessionId), error => error instanceof ApiError && error.status === 404);
      await assert.rejects(writeSet(other.id, sessionId, { exerciseId: squatId, reps: 8, weight: 10, requestId: randomUUID() }), error => error instanceof ApiError && error.status === 404);
    });
    await t.test("retries of the same set are deduplicated", async () => {
      const values = { exerciseId: squatId, reps: 8, weight: 10, requestId: randomUUID() };
      const result = await Promise.all(Array.from({ length: 4 }, () => writeSet(user.id, sessionId, values)));
      assert.ok(result.every(session => session.sets.length === 1)); setId = result[0].sets[0].id;
    });
    await t.test("timed sets use seconds; corrections and removal work", async () => {
      await assert.rejects(writeSet(user.id, sessionId, { exerciseId: plankId, reps: 30, weight: 0, requestId: randomUUID() }), error => error instanceof ApiError && error.status === 400);
      const timed = await writeSet(user.id, sessionId, { exerciseId: plankId, reps: 0, weight: 0, durationSeconds: 30, requestId: randomUUID() });
      assert.equal(timed.sets[1].durationSeconds, 30);
      const edited = await writeSet(user.id, sessionId, { exerciseId: squatId, reps: 9, weight: 12.5, requestId: randomUUID() }, setId); assert.equal(edited.sets[0].reps, 9);
      const removed = await deleteSet(user.id, sessionId, timed.sets[1].id); assert.equal(removed.sets.length, 1);
    });
    await t.test("cannot edit a plan while its workout is active", async () => {
      const response = await editWorkout(new Request("http://localhost/api/workouts/" + workout.id, { method: "PATCH", body: JSON.stringify({ title: "Changed", exercises: program.days[0].exercises }) }), { params: Promise.resolve({ id: workout.id }) });
      assert.equal(response.status, 409);
    });
    await t.test("finish is idempotent and closes the journal", async () => {
      const result = await Promise.all([closeSession(user.id, sessionId), closeSession(user.id, sessionId)]);
      assert.equal(result[0].finishedAt, result[1].finishedAt);
      await assert.rejects(writeSet(user.id, sessionId, { exerciseId: squatId, reps: 8, weight: 0, requestId: randomUUID() }), error => error instanceof ApiError && error.status === 409);
    });
    await t.test("feedback is upserted for the owner only", async () => {
      const feedback = { sessionId, rating: 4, effort: 7, notes: "Integration feedback" };
      await Promise.all([saveFeedback(user.id, feedback), saveFeedback(user.id, feedback)]);
      assert.equal(await prisma.feedback.count({ where: { userId: user.id, sessionId } }), 1);
      await assert.rejects(saveFeedback(other.id, feedback), error => error instanceof ApiError && error.status === 404);
    });
    await t.test("editing changes future targets while preserving past snapshots", async () => {
      const response = await editWorkout(new Request("http://localhost/api/workouts/" + workout.id, { method: "PATCH", body: JSON.stringify({ title: "Changed workout", exercises: program.days[0].exercises.map(item => ({ ...item, sets: 4 })) }) }), { params: Promise.resolve({ id: workout.id }) });
      assert.equal(response.status, 200);
      const old = sessionDto(await prisma.workoutSession.findUniqueOrThrow({ where: { id: sessionId }, include: sessionInclude }));
      assert.equal(old.exercises[0].sets, 2);
      assert.equal(old.title, "Integration workout");
      const future = await startSession(user.id, workout.id); assert.equal(future.session.exercises[0].sets, 4);
      await closeSession(user.id, future.session.id, true);
    });
    await t.test("AI reservations replay success and enforce persistent daily quotas", async () => {
      const key = randomUUID(); const run = await reserveGeneration(user.id, input, key);
      await assert.rejects(reserveGeneration(user.id, input, randomUUID()), error => error instanceof ApiError && error.status === 409);
      await completeGeneration(user, run.id, input, { program, provider: "openrouter", latencyMs: 10 });
      assert.equal((await reserveGeneration(user.id, input, key)).status, "completed");
      const second = await reserveGeneration(user.id, input, randomUUID()); await prisma.aiRun.update({ where: { id: second.id }, data: { status: "failed" } });
      await assert.rejects(reserveGeneration(user.id, input, randomUUID()), error => error instanceof ApiError && error.status === 429);
    });
    await t.test("public production requests cannot use the demo account", async () => {
      Object.assign(process.env, { NODE_ENV: "production" }); delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      const response = await getMe(); assert.equal(response.status, 503); Object.assign(process.env, { NODE_ENV: "test" });
    });
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: user.id + ":" } } });
    await prisma.exercise.deleteMany({ where: { name: { endsWith: suffix } } });
    await prisma.$disconnect();
  }
});
