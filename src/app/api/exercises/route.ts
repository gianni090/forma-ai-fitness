import { NextResponse } from "next/server";
import { ensureDemoData } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await ensureDemoData();
    const items = await prisma.exercise.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ exercises: items });
  } catch { return NextResponse.json({ error: "База данных недоступна" }, { status: 503 }); }
}
