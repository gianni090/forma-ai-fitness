import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDemoData } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";

const feedbackSchema = z.object({ rating: z.number().int().min(1).max(5), effort: z.number().int().min(1).max(10), notes: z.string().trim().max(500).optional(), sessionId: z.string().optional() });

export async function POST(request: Request) {
  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Некорректная обратная связь" }, { status: 400 });
  try {
    const { user } = await ensureDemoData();
    if (parsed.data.sessionId) {
      const owner = await prisma.workoutSession.findFirst({ where: { id: parsed.data.sessionId, userId: user.id }, select: { id: true } });
      if (!owner) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    }
    const feedback = await prisma.feedback.create({ data: { userId: user.id, sessionId: parsed.data.sessionId, rating: parsed.data.rating, effort: parsed.data.effort, notes: parsed.data.notes || null } });
    return NextResponse.json({ feedback }, { status: 201 });
  } catch { return NextResponse.json({ error: "Не удалось сохранить обратную связь" }, { status: 503 }); }
}
