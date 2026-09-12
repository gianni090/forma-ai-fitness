import { NextResponse } from "next/server";
import { ensureDemoData, sessionDto, sessionInclude } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { user } = await ensureDemoData();
    const sessions = await prisma.workoutSession.findMany({ where: { userId: user.id }, include: sessionInclude, orderBy: { startedAt: "desc" } });
    return NextResponse.json({ sessions: sessions.map(sessionDto) });
  } catch { return NextResponse.json({ error: "База данных недоступна" }, { status: 503 }); }
}
export async function POST(request: Request) {
  try {
    const { user, workout } = await ensureDemoData();
    const body = await request.json().catch(() => ({})) as { planId?: unknown };
    const requestedPlanId = typeof body.planId === "string" && body.planId.length > 0 ? body.planId : "today";
    let planWorkoutId = workout.id;
    if (requestedPlanId !== "today") {
      const requestedWorkout = await prisma.planWorkout.findFirst({ where: { id: requestedPlanId, program: { userId: user.id } }, select: { id: true } });
      if (!requestedWorkout) return NextResponse.json({ error: "План тренировки не найден" }, { status: 404 });
      planWorkoutId = requestedWorkout.id;
    }
    // Повторный клик или обновление страницы возобновляет незавершённую сессию.
    const existing = await prisma.workoutSession.findFirst({ where: { userId: user.id, planWorkoutId, finishedAt: null }, orderBy: { startedAt: "desc" }, include: sessionInclude });
    if (existing) return NextResponse.json({ session: sessionDto(existing), resumed: true });
    const session = await prisma.workoutSession.create({ data: { userId: user.id, planWorkoutId }, include: sessionInclude });
    return NextResponse.json({ session: sessionDto(session) }, { status: 201 });
  } catch { return NextResponse.json({ error: "Не удалось начать тренировку" }, { status: 503 }); }
}
