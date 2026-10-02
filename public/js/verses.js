// ===== Versículo do dia (NVI) =====
// The list lives in /data/verses.json (shared with the server's morning briefing).
// Review/edit it there: { ref, text }.

const data = await fetch("/data/verses.json").then((r) => r.json()).catch(() => ({ verses: [] }));
export const VERSES = data.verses;

// Same verse all day (local date), changes at midnight. Keep in sync with src/verses.js.
export function verseOfTheDay(date = new Date()) {
  if (VERSES.length === 0) return { ref: "", text: "" };
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - start) / 86400000);
  return VERSES[dayOfYear % VERSES.length];
}
