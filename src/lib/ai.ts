import { createHash } from "crypto";
import Groq from "groq-sdk";
import { z } from "zod";

export const questionnaireSchema = z.object({
  goal: z.enum(["strength", "muscle", "fat_loss", "health"]),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  daysPerWeek: z.number().int().min(1).max(7),
  durationMinutes: z.number().int().min(15).max(180),
  equipment: z.array(z.string().min(1)).min(1).max(12),
  limitations: z.string().max(500).default(""),
});

const generatedExerciseSchema = z.object({
  name: z.string().min(2).max(100),
  muscleGroup: z.string().min(2).max(40),
  sets: z.number().int().min(1).max(8),
  reps: z.string().min(1).max(20),
  restSeconds: z.number().int().min(15).max(300),
  notes: z.string().max(300),
});

export const generatedProgramSchema = z.object({
  title: z.string().min(2).max(100),
  summary: z.string().min(10).max(500),
  safetyNote: z.string().min(10).max(500),
  days: z.array(z.object({
    day: z.number().int().min(1).max(7),
    title: z.string().min(2).max(100),
    focus: z.string().min(2).max(100),
    exercises: z.array(generatedExerciseSchema).min(1).max(12),
  })).min(1).max(7),
});

export type Questionnaire = z.infer<typeof questionnaireSchema>;
export type GeneratedProgram = z.infer<typeof generatedProgramSchema>;

const programJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    safetyNote: { type: "string" },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          day: { type: "integer" }, title: { type: "string" }, focus: { type: "string" },
          exercises: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, muscleGroup: { type: "string" }, sets: { type: "integer" }, reps: { type: "string" }, restSeconds: { type: "integer" }, notes: { type: "string" } }, required: ["name", "muscleGroup", "sets", "reps", "restSeconds", "notes"] } },
        },
        required: ["day", "title", "focus", "exercises"],
      },
    },
  },
  required: ["title", "summary", "safetyNote", "days"],
} as const;

export function inputHash(input: Questionnaire) { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }

function promptFor(input: Questionnaire) {
  return `Составь безопасную персональную фитнес-программу в JSON по анкете. Цель: ${input.goal}. Уровень: ${input.level}. Тренировок в неделю: ${input.daysPerWeek}. Продолжительность: ${input.durationMinutes} минут. Доступное оборудование: ${input.equipment.join(", ")}. Ограничения и пожелания: ${input.limitations || "нет"}. Используй только доступное оборудование, не назначай упражнения через боль, добавь safetyNote с рекомендацией остановиться при боли и обратиться к специалисту. Для каждого упражнения укажи рабочие подходы, повторения, отдых в секундах и короткую технику. Верни только JSON по заданной схеме.`;
}

function parseProgram(content: string): GeneratedProgram {
  const clean = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return generatedProgramSchema.parse(JSON.parse(clean));
}

async function providerError(response: Response, provider: string, model: string): Promise<never> {
  const raw = await response.text().catch(() => "");
  let detail = "";
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
    const value = typeof parsed.error === "string" ? parsed.error : parsed.error?.message || parsed.message;
    if (value) detail = `: ${value}`;
  } catch {
    if (raw.trim()) detail = `: ${raw.trim().slice(0, 240)}`;
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(`${provider} отклонила доступ (HTTP ${response.status}) для модели ${model}. Проверьте GROQ_API_KEY и доступ этой модели в Groq Console${detail}`);
  }
  if (response.status === 429) throw new Error(`${provider} временно ограничила запросы (HTTP 429). Подождите минуту и повторите${detail}`);
  throw new Error(`${provider} вернула HTTP ${response.status}${detail}`);
}

export async function generateProgram(input: Questionnaire) {
  const provider = process.env.AI_PROVIDER || "groq";
  const started = Date.now();
  const prompt = promptFor(input);
  if (process.env.NODE_ENV === "production" && provider !== "groq") throw new Error("В production разрешён только AI_PROVIDER=groq");

  if (provider === "ollama") {
    const model = process.env.OLLAMA_MODEL || "llama3.2:3b";
    const response = await fetch(`${process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, stream: false, format: "json", messages: [{ role: "system", content: "Ты профессиональный фитнес-тренер. Отвечай строго JSON." }, { role: "user", content: prompt }] }) });
    if (!response.ok) await providerError(response, "Ollama", model);
    const body = await response.json() as { message?: { content?: string } };
    if (!body.message?.content) throw new Error("Ollama вернула пустой ответ");
    return { provider, model, latencyMs: Date.now() - started, program: parseProgram(body.message.content) };
  }

  if (provider !== "groq") throw new Error(`Неизвестный AI_PROVIDER: ${provider}`);
  if (!process.env.GROQ_API_KEY) throw new Error("Не задан GROQ_API_KEY в .env");
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 0 });

  try {
    const completion = await groqClient.chat.completions.create({
      model,
      temperature: 0.2,
      max_completion_tokens: 4096,
      top_p: 1,
      stream: false,
      reasoning_effort: "medium",
      include_reasoning: false,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "fitness_program", strict: true, schema: programJsonSchema },
      },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Groq вернула пустой ответ");
    return { provider, model, latencyMs: Date.now() - started, program: parseProgram(content) };
  } catch (error) {
    if (error instanceof Groq.APIError) {
      const detail = typeof error.error === "object" && error.error !== null
        ? JSON.stringify(error.error)
        : error.message;
      throw new Error(`Groq отклонила запрос (HTTP ${error.status ?? "?"}) для модели ${model}: ${detail}`);
    }
    throw error;
  }
}
