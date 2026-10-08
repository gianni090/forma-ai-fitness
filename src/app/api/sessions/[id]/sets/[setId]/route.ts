import { requireUser } from "@/lib/auth";
import { writeSet, deleteSet } from "@/lib/workouts";
import { readBody, assertSameOrigin, json, errorResponse } from "@/lib/errors";
type Context = { params: Promise<{ id: string; setId: string }> };
export async function PATCH(request: Request, context: Context) {
  try { assertSameOrigin(request); const user = await requireUser(); const { id, setId } = await context.params; return json({ session: await writeSet(user.id, id, await readBody(request), setId) }); }
  catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request, context: Context) {
  try { assertSameOrigin(request); const user = await requireUser(); const { id, setId } = await context.params; return json({ session: await deleteSet(user.id, id, setId) }); }
  catch (error) { return errorResponse(error); }
}
