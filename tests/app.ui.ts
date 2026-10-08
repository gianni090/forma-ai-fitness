import { test, expect } from "@playwright/test";
test("all program days and the timed workout journal work on desktop and mobile", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const exercises = [{ id: "squat", name: "Приседания", muscleGroup: "Ноги", equipment: "Без оборудования", sets: 2, reps: "8–12", restSeconds: 60, metric: "reps", notes: "Комфортная амплитуда" }, { id: "plank", name: "Планка", muscleGroup: "Кор", equipment: "Без оборудования", sets: 2, reps: "30", restSeconds: 60, metric: "seconds", notes: "Дышите свободно" }];
  const workouts = Array.from({ length: 7 }, (_, i) => ({ id: `day-${i + 1}`, day: i + 1, title: `Тренировка ${i + 1}`, focus: "Всё тело", exercises }));
  const data = { user: { name: "Тестовый пользователь", weeklyGoal: 3, timezone: "Europe/Moscow", activeProgramId: "p1" }, programs: [{ id: "p1", name: "Тестовая программа", archivedAt: null, createdAt: new Date().toISOString(), workouts }], active: null as Record<string, unknown> | null, aiConfigured: true, demo: false, stats: { total: 0, weekCount: 0, monthCount: 0, weekVolume: 0, days: Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, count: 0, volume: 0 })) } };
  let session: Record<string, unknown> | null = null;
  let sets: Array<Record<string, unknown>> = [];
  await page.route("**/api/**", async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    const body = req.method() === "GET" ? {} : req.postDataJSON();
    if (path === "/api/me") return route.fulfill({ json: data });
    if (path === "/api/sessions" && req.method() === "GET") return route.fulfill({ json: { sessions: session ? [session] : [], nextCursor: null } });
    if (path === "/api/sessions" && req.method() === "POST") {
      const workout = workouts.find(item => item.id === body.planId)!;
      session = { id: "session-1", title: workout.title, planId: workout.id, startedAt: new Date().toISOString(), exercises, sets, feedback: null }; data.active = session;
      return route.fulfill({ json: { session } });
    }
    if (path.endsWith("/sets")) {
      expect(body.reps).toBe(0); expect(body.durationSeconds).toBe(45); expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
      sets = [...sets, { id: "set-1", name: "Планка", completedAt: new Date().toISOString(), ...body }];
      session!.sets = sets; return route.fulfill({ json: { session } });
    }
    if (path.endsWith("/finish")) { session!.finishedAt = new Date().toISOString(); data.active = null; data.stats.total = 1; data.stats.weekCount = 1; data.stats.monthCount = 1; return route.fulfill({ json: { session } }); }
    if (path === "/api/feedback") { expect(body.sessionId).toBe("session-1"); session!.feedback = body; return route.fulfill({ json: { feedback: body } }); }
    return route.fulfill({ status: 404, json: { error: "Unexpected test route " + path } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Добрый день/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath("overview.png"), fullPage: true });
  await page.getByRole("link", { name: "Мои планы", exact: true }).click();
  await expect(page.getByText("ДЕНЬ 7", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const day = page.locator("details").filter({ hasText: "ДЕНЬ 7" });
  await day.locator("summary").click();
  await day.getByRole("button", { name: "Начать тренировку →" }).click();
  await expect(page.getByRole("heading", { name: "Записать подход" })).toBeVisible();
  await page.getByRole("button", { name: /Планка/ }).click();
  await page.getByLabel("Длительность, секунды").fill("45");
  await page.getByRole("button", { name: "+ Записать выполненный подход", exact: true }).click();
  await expect(page.getByText("45 сек", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Записать подход" })).toBeVisible();
  await page.getByRole("button", { name: "Завершить тренировку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ваш журнал" })).toBeVisible();
  await page.getByLabel("Комментарий", { exact: true }).fill("Хорошая тренировка");
  await page.getByRole("button", { name: "Сохранить оценку", exact: true }).click();
  await expect(page.getByText("Оценка сохранена и будет учтена при генерации программы.", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test("signed-out users see login and can request password recovery", async ({ page }) => {
  await page.route("**/api/me", route => route.fulfill({ status: 401, json: { error: "Войдите", code: "unauthorized" } }));
  await page.route("**/api/auth", route => { expect(route.request().postDataJSON().mode).toBe("forgot"); return route.fulfill({ json: { message: "Если аккаунт существует, на почту отправлена ссылка восстановления." } }); });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Забыли пароль?", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByRole("button", { name: "Отправить ссылку", exact: true }).click();
  await expect(page.getByText("Если аккаунт существует, на почту отправлена ссылка восстановления.", { exact: true })).toBeVisible();
});
