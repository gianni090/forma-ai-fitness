import { requireUser } from "@/lib/auth";
import { saveFeedback } from "@/lib/workouts";
import { readBody, assertSameOrigin, json, errorResponse } from "@/lib/errors";
export async function POST(request: Request) {
  try { assertSameOrigin(request); const user = await requireUser(); return json({ feedback: await saveFeedback(user.id, await readBody(request)) }); }
  catch (error) { return errorResponse(error); }
}

