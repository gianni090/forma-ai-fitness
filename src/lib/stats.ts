export type StatSession = { finishedAt?: string; cancelledAt?: string; sets: Array<{ reps: number; weight: number; durationSeconds?: number | null }> };
export function computeStats(sessions: StatSession[], now = new Date(), timeZone = "Europe/Moscow") {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const dateKey = (date: Date) => { const parts = formatter.formatToParts(date); const part = (name: string) => parts.find(p => p.type === name)!.value; return `${part("year")}-${part("month")}-${part("day")}`; };
  const todayKey = dateKey(now);
  const today = new Date(`${todayKey}T00:00:00Z`);
  const start = new Date(today); start.setUTCDate(start.getUTCDate() - 6);
  const days = Array.from({ length: 7 }, (_, i) => { const date = new Date(start); date.setUTCDate(date.getUTCDate() + i); return { date: date.toISOString().slice(0, 10), count: 0, volume: 0 }; });
  const completed = sessions.filter(session => session.finishedAt && !session.cancelledAt);
  let monthCount = 0, weekCount = 0, weekVolume = 0;
  for (const session of completed) {
    const date = new Date(session.finishedAt!);
    if (dateKey(date).slice(0, 7) === todayKey.slice(0, 7)) monthCount++;
    const day = days.find(day => day.date === dateKey(date));
    if (day) { const volume = session.sets.reduce((sum, set) => sum + (set.durationSeconds ? 0 : set.reps * set.weight), 0); day.count++; day.volume += volume; weekCount++; weekVolume += volume; }
  }
  return { monthCount, weekCount, weekVolume, days };
}
