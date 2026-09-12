import { NextResponse } from "next/server";
import { ensureDemoData, sessionDto, sessionInclude } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";
import { setLogSchema } from "@/lib/validation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const { user, workout } = await ensureDemoData();
    const session = await prisma.workoutSession.findFirst({ where: { id, userId: user.id }, include: sessionInclude });
    if (!session) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    if (session.finishedAt) return NextResponse.json({ error: "Тренировка уже завершена" }, { status: 409 });
    const parsed = setLogSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Некорректный подход" }, { status: 400 });
    const planExercise = await prisma.planExercise.findFirst({ where: { planWorkoutId: session.planWorkoutId ?? workout.id, exerciseId: parsed.data.exerciseId } });
    if (!planExercise) return NextResponse.json({ error: "Упражнение отсутствует в плане" }, { status: 400 });
    const sessionExercise = await prisma.sessionExercise.upsert({ where: { sessionId_exerciseId: { sessionId: session.id, exerciseId: parsed.data.exerciseId } }, update: {}, create: { sessionId: session.id, exerciseId: parsed.data.exerciseId, order: planExercise.order } });
    await prisma.setLog.create({ data: { sessionExerciseId: sessionExercise.id, reps: parsed.data.reps, weight: parsed.data.weight } });
    const updated = await prisma.workoutSession.findUniqueOrThrow({ where: { id: session.id }, include: sessionInclude });
    return NextResponse.json({ session: sessionDto(updated) }, { status: 201 });
  } catch { return NextResponse.json({ error: "Не удалось сохранить подход" }, { status: 503 }); }
}
