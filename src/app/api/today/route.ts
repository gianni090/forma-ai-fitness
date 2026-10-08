import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { workoutInclude, workoutDto } from "@/lib/workouts";
import { json, errorResponse } from "@/lib/errors";
export async function GET() {
  try { const user = await requireUser(); const workout = user.activeProgramId ? await prisma.planWorkout.findFirst({ where: { programId: user.activeProgramId, program: { userId: user.id, archivedAt: null } }, include: workoutInclude, orderBy: { dayOfWeek: "asc" } }) : null; return json({ workout: workout ? workoutDto(workout) : null }); }
  catch (error) { return errorResponse(error); }
}

