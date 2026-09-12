"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type Exercise = { id: string; name: string; muscleGroup: string; equipment: string };
type PlanExercise = Exercise & { sets: number; reps: string; restSeconds: number };
type Session = { id: string; startedAt: string; finishedAt?: string; sets: { id: string; exerciseId: string; reps: number; weight: number }[] };
type View = "overview" | "workout" | "history" | "plans" | "ai";
type GeneratedExercise = { name: string; muscleGroup: string; sets: number; reps: string; restSeconds: number; notes: string };
type GeneratedProgram = { title: string; summary: string; safetyNote: string; days: { day: number; title: string; focus: string; exercises: GeneratedExercise[] }[] };
type SavedProgram = { id: string; name: string; createdAt: string; planWorkouts: { id: string; title: string; dayOfWeek: number; exercises: { targetSets: number; targetReps: string; restSeconds: number; exercise: Exercise }[] }[] };

const fallbackPlan: PlanExercise[] = [
  { id: "squat", name: "Приседания со штангой", muscleGroup: "Ноги", equipment: "Штанга", sets: 4, reps: "6–8", restSeconds: 120 },
  { id: "bench", name: "Жим лёжа", muscleGroup: "Грудь", equipment: "Штанга", sets: 4, reps: "8–10", restSeconds: 90 },
  { id: "row", name: "Тяга верхнего блока", muscleGroup: "Спина", equipment: "Тренажёр", sets: 3, reps: "10–12", restSeconds: 75 },
];

const exerciseIcons: Record<string, string> = { squat: "🏋️", bench: "🏋️‍♂️", row: "🔗", plank: "🧘" };

