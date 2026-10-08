import { requireUser } from "@/lib/auth";
import { closeSession } from "@/lib/workouts";
import { assertSameOrigin, json, errorResponse } from "@/lib/errors";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); const user = await requireUser(); return json({ session: await closeSession(user.id, (await context.params).id, true) }); }
  catch (error) { return errorResponse(error); }
}
