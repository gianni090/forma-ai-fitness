export class RequestError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
export async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { method, ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}), cache: "no-store" }); }
  catch { throw new RequestError("Нет связи с сервером. Проверьте соединение и повторите.", 0, "network"); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new RequestError(data?.error || "Не удалось выполнить действие.", response.status, data?.code);
  if (!data) throw new RequestError("Сервер вернул пустой ответ.", 502);
  return data as T;
}