export default function Home() {
  const [plan, setPlan] = useState<PlanExercise[]>(fallbackPlan);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [active, setActive] = useState<Session | null>(null);
  const [selectedExercise, setSelectedExercise] = useState(fallbackPlan[0].id);
  const [reps, setReps] = useState("8");
  const [weight, setWeight] = useState("40");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [activeView, setActiveView] = useState<View>("overview");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiProgram, setAiProgram] = useState<GeneratedProgram | null>(null);
  const [questionnaire, setQuestionnaire] = useState({ goal: "muscle", level: "beginner", daysPerWeek: 3, durationMinutes: 45, equipment: ["Гантели", "Штанга"], limitations: "" });
  const [programs, setPrograms] = useState<SavedProgram[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState("today");
  const [feedbackSession, setFeedbackSession] = useState<Session | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackEffort, setFeedbackEffort] = useState(6);
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/today").then((r) => r.json()), fetch("/api/sessions").then((r) => r.json()), fetch("/api/programs").then((r) => r.json())])
      .then(([today, history, savedPrograms]) => {
        if (today?.exercises?.length) setPlan(today.exercises);
        if (history?.sessions) setSessions(history.sessions);
        if (savedPrograms?.programs) setPrograms(savedPrograms.programs);
        const latest = savedPrograms?.programs?.[0]?.versions?.[0]?.data;
        if (latest?.title && latest?.days) setAiProgram(latest);
      })
      .catch(() => setMessage("Демо-режим: подключите PostgreSQL, чтобы сохранять данные между запусками."))
      .finally(() => setLoading(false));
  }, []);

  const totalSets = useMemo(() => sessions.reduce((sum, session) => sum + (session?.sets?.length ?? 0), 0), [sessions]);
  const completedWorkouts = sessions.filter((session) => Boolean(session?.finishedAt)).length;

  async function startWorkout(planId = selectedWorkoutId) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) });
      const data = await result.json().catch(() => ({}));
      if (!result.ok || !data.session) return setMessage(data.error || "Не удалось начать тренировку. Проверьте подключение к базе.");
      if (planId !== "today") {
        const selectedWorkout = programs.flatMap((program) => program.planWorkouts).find((workout) => workout.id === planId);
        const nextPlan = selectedWorkout?.exercises.map((item) => ({ ...item.exercise, sets: item.targetSets, reps: item.targetReps, restSeconds: item.restSeconds })) ?? [];
        if (nextPlan.length) { setPlan(nextPlan); setSelectedExercise(nextPlan[0].id); }
      }
      setActive(data.session);
      setActiveView("workout");
      setMessage(data.resumed ? "Продолжаем незавершённую тренировку." : "Тренировка начата. Записывайте только завершённые подходы.");
    } catch { setMessage("Не удалось связаться с сервером. Проверьте, что запущены Next.js и PostgreSQL.");
    } finally { setBusy(false); }
  }

  async function addSet() {
    if (!active || busy) return;
    setBusy(true);
    try {
      const result = await fetch(`/api/sessions/${active.id}/sets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exerciseId: selectedExercise, reps: Number(reps), weight: Number(weight) }) });
      const data = await result.json().catch(() => ({}));
      if (!result.ok) return setMessage(data.error || "Проверьте значения подхода");
      setActive(data.session);
      setMessage("Подход добавлен в журнал.");
    } finally { setBusy(false); }
  }

  async function finishWorkout() {
    if (!active || busy) return;
    if (!(active?.sets?.length ?? 0)) return setMessage("Сначала добавьте хотя бы один завершённый подход.");
    setBusy(true);
    try {
      const result = await fetch(`/api/sessions/${active.id}/finish`, { method: "PATCH" });
      const data = await result.json().catch(() => ({}));
      if (!result.ok || !data.session) return setMessage(data.error || "Не удалось завершить тренировку.");
      setSessions((current) => [data.session, ...current.filter((item) => item?.id !== data.session.id)]);
      setFeedbackSession(data.session);
      setActive(null);
      setMessage("Тренировка завершена — отличный результат!");
    } catch { setMessage("Не удалось завершить тренировку. Повторите попытку.");
    } finally { setBusy(false); }
  }

  async function submitFeedback() {
    if (!feedbackSession || feedbackBusy) return;
    setFeedbackBusy(true);
    try {
      const result = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: feedbackSession.id, rating: feedbackRating, effort: feedbackEffort, notes: feedbackNotes }) });
      const data = await result.json().catch(() => ({}));
      if (!result.ok) return setMessage(data.error || "Не удалось сохранить оценку");
      setFeedbackSession(null); setFeedbackNotes(""); setMessage("Оценка сохранена — она поможет улучшать рекомендации AI.");
    } catch { setMessage("Не удалось сохранить оценку. Проверьте подключение.");
    } finally { setFeedbackBusy(false); }
  }

  async function generateAiProgram() {
    setGenerating(true);
    setMessage("");
    try {
      const result = await fetch("/api/ai/program", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(questionnaire) });
      const data = await result.json().catch(() => ({}));
      if (!result.ok || !data.program) return setMessage(data.error || "AI не смогла создать программу. Проверьте GROQ_API_KEY в .env.");
      setAiProgram(data.program);
      const savedPrograms = await fetch("/api/programs").then((response) => response.json()).catch(() => null);
      if (savedPrograms?.programs) setPrograms(savedPrograms.programs);
      setActiveView("ai");
      setMessage(`Программа «${data.program.title}» создана и сохранена в базе.`);
    } catch { setMessage("Не удалось связаться с AI API. Проверьте GROQ_API_KEY и интернет.");
    } finally { setGenerating(false); }
  }

  function toggleEquipment(item: string) { setQuestionnaire((current) => ({ ...current, equipment: current.equipment.includes(item) ? current.equipment.filter((value) => value !== item) : [...current.equipment, item] })); }

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}><span className={styles.brandMark}>↗</span><span>Forma</span></div>
        <nav className={styles.nav}>
          <button className={`${styles.navLink} ${activeView === "overview" ? styles.navActive : ""}`} onClick={() => setActiveView("overview")}><span>⌂</span> Обзор</button>
          <button className={`${styles.navLink} ${activeView === "workout" ? styles.navActive : ""}`} onClick={() => setActiveView("workout")}><span>◉</span> Тренировка</button>
          <button className={`${styles.navLink} ${activeView === "history" ? styles.navActive : ""}`} onClick={() => setActiveView("history")}><span>◷</span> История</button>
          <button className={`${styles.navLink} ${activeView === "plans" ? styles.navActive : ""}`} onClick={() => setActiveView("plans")}><span>▦</span> Мои планы</button>
          <button className={`${styles.navLink} ${activeView === "ai" ? styles.navActive : ""}`} onClick={() => setActiveView("ai")}><span>✦</span> AI‑тренер</button>
        </nav>
        <div className={styles.sidebarBottom}><div className={styles.aiCard}><span className={styles.sparkle}>✦</span><p>Персональная программа<br />собирается по вашей анкете</p><button onClick={() => setActiveView("ai")}>Открыть AI‑тренера</button></div><div className={styles.profile}><div className={styles.avatar}>А</div><div><strong>Алексей</strong><small>Базовый план</small></div><span className={styles.more}>•••</span></div></div>
      </aside>

      <section className={styles.content} id="dashboard">
        <header className={styles.header}><div><p className={styles.eyebrow}>СУББОТА, 12 СЕНТЯБРЯ</p><h1>Добрый день, Алексей <span>👋</span></h1><p className={styles.subtitle}>Последовательность важнее идеальности. Сегодня — хороший день для тренировки.</p></div><div className={styles.headerActions}><button className={styles.iconButton}>⌕</button><button className={styles.iconButton}>♧</button></div></header>
        {message && <div className={styles.notice}>{message}</div>}
        {feedbackSession && <section className={styles.feedbackPanel}><div><p className={styles.eyebrow}>ТРЕНИРОВКА ЗАВЕРШЕНА</p><h2>Как всё прошло?</h2><p className={styles.subtitle}>Оценка помогает персонализировать следующую программу.</p></div><div className={styles.feedbackFields}><label>Оценка <select value={feedbackRating} onChange={(e) => setFeedbackRating(Number(e.target.value))}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{"★".repeat(value)} ({value}/5)</option>)}</select></label><label>Сложность <select value={feedbackEffort} onChange={(e) => setFeedbackEffort(Number(e.target.value))}>{Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}/10</option>)}</select></label><label className={styles.feedbackNote}>Комментарий <input value={feedbackNotes} onChange={(e) => setFeedbackNotes(e.target.value)} placeholder="Что изменить в следующий раз?" /></label><button className={styles.primaryButton} disabled={feedbackBusy} onClick={submitFeedback}>{feedbackBusy ? "Сохраняем…" : "Сохранить оценку"}</button></div></section>}
        {activeView === "overview" && <div className={styles.stats}><div className={styles.statCard}><span className={styles.statIcon}>♨</span><div><small>Серия тренировок</small><strong>{Math.max(completedWorkouts, 3)} <em>дня</em></strong><p>↑ 12% к прошлой неделе</p></div></div><div className={styles.statCard}><span className={`${styles.statIcon} ${styles.purple}`}>◒</span><div><small>Тренировок в этом месяце</small><strong>{completedWorkouts || 8} <em>/ 16</em></strong><p>Ещё 8 до цели</p></div></div><div className={styles.statCard}><span className={`${styles.statIcon} ${styles.orange}`}>◌</span><div><small>Объём за неделю</small><strong>4 280 <em>кг</em></strong><p>↑ 8% к прошлой неделе</p></div></div></div>}

        <div className={`${styles.grid} ${activeView !== "overview" ? styles.gridSingle : ""}`}>
          <section className={styles.panel} id="workout" style={{ display: activeView === "history" || activeView === "plans" || activeView === "ai" ? "none" : undefined }}><div className={styles.panelHeader}><div><div className={styles.titleRow}><h2>Сегодняшняя тренировка</h2><span className={styles.badge}>СИЛА · 52 МИН</span></div><p>Ноги и верх тела · 3 упражнения</p></div><button className={styles.ghostButton}>•••</button></div><div className={styles.exerciseList}>{(loading ? fallbackPlan : plan).map((exercise, index) => <div className={styles.exercise} key={exercise.id}><div className={styles.exerciseNumber}>{String(index + 1).padStart(2, "0")}</div><div className={styles.exerciseIcon} aria-hidden="true">{exerciseIcons[exercise.id] ?? "🏋️"}</div><div className={styles.exerciseInfo}><strong>{exercise.name}</strong><span>{exercise.muscleGroup} · {exercise.equipment}</span></div><div className={styles.exerciseMeta}><strong>{exercise.sets} × {exercise.reps}</strong><span>Отдых {Math.round(exercise.restSeconds / 60)} мин</span></div><span className={styles.chevron}>›</span></div>)}</div>{active ? <div className={styles.activeWorkout}><div><strong>Тренировка в процессе</strong><span>{active?.sets?.length ?? 0} завершённых подхода</span></div><button className={styles.primaryButton} disabled={busy || !(active?.sets?.length)} onClick={finishWorkout}>Завершить</button></div> : <button className={styles.startButton} disabled={busy} onClick={() => void startWorkout()}>Начать тренировку <span>→</span></button>}</section>

          <section className={styles.panel} id="history" style={{ display: activeView === "workout" || activeView === "plans" || activeView === "ai" ? "none" : undefined }}><div className={styles.panelHeader}><div><h2>{activeView === "history" ? "История тренировок" : "Быстрый журнал"}</h2><p>{activeView === "history" ? "Ваши завершённые сессии" : "Добавляйте подход после выполнения"}</p></div><span className={styles.liveDot}>● онлайн</span></div><div className={styles.logForm}><label>Упражнение<select value={selectedExercise} onChange={(e) => setSelectedExercise(e.target.value)}>{plan.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select></label><div className={styles.formRow}><label>Повторы<input min="1" type="number" value={reps} onChange={(e) => setReps(e.target.value)} /></label><label>Вес, кг<input min="0" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} /></label></div><button className={styles.secondaryButton} disabled={!active || busy} onClick={addSet}>+ Записать завершённый подход</button><small className={styles.formHint}>Пустые и незавершённые вводы не попадают в историю.</small></div><div className={styles.historyMini}><div><span>Всего подходов</span><strong>{totalSets || 24}</strong></div><div><span>Средний вес</span><strong>52 <em>кг</em></strong></div><div><span>Время под нагрузкой</span><strong>38 <em>мин</em></strong></div></div>{activeView === "history" && <div className={styles.sessionHistory}>{sessions.length === 0 ? <p className={styles.emptyState}>Завершённых тренировок пока нет. Начните первую сегодня.</p> : sessions.filter(Boolean).map((session) => <div className={styles.sessionRow} key={session.id}><div><strong>{new Date(session.startedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</strong><small>{session.finishedAt ? "Завершена" : "В процессе"} · {session?.sets?.length ?? 0} подходов</small></div><span>{session?.sets?.reduce((sum, set) => sum + (set?.weight ?? 0), 0)} кг</span></div>)}</div>}</section>
        </div>
        <section className={styles.progressPanel} id="plans" style={{ display: activeView === "overview" || activeView === "plans" ? undefined : "none" }}><div><p className={styles.eyebrow}>ПРОГРЕСС</p><h2>Ваш ритм за последние 7 дней</h2><p className={styles.subtitle}>Данные из дневника тренировок и сохранённых программ.</p></div><div className={styles.chart}><div className={styles.chartBars}>{[38, 58, 44, 76, 52, 88, 64].map((height, i) => <div className={styles.barWrap} key={i}><div className={`${styles.bar} ${i === 5 ? styles.barHot : ""}`} style={{ height: `${height}%` }}></div><span>{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][i]}</span></div>)}</div></div>{activeView === "plans" && <div className={styles.savedPlans}>{programs.length === 0 ? <p className={styles.emptyState}>Планы появятся после создания первой программы.</p> : programs.map((program) => <article className={styles.savedPlan} key={program.id}><div><span className={styles.badge}>{program.id === "demo-program" ? "БАЗОВЫЙ" : "AI‑ПЛАН"}</span><h3>{program.name}</h3><p>{program.planWorkouts.length} тренировок · создан {new Date(program.createdAt).toLocaleDateString("ru-RU")}</p></div><div className={styles.savedPlanActions}>{program.planWorkouts.slice(0, 3).map((workout) => <button className={styles.secondaryButton} key={workout.id} onClick={() => { setSelectedWorkoutId(workout.id); void startWorkout(workout.id); }}>День {workout.dayOfWeek || 1} · Начать</button>)}</div></article>)}</div>}</section>
        {activeView === "ai" && <section className={`${styles.panel} ${styles.aiPanel}`}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>AI‑ТРЕНЕР · ФАЗА 2</p><h2>Соберите программу под себя</h2><p className={styles.subtitle}>Анкета → правила → структурированный ответ AI → сохранение в PostgreSQL.</p></div><span className={styles.aiStatus}>● API готов</span></div><div className={styles.aiForm}><label>Цель<select value={questionnaire.goal} onChange={(e) => setQuestionnaire((current) => ({ ...current, goal: e.target.value }))}><option value="muscle">Набор мышц</option><option value="strength">Сила</option><option value="fat_loss">Снижение веса</option><option value="health">Общее здоровье</option></select></label><label>Уровень<select value={questionnaire.level} onChange={(e) => setQuestionnaire((current) => ({ ...current, level: e.target.value }))}><option value="beginner">Начинающий</option><option value="intermediate">Средний</option><option value="advanced">Продвинутый</option></select></label><label>Дней в неделю<input type="number" min="1" max="7" value={questionnaire.daysPerWeek} onChange={(e) => setQuestionnaire((current) => ({ ...current, daysPerWeek: Number(e.target.value) }))} /></label><label>Минут на тренировку<input type="number" min="15" max="180" value={questionnaire.durationMinutes} onChange={(e) => setQuestionnaire((current) => ({ ...current, durationMinutes: Number(e.target.value) }))} /></label><div className={styles.equipmentField}><span>Оборудование</span><div className={styles.chips}>{["Без оборудования", "Гантели", "Штанга", "Тренажёры"].map((item) => <button type="button" className={`${styles.chip} ${questionnaire.equipment.includes(item) ? styles.chipActive : ""}`} key={item} onClick={() => toggleEquipment(item)}>{item}</button>)}</div></div><label className={styles.fullField}>Ограничения и пожелания<textarea value={questionnaire.limitations} onChange={(e) => setQuestionnaire((current) => ({ ...current, limitations: e.target.value }))} placeholder="Например: не нагружать колени, дома есть только гантели" /></label></div><button className={styles.aiGenerateButton} onClick={generateAiProgram} disabled={generating || questionnaire.equipment.length === 0}>{generating ? "AI анализирует анкету…" : "Создать персональную программу →"}</button>{aiProgram && <div className={styles.generatedProgram}><div className={styles.generatedHeader}><div><span className={styles.badge}>СОХРАНЕНО В БАЗЕ</span><h3>{aiProgram.title}</h3><p>{aiProgram.summary}</p></div><span className={styles.generatedCount}>{aiProgram.days.length} дн.</span></div>{aiProgram.days.map((day) => <details className={styles.dayCard} key={day.day} open={day.day === 1}><summary><span>День {day.day}</span><strong>{day.title}</strong><small>{day.focus} · {day.exercises.length} упражнений</small></summary><div className={styles.generatedExercises}>{day.exercises.map((item) => <div className={styles.generatedExercise} key={`${day.day}-${item.name}`}><span className={styles.exerciseIcon}>{exerciseIcons.squat}</span><div><strong>{item.name}</strong><small>{item.sets} × {item.reps} · отдых {Math.round(item.restSeconds / 60)} мин</small></div></div>)}</div></details>)}<p className={styles.safetyNote}>⚠ {aiProgram.safetyNote}</p></div>}</section>}
      </section>

      {active && <div className={styles.floating}><span className={styles.floatingDot}></span><div><strong>Сессия #{active.id.slice(-4)}</strong><small>данные сохраняются в PostgreSQL</small></div><button disabled={busy || !(active?.sets?.length)} onClick={finishWorkout}>Завершить →</button></div>}
    </main>
  );
}
