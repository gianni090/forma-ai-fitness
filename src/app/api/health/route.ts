import { prisma } from "@/lib/prisma";
import { json } from "@/lib/errors";
export async function GET() {
  try { await prisma.user.findFirst({ select: { weeklyGoal: true } }); return json({ status: "ok" }); }
  catch { return json({ status: "unavailable" }, 503); }
}
