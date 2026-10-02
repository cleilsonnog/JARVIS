// ===== Versículo do dia (server side, for the morning briefing) =====
// Same list and same rule as public/js/verses.js, using the São Paulo calendar date.
const path = require("path");
const { verses } = require(path.join(__dirname, "..", "public", "data", "verses.json"));

function verseOfTheDay(date = new Date()) {
  const [y, m, d] = date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-").map(Number);
  const dayOfYear = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  return verses[dayOfYear % verses.length];
}

module.exports = { verseOfTheDay };
