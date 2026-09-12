import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDemoData } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";

const programSchema = z.object({ name: z.string().trim().min(2, "Название плана слишком короткое").max(80) });

export async function GET() {
  try {
    const { user } = await ensureDemoData();
    const programs = await prisma.program.findMany({ where: { userId: user.id }, include: { versions: { orderBy: { version: "desc" }, take: 1 }, planWorkouts: { include: { exercises: { include: { exercise: true }, orderBy: { order: "asc" } } }, orderBy: { dayOfWeek: "asc" } } }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ programs });
  } catch { return NextResponse.json({ error: "База данных недоступна" }, { status: 503 }); }
}

export async function POST(request: Request) {
  try {
    const parsed = programSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Некорректное название плана" }, { status: 400 });
    const { user } = await ensureDemoData();
    const program = await prisma.program.create({ data: { userId: user.id, name: parsed.data.name } });
    return NextResponse.json({ program }, { status: 201 });
  } catch { return NextResponse.json({ error: "Не удалось создать план" }, { status: 503 }); }
}
