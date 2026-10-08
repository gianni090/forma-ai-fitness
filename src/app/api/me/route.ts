import { requireUser } from "@/lib/auth";
import { json, errorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { programInclude, sessionInclude, sessionDto, workoutDto } from "@/lib/workouts";
import { computeStats } from "@/lib/stats";
export async function GET() {
  try {
    const user = await requireUser();
    const [programs, recent, active, total] = await Promise.all([
      prisma.program.findMany({ where: { userId: user.id }, include: programInclude, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.workoutSession.findMany({ where: { userId: user.id, finishedAt: { gte: new Date(Date.now() - 35 * 86400_000) } }, include: sessionInclude }),
      prisma.workoutSession.findFirst({ where: { userId: user.id, finishedAt: null, cancelledAt: null }, include: sessionInclude, orderBy: { startedAt: "desc" } }),
      prisma.workoutSession.count({ where: { userId: user.id, finishedAt: { not: null } } }),
    ]);
    return json({ user: { name: user.name, weeklyGoal: user.weeklyGoal, timezone: user.timezone, questionnaire: user.questionnaire, activeProgramId: user.activeProgramId }, programs: programs.map(program => ({ id: program.id, name: program.name, archivedAt: program.archivedAt, createdAt: program.createdAt, data: program.versions[0]?.data, workouts: program.planWorkouts.map(workoutDto) })), active: active ? sessionDto(active) : null, stats: { ...computeStats(recent.map(sessionDto), new Date(), user.timezone), total }, aiConfigured: (process.env.AI_PROVIDER === "ollama" && process.env.NODE_ENV !== "production") || Boolean(process.env.OPENROUTER_API_KEY), demo: process.env.AUTH_DEMO_MODE === "true" && process.env.NODE_ENV !== "production" });
  } catch (error) { return errorResponse(error); }
}
