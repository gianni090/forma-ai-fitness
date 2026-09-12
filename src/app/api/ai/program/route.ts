import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ensureDemoData } from "@/lib/demo-data";
import { generateProgram, inputHash, questionnaireSchema } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

const requestTimestamps: number[] = [];

export async function POST(request: Request) {
  const now = Date.now();
  while (requestTimestamps[0] && now - requestTimestamps[0] > 60_000) requestTimestamps.shift();
  if (requestTimestamps.length >= 5) return NextResponse.json({ error: "Слишком много запросов. Попробуйте через минуту." }, { status: 429 });
  requestTimestamps.push(now);
  const parsed = questionnaireSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Проверьте анкету" }, { status: 400 });
  const hash = inputHash(parsed.data);
  try {
    const { user } = await ensureDemoData();
    const result = await generateProgram(parsed.data);
    const saved = await prisma.$transaction(async (tx) => {
      const program = await tx.program.create({ data: { userId: user.id, name: result.program.title } });
      for (const day of result.program.days) {
        const workout = await tx.planWorkout.create({ data: { programId: program.id, title: day.title, dayOfWeek: day.day } });
        for (const [index, item] of day.exercises.entries()) {
          const exercise = await tx.exercise.upsert({ where: { name: item.name }, update: { muscleGroup: item.muscleGroup }, create: { name: item.name, muscleGroup: item.muscleGroup, equipment: parsed.data.equipment[0] || "Без оборудования" } });
          await tx.planExercise.create({ data: { planWorkoutId: workout.id, exerciseId: exercise.id, order: index + 1, targetSets: item.sets, targetReps: item.reps, restSeconds: item.restSeconds } });
        }
      }
      const version = await tx.programVersion.count({ where: { programId: program.id } });
      await tx.programVersion.create({ data: { programId: program.id, version: version + 1, source: result.provider, data: result.program as unknown as Prisma.InputJsonValue } });
      await tx.aiRun.create({ data: { userId: user.id, provider: result.provider, model: result.model, inputHash: hash, output: result.program as unknown as Prisma.InputJsonValue, status: "completed", latencyMs: result.latencyMs } });
      return program;
    });
    return NextResponse.json({ program: result.program, programId: saved.id, provider: result.provider, model: result.model, latencyMs: result.latencyMs }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка AI";
    try { const { user } = await ensureDemoData(); await prisma.aiRun.create({ data: { userId: user.id, provider: process.env.AI_PROVIDER || "groq", model: process.env.GROQ_MODEL || "openai/gpt-oss-20b", inputHash: hash, status: "failed", latencyMs: Date.now() - now, error: message } }); } catch { /* keep original error */ }
    console.error("AI program generation failed", error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
