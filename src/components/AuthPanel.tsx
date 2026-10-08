"use client";
import { useState, type FormEvent } from "react";
import { request } from "@/lib/client";
import styles from "@/app/page.module.css";
type Mode = "signin" | "signup" | "forgot" | "reset";
export function AuthPanel({ onAuthenticated, reset = false }: { onAuthenticated: () => void; reset?: boolean }) {
  const [mode, setMode] = useState<Mode>(reset ? "reset" : "signin");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage("");
    try {
      const data = await request<{ ok?: boolean; message?: string }>("/api/auth", "POST", { mode, ...(mode !== "reset" ? { email } : {}), ...(mode !== "forgot" ? { password } : {}), ...(mode === "signup" ? { name } : {}) });
      if (data.ok) onAuthenticated(); else setMessage(data.message || "Проверьте почту.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка входа."); }
    finally { setBusy(false); }
  }
  return <main className={styles.authShell}><section className={styles.authCard}><div className={styles.brand}><span className={styles.brandMark}>↗</span>Forma</div><p className={styles.eyebrow}>ПЕРСОНАЛЬНЫЙ ДНЕВНИК ТРЕНИРОВОК</p><h1>{mode === "signup" ? "Создайте аккаунт" : mode === "forgot" ? "Восстановить доступ" : mode === "reset" ? "Новый пароль" : "Вернитесь к своему прогрессу"}</h1><p className={styles.subtitle}>Ваша программа, результаты и рекомендации — в одном месте.</p><form className={styles.stack} onSubmit={submit}>
    {mode === "signup" && <label>Имя<input autoComplete="given-name" required maxLength={60} value={name} onChange={e => setName(e.target.value)} /></label>}
    {mode !== "reset" && <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
    {mode !== "forgot" && <label>Пароль<input type="password" minLength={8} maxLength={128} autoComplete={mode === "signin" ? "current-password" : "new-password"} required value={password} onChange={e => setPassword(e.target.value)} /></label>}
    <button className={styles.startButton} disabled={busy}>{busy ? "Подождите…" : mode === "signup" ? "Зарегистрироваться" : mode === "forgot" ? "Отправить ссылку" : mode === "reset" ? "Сохранить пароль" : "Войти"}</button>
  </form>{message && <p className={styles.notice} role="status">{message}</p>}
  {!reset && <div className={styles.actions}>{(["signin", "signup", "forgot"] as Mode[]).filter(value => value !== mode).map(value => <button className={styles.textButton} key={value} onClick={() => { setMode(value); setMessage(""); }}>{value === "signin" ? "Уже есть аккаунт" : value === "signup" ? "Создать аккаунт" : "Забыли пароль?"}</button>)}</div>}
  </section></main>;
}
