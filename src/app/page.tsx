"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPanel } from "@/components/AuthPanel";
import { WorkoutEditor } from "@/components/WorkoutEditor";
import { request, RequestError } from "@/lib/client";
import type { DashboardData, Session, SetEntry, Workout } from "@/lib/types";
import type { Questionnaire } from "@/lib/ai";
import styles from "./page.module.css";

type View = "overview" | "workout" | "history" | "plans" | "ai" | "profile";
const views: Array<{ id: View; name: string; icon: string }> = [{ id: "overview", name: "Обзор", icon: "⌂" }, { id: "workout", name: "Тренировка", icon: "◉" }, { id: "history", name: "История", icon: "◷" }, { id: "plans", name: "Мои планы", icon: "▦" }, { id: "ai", name: "AI-тренер", icon: "✦" }, { id: "profile", name: "Профиль", icon: "○" }];
const equipment = ["Без оборудования", "Гантели", "Штанга", "Тренажёры"] as const;
const initialQuestionnaire: Questionnaire = { goal: "muscle", level: "beginner", daysPerWeek: 3, durationMinutes: 45, equipment: ["Гантели"], limitations: "" };
const number = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
const duration = (seconds: number) => seconds >= 60 ? `${Math.floor(seconds / 60)} мин${seconds % 60 ? ` ${seconds % 60} сек` : ""}` : `${seconds} сек`;

