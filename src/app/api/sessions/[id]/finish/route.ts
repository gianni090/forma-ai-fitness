import { NextResponse } from "next/server";
import { ensureDemoData, sessionDto, sessionInclude } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";

export async function PATCH(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const { user } = await ensureDemoData();
    const session = await prisma.workoutSession.findFirst({ where: { id, userId: user.id }, include: sessionInclude });
    if (!session) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    if (session.exercises.every((entry) => entry.sets.length === 0)) return NextResponse.json({ error: "Добавьте хотя бы один завершённый подход" }, { status: 400 });
    const updated = await prisma.workoutSession.update({ where: { id: session.id }, data: { finishedAt: session.finishedAt ?? new Date() }, include: sessionInclude });
    return NextResponse.json({ session: sessionDto(updated) });
  } catch { return NextResponse.json({ error: "Не удалось завершить тренировку" }, { status: 503 }); }
}
