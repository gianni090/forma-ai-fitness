import test from "node:test";
import assert from "node:assert/strict";
import { generateProgram, parseProgram, questionnaireSchema, type GeneratedProgram } from "../src/lib/ai";
import { ApiError } from "../src/lib/errors";
const input = questionnaireSchema.parse({ goal: "health", level: "beginner", daysPerWeek: 1, durationMinutes: 30, equipment: ["Без оборудования"] });
const program: GeneratedProgram = { title: "Базовая программа", summary: "Начальная программа на один тренировочный день.", safetyNote: "При боли остановитесь и обратитесь к специалисту.", days: [{ day: 1, title: "Всё тело", focus: "Базовая подготовка", exercises: [{ name: "Приседания", muscleGroup: "Ноги", equipment: "Без оборудования", metric: "reps", sets: 2, reps: "8–12", restSeconds: 60, notes: "Комфортная амплитуда." }] }] };
test("validates day count, equipment, duplicate exercises and targets", () => {
  assert.deepEqual(parseProgram(JSON.stringify(program), input), program);
  assert.deepEqual(parseProgram("\x60\x60\x60json\n" + JSON.stringify(program) + "\n\x60\x60\x60", input), program);
  const day = program.days[0], exercise = day.exercises[0];
  for (const invalid of [
    { ...program, days: [day, day] },
    { ...program, days: [{ ...day, day: 2 }] },
    { ...program, days: [{ ...day, exercises: [exercise, exercise] }] },
    { ...program, days: [{ ...day, exercises: [{ ...exercise, equipment: "Штанга" }] }] },
    { ...program, days: [{ ...day, exercises: [{ ...exercise, reps: "12–8" }] }] },
  ]) assert.throws(() => parseProgram(JSON.stringify(invalid), input), error => error instanceof ApiError && error.code === "invalid_ai_output");
});
test("uses OpenRouter structured output, bounded history and safe failures", async t => {
  const previous = { ...process.env }; Object.assign(process.env, { AI_PROVIDER: "openrouter", OPENROUTER_API_KEY: "test-key", NODE_ENV: "test" });
  try {
    await t.test("sends the configured request and validates its response", async () => {
      const result = await generateProgram(input, { workouts: [], feedback: [{ rating: 3, effort: 9, notes: "Слишком сложно" }] }, async (url, options) => {
        assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
        const body = JSON.parse(String(options?.body)); assert.equal(body.response_format.type, "json_schema"); assert.equal(body.provider.require_parameters, true);
        assert.match(body.messages[1].content, /Слишком сложно/); assert.ok(options?.signal);
        return Response.json({ choices: [{ message: { content: JSON.stringify(program) }, finish_reason: "stop" }] });
      });
      assert.equal(result.provider, "openrouter"); assert.deepEqual(result.program, program);
    });
    for (const [status, code] of [[401, "ai_access"], [402, "ai_balance"], [429, "ai_rate_limit"], [500, "ai_upstream"]] as const) await t.test(`handles HTTP ${status} without leaking upstream bodies`, async () => {
      await assert.rejects(generateProgram(input, undefined, async () => new Response("secret-provider-detail", { status })), error => error instanceof ApiError && error.code === code && !error.message.includes("secret"));
    });
    await t.test("handles errors carried by a successful HTTP response", async () => {
      await assert.rejects(generateProgram(input, undefined, async () => Response.json({ error: { code: 429 } })), error => error instanceof ApiError && error.code === "ai_rate_limit");
    });
    await t.test("rejects truncated output and timeout", async () => {
      await assert.rejects(generateProgram(input, undefined, async () => Response.json({ choices: [{ finish_reason: "length", message: { content: "{}" } }] })), error => error instanceof ApiError && error.code === "ai_truncated");
      await assert.rejects(generateProgram(input, undefined, async () => { throw new DOMException("timeout", "TimeoutError"); }), error => error instanceof ApiError && error.status === 504);
    });
    await t.test("requires an API key and forbids Ollama in production", async () => {
      delete process.env.OPENROUTER_API_KEY;
      await assert.rejects(generateProgram(input), error => error instanceof ApiError && error.code === "ai_not_configured");
      Object.assign(process.env, { AI_PROVIDER: "ollama", NODE_ENV: "production" });
      await assert.rejects(generateProgram(input), error => error instanceof ApiError && error.code === "ai_configuration");
    });
  } finally { for (const key of ["AI_PROVIDER", "OPENROUTER_API_KEY", "NODE_ENV"]) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
});
