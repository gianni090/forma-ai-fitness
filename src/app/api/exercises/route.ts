import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { json, errorResponse } from "@/lib/errors";
export async function GET() { try { await requireUser(); return json({ exercises: await prisma.exercise.findMany({ orderBy: { name: "asc" }, take: 200 }) }); } catch (error) { return errorResponse(error); } }

