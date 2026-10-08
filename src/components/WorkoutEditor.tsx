"use client";
import { useState } from "react";
import type { Workout } from "@/lib/types";
import styles from "@/app/page.module.css";
const equipment = ["Без оборудования", "Гантели", "Штанга", "Тренажёры"];
export function WorkoutEditor({ workout, busy, onSave, onClose }: { workout: Workout; busy: boolean; onSave: (body: unknown) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState(workout.title);
  const [items, setItems] = useState(workout.exercises.map(item => ({ ...item })));
  function change(index: number, key: string, value: string | number) { setItems(current => current.map((item, i) => i === index ? { ...item, [key]: value } : item)); }
  return <section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>РЕДАКТИРОВАНИЕ ДНЯ</p><h2>Настройте тренировку</h2></div><button className={styles.textButton} onClick={onClose}>Закрыть</button></div><form className={styles.stack} onSubmit={async event => { event.preventDefault(); await onSave({ title, exercises: items }); }}>
    <label>Название<input required minLength={2} maxLength={100} value={title} onChange={e => setTitle(e.target.value)} /></label>
    {items.map((item, index) => <fieldset className={styles.editorExercise} key={index}><legend>Упражнение {index + 1}</legend><div className={styles.formGrid}>
      <label>Название<input value={item.name} required minLength={2} maxLength={100} onChange={e => change(index, "name", e.target.value)} /></label>
      <label>Группа мышц<input value={item.muscleGroup} required minLength={2} maxLength={40} onChange={e => change(index, "muscleGroup", e.target.value)} /></label>
      <label>Оборудование<select value={item.equipment} onChange={e => change(index, "equipment", e.target.value)}>{equipment.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Единица<select value={item.metric} onChange={e => change(index, "metric", e.target.value)}><option value="reps">Повторы</option><option value="seconds">Секунды</option></select></label>
      <label>Подходы<input type="number" min={1} max={8} required value={item.sets} onChange={e => change(index, "sets", Number(e.target.value))} /></label>
      <label>Цель (число или диапазон)<input required pattern="[0-9]+([-–][0-9]+)?" value={item.reps} onChange={e => change(index, "reps", e.target.value)} /></label>
      <label>Отдых, секунды<input type="number" min={15} max={300} required value={item.restSeconds} onChange={e => change(index, "restSeconds", Number(e.target.value))} /></label>
      <label>Техника<input maxLength={300} value={item.notes} onChange={e => change(index, "notes", e.target.value)} /></label>
    </div><button type="button" className={styles.textButton} disabled={items.length === 1} onClick={() => setItems(current => current.filter((_, i) => i !== index))}>Убрать упражнение</button></fieldset>)}
    <div className={styles.actions}><button type="button" className={styles.secondaryButton} disabled={items.length >= 12} onClick={() => setItems(current => [...current, { id: "", name: "", muscleGroup: "", equipment: "Без оборудования", metric: "reps", sets: 2, reps: "8–12", restSeconds: 60, notes: "" }])}>Добавить упражнение</button><button className={styles.startButton} disabled={busy}>{busy ? "Сохраняем…" : "Сохранить изменения"}</button></div>
  </form></section>;
}
