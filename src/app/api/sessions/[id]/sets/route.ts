import { requireUser } from "@/lib/auth";
import { writeSet } from "@/lib/workouts";
import { readBody, assertSameOrigin, json, errorResponse } from "@/lib/errors";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); const user = await requireUser(); return json({ session: await writeSet(user.id, (await context.params).id, await readBody(request)) }, 201); }
  catch (error) { return errorResponse(error); }
}