export default function Home() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]); const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview"); const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState(false); const [setup, setSetup] = useState(""); const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(""); const actionLock = useRef(false);
  const [tick, setTick] = useState(() => Date.now()); const [restEnd, setRestEnd] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState(""); const [reps, setReps] = useState("8"); const [weight, setWeight] = useState("0"); const [seconds, setSeconds] = useState("30");
  const [editingSet, setEditingSet] = useState<SetEntry | null>(null); const pendingSet = useRef<string | null>(null); const pendingAi = useRef<string | null>(null);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>(initialQuestionnaire);
  const [editor, setEditor] = useState<Workout | null>(null); const [newName, setNewName] = useState("Мой стартовый план"); const [archive, setArchive] = useState(false);
  const [profile, setProfile] = useState({ name: "", weeklyGoal: 3, timezone: "Europe/Moscow" });
  const [feedbackSession, setFeedbackSession] = useState<Session | null>(null);
  const [rating, setRating] = useState(5); const [effort, setEffort] = useState(6); const [feedbackNotes, setFeedbackNotes] = useState("");

  const refresh = useCallback(async (initial = false) => {
    const next = await request<DashboardData>("/api/me");
    if (next.active && (!next.active.exercises.length || next.active.exercises.some(item => !item.sets))) {
      next.active = (await request<{ session: Session }>("/api/sessions", "POST", {})).session;
    }
    const history = await request<{ sessions: Session[]; nextCursor: string | null }>("/api/sessions");
    setData(next); setSessions(history.sessions); setNextCursor(history.nextCursor); setAuth(false); setSetup("");
    if (initial) { setProfile({ name: next.user.name, weeklyGoal: next.user.weeklyGoal, timezone: next.user.timezone }); if (next.user.questionnaire) setQuestionnaire(next.user.questionnaire); }
    if (next.active) {
      const saved = Number(localStorage.getItem(`rest:${next.active.id}`));
      if (saved && saved > Date.now() && saved < Date.now() + 300_000) setRestEnd(saved);
    }
    return next;
  }, [setProfile, setQuestionnaire]);
  const load = useCallback(async () => {
    try { await refresh(true); }
    catch (error) {
      if (error instanceof RequestError && error.status === 401) {
        setAuth(true); setData(null);
        setSetup(new URLSearchParams(window.location.search).get("authError") === "1" ? "Ссылка входа устарела или недействительна. Войдите в аккаунт или запросите новую ссылку восстановления." : "");
      }
      else setSetup(error instanceof Error ? error.message : "Не удалось загрузить приложение.");
    } finally { setLoading(false); }
  }, [refresh]);
  useEffect(() => { let live = true; queueMicrotask(() => { if (live) void load(); }); return () => { live = false; }; }, [load]);
  useEffect(() => {
    const onHash = () => { const next = window.location.hash.slice(1); if (views.some(item => item.id === next)) setView(next as View); };
    queueMicrotask(onHash); window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), data?.active || restEnd ? 1000 : 60_000); return () => clearInterval(timer); }, [data?.active?.id, restEnd, data?.active]);
  async function perform(label: string, action: () => Promise<void>, success = "") {
    if (actionLock.current) return false; actionLock.current = true; setBusy(label); setMessage("");
    try { await action(); await refresh(); if (success) setMessage(success); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось выполнить действие."); return false; }
    finally { actionLock.current = false; setBusy(""); }
  }
  function navigate(next: View) { setView(next); router.push(`#${next}`, { scroll: false }); }
  function chooseExercise(id: string) {
    setSelectedId(id); setEditingSet(null); pendingSet.current = null;
    const item = data?.active?.exercises.find(item => item.id === id); const target = item?.reps.match(/^\d+/)?.[0];
    setReps(target || "8"); setSeconds(target || "30"); setWeight("0");
  }
  async function start(workoutId: string) {
    await perform("start", async () => { const result = await request<{ session: Session }>("/api/sessions", "POST", { planId: workoutId }); setSelectedId(result.session.exercises[0]?.id || ""); setEditingSet(null); navigate("workout"); }, "Тренировка начата. Записывайте подходы после выполнения.");
  }
  async function addSet() {
    const active = data?.active; const selected = active?.exercises.find(item => item.id === selectedId) || active?.exercises[0];
    if (!active || !selected) return;
    pendingSet.current ??= crypto.randomUUID();
    const body = { exerciseId: selected.id, reps: selected.metric === "seconds" ? 0 : Number(reps), weight: selected.metric === "seconds" ? 0 : Number(weight), ...(selected.metric === "seconds" ? { durationSeconds: Number(seconds) } : {}), requestId: pendingSet.current };
    const ok = await perform("set", async () => {
      const path = `/api/sessions/${active.id}/sets${editingSet ? `/${editingSet.id}` : ""}`;
      await request(path, editingSet ? "PATCH" : "POST", body);
      if (!editingSet) { const target = Date.now() + selected.restSeconds * 1000; setRestEnd(target); localStorage.setItem(`rest:${active.id}`, String(target)); }
    }, editingSet ? "Подход исправлен." : "Подход сохранён.");
    if (ok) { pendingSet.current = null; setEditingSet(null); }
  }
  async function close(cancel = false) {
    const active = data?.active; if (!active) return;
    await perform("close", async () => {
      const result = await request<{ session: Session }>(`/api/sessions/${active.id}/${cancel ? "cancel" : "finish"}`, "PATCH");
      localStorage.removeItem(`rest:${active.id}`); setRestEnd(null); setEditingSet(null); pendingSet.current = null; navigate("history");
      if (!cancel) openFeedback(result.session);
    }, cancel ? "Тренировка отменена. Записанные подходы сохранены в истории." : "Тренировка завершена. Оцените, как она прошла.");
  }
  function openFeedback(session: Session) { setFeedbackSession(session); setRating(session.feedback?.rating || 5); setEffort(session.feedback?.effort || 6); setFeedbackNotes(session.feedback?.notes || ""); }
  async function generate() {
    pendingAi.current ??= crypto.randomUUID();
    await perform("ai", async () => {
      try { await request("/api/ai/program", "POST", { ...questionnaire, requestId: pendingAi.current }); pendingAi.current = null; navigate("plans"); }
      catch (error) { if (error instanceof RequestError && error.status !== 0 && error.code !== "ai_running") pendingAi.current = null; throw error; }
    }, "Персональная программа создана и выбрана активной.");
  }
  async function programAction(id: string, action: string, name?: string) { await perform("program", async () => { await request(`/api/programs/${id}`, "PATCH", { action, ...(name ? { name } : {}) }); }, "Программа обновлена."); }

  if (loading && !data) return <main className={styles.authShell}><section className={styles.authCard}><h1>Forma</h1><p role="status">Загружаем ваш дневник…</p></section></main>;
  if (auth) return <AuthPanel initialMessage={setup} onAuthenticated={() => void load()} />;
  if (!data) return <main className={styles.authShell}><section className={styles.authCard}><h1>Forma</h1><p className={styles.notice} role="alert">{setup || "Не удалось загрузить данные."}</p><button className={styles.startButton} onClick={() => void load()}>Попробовать снова</button></section></main>;
  const active = data.active; const selected = active?.exercises.find(item => item.id === selectedId) || active?.exercises[0];
  const activeProgram = data.programs.find(item => item.id === data.user.activeProgramId && !item.archivedAt);
  const date = (value: string) => new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: data.user.timezone });
  const remaining = restEnd ? Math.max(0, Math.ceil((restEnd - tick) / 1000)) : 0;
  const maxCount = Math.max(1, ...data.stats.days.map(item => item.count));
  const edit = (entry: SetEntry) => { setEditingSet(entry); setSelectedId(entry.exerciseId); setReps(String(entry.reps)); setWeight(String(entry.weight)); setSeconds(String(entry.durationSeconds || 30)); pendingSet.current = null; };
  return <main className={styles.shell}>
    <aside className={styles.sidebar}><a href="#overview" className={styles.brand}><span className={styles.brandMark}>↗</span>Forma</a><nav className={styles.nav} aria-label="Главное меню">{views.map(item => <a href={`#${item.id}`} className={`${styles.navLink} ${view === item.id ? styles.navActive : ""}`} key={item.id} aria-current={view === item.id ? "page" : undefined}><span aria-hidden="true">{item.icon}</span>{item.name}</a>)}</nav><div className={styles.sidebarBottom}><div className={styles.aiCard}><p>Программа под вашу цель, оборудование и историю тренировок.</p><button onClick={() => navigate("ai")}>Открыть AI-тренера ↗</button></div><button className={styles.profileLink} onClick={() => navigate("profile")}><span className={styles.avatar}>{data.user.name.slice(0, 1)}</span><span>{data.user.name}<small>Ваш личный дневник</small></span></button></div></aside>
    <section className={styles.content}>
      <header className={styles.header}><div><p className={styles.eyebrow}>{date(new Date(tick).toISOString())}</p><h1>{view === "overview" ? `Добрый день, ${data.user.name}` : views.find(item => item.id === view)?.name}</h1><p className={styles.subtitle}>Последовательность важнее идеальности. Двигайтесь в своём темпе.</p></div>{active && <button className={styles.secondaryButton} onClick={() => navigate("workout")}>Продолжить тренировку →</button>}</header>
      {data.demo && <p className={styles.notice}>Локальный демо-режим. В опубликованном приложении используется личный аккаунт.</p>}
      {message && <div className={styles.notice} role="status" aria-live="polite">{message}</div>}
      {feedbackSession && <section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>ОБРАТНАЯ СВЯЗЬ</p><h2>{feedbackSession.title}</h2></div><button className={styles.textButton} onClick={() => setFeedbackSession(null)}>Позже</button></div><form className={styles.formGrid} onSubmit={event => { event.preventDefault(); void perform("feedback", async () => { await request("/api/feedback", "POST", { sessionId: feedbackSession.id, rating, effort, notes: feedbackNotes }); setFeedbackSession(null); }, "Оценка сохранена и будет учтена при генерации программы."); }}><label>Оценка<select value={rating} onChange={e => setRating(Number(e.target.value))}>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label><label>Сложность<select value={effort} onChange={e => setEffort(Number(e.target.value))}>{Array.from({ length: 10 }, (_, i) => i + 1).map(value => <option key={value}>{value}</option>)}</select></label><label className={styles.fullField}>Комментарий<textarea maxLength={500} value={feedbackNotes} onChange={e => setFeedbackNotes(e.target.value)} placeholder="Что получилось, что стоит изменить?" /></label><button className={styles.startButton} disabled={Boolean(busy)}>Сохранить оценку</button></form></section>}
      {view === "overview" && <>
        <div className={styles.stats}>{[{ label: "Тренировок за 7 дней", value: data.stats.weekCount, unit: `/ ${data.user.weeklyGoal}` }, { label: "Тренировок в месяце", value: data.stats.monthCount, unit: "" }, { label: "Объём за 7 дней", value: data.stats.weekVolume, unit: "кг" }].map(item => <article className={styles.statCard} key={item.label}><small>{item.label}</small><strong>{number(item.value)} <em>{item.unit}</em></strong></article>)}</div>
        <section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>АКТИВНАЯ ПРОГРАММА</p><h2>{activeProgram?.name || "Начните с программы"}</h2><p>{active ? "Есть незавершённая тренировка — продолжите её." : "Выберите день и запишите свои результаты."}</p></div><button className={styles.textButton} onClick={() => navigate("plans")}>Все планы →</button></div>{active ? <button className={styles.startButton} onClick={() => navigate("workout")}>Продолжить: {active.title}</button> : activeProgram ? <div className={styles.actions}>{activeProgram.workouts.map(workout => <button key={workout.id} className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => void start(workout.id)}>День {workout.day}: {workout.title} →</button>)}</div> : <div className={styles.actions}><button className={styles.startButton} onClick={() => navigate("ai")}>Составить программу с AI</button><button className={styles.secondaryButton} onClick={() => navigate("plans")}>Создать стартовый план</button></div>}</section>
        <section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>ВАШ РИТМ</p><h2>Тренировки за последние 7 дней</h2><p>Количество завершённых тренировок по дням. Объём = вес × повторы.</p></div></div><div className={styles.chart} role="img" aria-label={data.stats.days.map(day => `${day.date}: ${day.count} тренировок`).join(", ")}>{data.stats.days.map(day => <div className={styles.barWrap} key={day.date}><strong>{day.count}</strong><div className={styles.barTrack}><div className={styles.bar} style={{ height: `${day.count / maxCount * 100}%` }} /></div><small>{new Date(day.date + "T12:00:00Z").toLocaleDateString("ru-RU", { weekday: "short", timeZone: "UTC" })}</small></div>)}</div><p className={styles.subtitle}>Всего завершено тренировок: {data.stats.total}</p></section>
      </>}
      {view === "workout" && (active ? <div className={styles.grid}>
        <section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>В ПРОЦЕССЕ · {duration(Math.max(0, Math.floor((tick - new Date(active.startedAt).getTime()) / 1000)))}</p><h2>{active.title}</h2><p>{active.sets.length} записанных подходов</p></div></div><div className={styles.exerciseList}>{active.exercises.map((item, index) => <button className={`${styles.exercise} ${selected?.id === item.id ? styles.exerciseSelected : ""}`} key={item.id} disabled={Boolean(editingSet)} onClick={() => chooseExercise(item.id)}><span className={styles.exerciseNumber}>{index + 1}</span><span className={styles.exerciseInfo}><strong>{item.name}</strong><small>{item.sets} × {item.reps}{item.metric === "seconds" ? " сек" : " повт."} · {duration(item.restSeconds)} отдыха</small><small>Выполнено: {active.sets.filter(set => set.exerciseId === item.id).length} / {item.sets}</small></span></button>)}</div><div className={styles.actions}><button className={styles.startButton} disabled={Boolean(busy) || !active.sets.length} onClick={() => void close()}>Завершить тренировку</button><button className={styles.textButton} disabled={Boolean(busy)} onClick={() => void close(true)}>Отменить тренировку</button></div></section>
        <section className={styles.panel}><div className={styles.panelHeader}><div><h2>{editingSet ? "Исправить подход" : "Записать подход"}</h2><p>{selected?.name}</p></div></div>{selected?.notes && <p className={styles.technique}>{selected.notes}</p>}<form className={styles.stack} onSubmit={event => { event.preventDefault(); void addSet(); }}>{selected?.metric === "seconds" ? <label>Длительность, секунды<input type="number" min={1} max={3600} required value={seconds} onChange={e => { setSeconds(e.target.value); pendingSet.current = null; }} /></label> : <div className={styles.formGrid}><label>Повторы<input type="number" min={1} max={1000} required value={reps} onChange={e => { setReps(e.target.value); pendingSet.current = null; }} /></label><label>Вес, кг<input type="number" min={0} max={1000} step="0.1" required value={weight} onChange={e => { setWeight(e.target.value); pendingSet.current = null; }} /></label></div>}<button className={styles.startButton} disabled={Boolean(busy) || !selected}>{busy === "set" ? "Сохраняем…" : editingSet ? "Сохранить исправление" : "+ Записать выполненный подход"}</button>{editingSet && <button type="button" className={styles.textButton} onClick={() => { setEditingSet(null); pendingSet.current = null; }}>Отмена редактирования</button>}</form>
        {restEnd && <div className={styles.restTimer} role="timer"><div><small>Отдых между подходами</small><strong>{remaining ? duration(remaining) : "Время отдыха закончилось"}</strong></div><button className={styles.textButton} onClick={() => { localStorage.removeItem(`rest:${active.id}`); setRestEnd(null); }}>Сбросить</button></div>}
        <div className={styles.setList}>{active.sets.map((entry, i) => <div className={styles.setRow} key={entry.id}><span><strong>{i + 1}. {entry.name}</strong><small>{entry.durationSeconds ? `${entry.durationSeconds} сек` : `${entry.reps} повт. × ${number(entry.weight)} кг`}</small></span><div className={styles.actions}><button className={styles.textButton} disabled={Boolean(busy)} onClick={() => edit(entry)}>Изменить</button><button className={styles.textButton} disabled={Boolean(busy)} onClick={() => void perform("delete", async () => { await request(`/api/sessions/${active.id}/sets/${entry.id}`, "DELETE"); if (editingSet?.id === entry.id) setEditingSet(null); }, "Подход удалён.")}>Убрать</button></div></div>)}</div></section>
      </div> : <section className={styles.panel}><h2>Сейчас нет активной тренировки</h2><p className={styles.subtitle}>Выберите день в своей программе.</p><button className={styles.startButton} onClick={() => navigate("plans")}>Перейти к программам</button></section>)}
      {view === "history" && <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Ваш журнал</h2><p>Результаты остаются здесь после завершения или отмены сессии.</p></div></div>{!sessions.length && <p className={styles.emptyState}>Тренировок пока нет. Начните первую из своего плана.</p>}{sessions.map(session => <details className={styles.historyCard} key={session.id}><summary><span><strong>{session.title}</strong><small>{date(session.startedAt)} · {session.sets.length} подходов</small></span><span className={styles.badge}>{session.finishedAt ? "Завершена" : session.cancelledAt ? "Отменена" : "В процессе"}</span></summary><div className={styles.historyBody}>{session.sets.map(entry => <p key={entry.id}>{entry.name}: {entry.durationSeconds ? `${entry.durationSeconds} сек` : `${entry.reps} × ${number(entry.weight)} кг`}</p>)}<p className={styles.subtitle}>Объём: {number(session.sets.reduce((sum, set) => sum + set.reps * set.weight, 0))} кг{session.finishedAt ? ` · Время сессии: ${duration(Math.floor((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 1000))}` : ""}</p>{session.feedback && <p>Оценка: {session.feedback.rating}/5 · сложность: {session.feedback.effort}/10{session.feedback.notes ? ` · ${session.feedback.notes}` : ""}</p>}{session.finishedAt && <button className={styles.secondaryButton} onClick={() => openFeedback(session)}>{session.feedback ? "Изменить оценку" : "Оценить тренировку"}</button>}</div></details>)}{nextCursor && <button className={styles.secondaryButton} disabled={Boolean(busy)} onClick={async () => { if (actionLock.current) return; actionLock.current = true; setBusy("history"); try { const next = await request<{ sessions: Session[]; nextCursor: string | null }>(`/api/sessions?cursor=${encodeURIComponent(nextCursor)}`); setSessions(current => [...current, ...next.sessions]); setNextCursor(next.nextCursor); } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось загрузить историю."); } finally { actionLock.current = false; setBusy(""); } }}>Загрузить ещё</button>}</section>}
      {view === "plans" && <>
        {editor ? <WorkoutEditor key={editor.id} workout={editor} busy={Boolean(busy)} onClose={() => setEditor(null)} onSave={async body => { const ok = await perform("edit", async () => { await request(`/api/workouts/${editor.id}`, "PATCH", body); }, "Тренировка обновлена. История сохранена."); if (ok) setEditor(null); }} /> : <>
        <section className={styles.panel}><div className={styles.panelHeader}><h2>Мои программы</h2><button className={styles.textButton} onClick={() => setArchive(value => !value)}>{archive ? "Активные планы" : "Архив"}</button></div><form className={styles.actions} onSubmit={event => { event.preventDefault(); void perform("create", async () => { await request("/api/programs", "POST", { name: newName }); }, "Стартовая программа создана. Можно настроить упражнения."); }}><label className={styles.grow}>Название стартового плана<input required minLength={2} maxLength={80} value={newName} onChange={e => setNewName(e.target.value)} /></label><button className={styles.secondaryButton} disabled={Boolean(busy)}>Создать</button><button type="button" className={styles.startButton} onClick={() => navigate("ai")}>Создать с AI ✦</button></form></section>
        {data.programs.filter(program => Boolean(program.archivedAt) === archive).map(program => <section className={styles.panel} key={program.id}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>{program.id === data.user.activeProgramId ? "АКТИВНАЯ ПРОГРАММА" : `СОЗДАНА ${date(program.createdAt)}`}</p><h2>{program.name}</h2><p>{program.data?.summary}</p></div><div className={styles.actions}>{archive ? <button className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => void programAction(program.id, "restore")}>Восстановить</button> : <><button className={styles.textButton} disabled={Boolean(busy) || program.id === data.user.activeProgramId} onClick={() => void programAction(program.id, "activate")}>Выбрать активной</button><button className={styles.textButton} disabled={Boolean(busy)} onClick={() => void programAction(program.id, "archive")}>В архив</button></>}</div></div>{program.workouts.map(workout => <details className={styles.dayCard} key={workout.id}><summary><span className={styles.badge}>ДЕНЬ {workout.day}</span><strong>{workout.title}</strong><small>{workout.exercises.length} упражнений</small></summary><div className={styles.historyBody}>{workout.exercises.map(item => <div className={styles.planExercise} key={item.id}><strong>{item.name}</strong><span>{item.sets} × {item.reps}{item.metric === "seconds" ? " сек" : ""} · отдых {duration(item.restSeconds)}</span><small>{item.notes}</small></div>)}{!archive && <div className={styles.actions}><button className={styles.startButton} disabled={Boolean(busy) || Boolean(active)} onClick={() => void start(workout.id)}>Начать тренировку →</button><button className={styles.secondaryButton} onClick={() => setEditor(workout)}>Изменить упражнения</button></div>}</div></details>)}{program.data?.safetyNote && <p className={styles.safetyNote}>{program.data.safetyNote}</p>}</section>)}
        {!data.programs.some(program => Boolean(program.archivedAt) === archive) && <p className={styles.emptyState}>{archive ? "Архив пока пуст." : "Программ пока нет. Создайте стартовый план или заполните анкету AI."}</p>}
        </>}
      </>}
      {view === "ai" && <section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>ПЕРСОНАЛЬНАЯ ПРОГРАММА</p><h2>Соберите план под себя</h2><p>AI учитывает анкету, последние тренировки и ваши оценки.</p></div><span className={styles.badge}>{data.aiConfigured ? "AI настроен" : "AI не подключён"}</span></div><form className={styles.stack} onSubmit={event => { event.preventDefault(); void generate(); }}><div className={styles.formGrid}><label>Цель<select value={questionnaire.goal} onChange={e => { pendingAi.current = null; setQuestionnaire(current => ({ ...current, goal: e.target.value as Questionnaire["goal"] })); }}><option value="muscle">Набор мышц</option><option value="strength">Сила</option><option value="fat_loss">Снижение веса</option><option value="health">Общее здоровье</option></select></label><label>Опыт<select value={questionnaire.level} onChange={e => { pendingAi.current = null; setQuestionnaire(current => ({ ...current, level: e.target.value as Questionnaire["level"] })); }}><option value="beginner">Начинающий</option><option value="intermediate">Средний</option><option value="advanced">Продвинутый</option></select></label><label>Тренировок в неделю<input required type="number" min={1} max={7} value={questionnaire.daysPerWeek} onChange={e => { pendingAi.current = null; setQuestionnaire(current => ({ ...current, daysPerWeek: Number(e.target.value) })); }} /></label><label>Минут на тренировку<input required type="number" min={15} max={180} value={questionnaire.durationMinutes} onChange={e => { pendingAi.current = null; setQuestionnaire(current => ({ ...current, durationMinutes: Number(e.target.value) })); }} /></label></div><fieldset className={styles.equipment}><legend>Доступное оборудование</legend><div className={styles.actions}>{equipment.map(item => <button type="button" className={`${styles.chip} ${questionnaire.equipment.includes(item) ? styles.chipActive : ""}`} key={item} aria-pressed={questionnaire.equipment.includes(item)} onClick={() => { pendingAi.current = null; setQuestionnaire(current => ({ ...current, equipment: current.equipment.includes(item) ? current.equipment.filter(value => value !== item) : [...current.equipment, item] })); }}>{item}</button>)}</div></fieldset><label>Ограничения и пожелания<textarea maxLength={500} value={questionnaire.limitations} onChange={e => { pendingAi.current = null; setQuestionnaire(current => ({ ...current, limitations: e.target.value })); }} placeholder="Что учитывать при выборе упражнений?" /></label><p className={styles.safetyNote}>Программа не заменяет консультацию специалиста. При боли остановитесь; ограничения здоровья обсудите со специалистом.</p><button className={styles.startButton} disabled={Boolean(busy) || !questionnaire.equipment.length || !data.aiConfigured}>{busy === "ai" ? "AI составляет программу — это может занять до двух минут…" : "Создать и сохранить программу →"}</button>{!data.aiConfigured && <p className={styles.subtitle}>Для генерации администратору нужно подключить OpenRouter. Стартовые планы и дневник доступны без AI.</p>}</form></section>}
      {view === "profile" && <section className={styles.panel}><h2>Ваш профиль</h2><form className={styles.stack} onSubmit={event => { event.preventDefault(); void perform("profile", async () => { await request("/api/profile", "PATCH", profile); }, "Профиль сохранён."); }}><label>Имя<input required maxLength={60} value={profile.name} onChange={e => setProfile(current => ({ ...current, name: e.target.value }))} /></label><label>Цель: тренировок в неделю<input required type="number" min={1} max={7} value={profile.weeklyGoal} onChange={e => setProfile(current => ({ ...current, weeklyGoal: Number(e.target.value) }))} /></label><label>Часовой пояс<input required value={profile.timezone} list="timezones" onChange={e => setProfile(current => ({ ...current, timezone: e.target.value }))} /><datalist id="timezones"><option>Europe/Moscow</option><option>Europe/Berlin</option><option>Asia/Yekaterinburg</option><option>Asia/Novosibirsk</option><option>UTC</option></datalist></label><button className={styles.startButton} disabled={Boolean(busy)}>Сохранить профиль</button></form>{!data.demo && <button className={styles.secondaryButton} disabled={Boolean(busy)} onClick={async () => { if (actionLock.current) return; actionLock.current = true; setBusy("logout"); try { await request("/api/auth", "POST", { mode: "signout" }); setData(null); setSessions([]); setAuth(true); setFeedbackSession(null); } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось выйти."); } finally { actionLock.current = false; setBusy(""); } }}>Выйти из аккаунта</button>}</section>}
    </section>
  </main>;
}

