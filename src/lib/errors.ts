import { NextResponse } from "next/server";
export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "request_failed") { super(message); }
}
export function errorResponse(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  console.error("Request failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "Не удалось выполнить действие. Проверьте подключение и повторите.", code: "server_error" }, { status: 503 });
}
export function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(request.url).origin;
  if ((origin && origin !== expected) || request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "Запрос с другого сайта запрещён.", "invalid_origin");
}
export async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > 32768) throw new ApiError(413, "Запрос слишком большой.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Передайте данные запроса.");
  const decoder = new TextDecoder(); let size = 0; let text = "";
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 32768) { await reader.cancel(); throw new ApiError(413, "Запрос слишком большой."); }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try { return JSON.parse(text); } catch { throw new ApiError(400, "Некорректный JSON."); }
}
