import { NextResponse } from "next/server";
import { ensureDemoData, planExerciseDto } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { workout } = await ensureDemoData();
    const items = await prisma.planExercise.findMany({ where: { planWorkoutId: workout.id }, include: { exercise: true }, orderBy: { order: "asc" } });
    return NextResponse.json({ date: new Date().toISOString().slice(0, 10), exercises: items.map(planExerciseDto) });
  } catch { return NextResponse.json({ error: "База данных недоступна" }, { status: 503 }); }
}
