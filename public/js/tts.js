// ===== TTS (Web Speech API) =====
let ttsEnabled = true;
let bestVoice = null;
let onSpeakStart = null;
let onSpeakEnd = null;

const ttsBtn = document.getElementById("tts-btn");
const ttsWaves = document.getElementById("tts-waves");

export function isTtsEnabled() { return ttsEnabled; }
export function setOnSpeakStart(fn) { onSpeakStart = fn; }
export function setOnSpeakEnd(fn) { onSpeakEnd = fn; }

function loadBestVoice() {
  const voices = speechSynthesis.getVoices();
  bestVoice =
    voices.find((v) => v.lang === "pt-BR" && v.name.includes("Google")) ||
    voices.find((v) => v.lang === "pt-BR") ||
    voices.find((v) => v.lang.startsWith("pt"));
  if (bestVoice) console.log("Voz selecionada:", bestVoice.name);
}

speechSynthesis.onvoiceschanged = loadBestVoice;
loadBestVoice();

function updateTtsIcon() {
  if (ttsEnabled) {
    ttsWaves.style.display = "";
    ttsBtn.classList.remove("text-gray-600");
    ttsBtn.classList.add("text-jarvis-400", "border-jarvis-500/30");
  } else {
    ttsWaves.style.display = "none";
    ttsBtn.classList.remove("text-jarvis-400", "border-jarvis-500/30");
    ttsBtn.classList.add("text-gray-600");
  }
}

updateTtsIcon();

ttsBtn.addEventListener("click", () => {
  ttsEnabled = !ttsEnabled;
  updateTtsIcon();
  if (!ttsEnabled) {
    stopSpeaking();
  } else {
    const unlock = new SpeechSynthesisUtterance("");
    unlock.volume = 0;
    speechSynthesis.speak(unlock);
    getAudioContext()?.resume().catch(() => {});
  }
});

document.addEventListener(
  "click",
  function unlockTts() {
    const unlock = new SpeechSynthesisUtterance("");
    unlock.volume = 0;
    speechSynthesis.speak(unlock);
    getAudioContext()?.resume().catch(() => {});
    document.removeEventListener("click", unlockTts);
  },
  { once: true }
);

// Reading state for the whole reply (true across gaps between chunks), used by STT
// to keep the mic off until JARVIS has finished talking.
let speaking = false;
let generation = 0; // bumped on every speak/stop so callbacks from an old reply are ignored
const MAX_CHUNK = 180;

export function isSpeaking() { return speaking; }

// Exposed on <body> so visuals (core.js) can react without importing this module
function setSpeaking(on) {
  speaking = on;
  if (on) document.body.dataset.speaking = "1";
  else delete document.body.dataset.speaking;
}

// ----- Server voice (Gemini TTS, streamed PCM played with Web Audio) -----
const SAMPLE_RATE = 24000;
const MIN_CHUNK_BYTES = SAMPLE_RATE * 2 / 4; // schedule audio in ~0.25s pieces
let audioCtx = null;
let activeSources = [];
let ttsAbort = null;
let serverVoiceBlockedUntil = 0; // after a quota/disabled error, use the browser voice for a while

function getAudioContext() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  return audioCtx;
}

function stopServerAudio() {
  ttsAbort?.abort();
  ttsAbort = null;
  activeSources.forEach((src) => { try { src.stop(); } catch {} });
  activeSources = [];
}

// Plays `text` with the server voice. Resolves when playback ends; rejects (so the caller can
// fall back to the browser voice) only if nothing could be played.
async function speakServer(text, gen) {
  if (Date.now() < serverVoiceBlockedUntil) throw new Error("server voice paused");
  const ctx = getAudioContext();
  if (!ctx) throw new Error("no Web Audio");
  if (ctx.state !== "running") await ctx.resume().catch(() => {});
  if (ctx.state !== "running") throw new Error("audio locked (no user gesture yet)");

  ttsAbort = new AbortController();
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: ttsAbort.signal,
  });
  if (!res.ok) {
    if (res.status === 429) serverVoiceBlockedUntil = Date.now() + 15 * 60 * 1000;
    if (res.status === 501) serverVoiceBlockedUntil = Infinity;
    throw new Error(`TTS ${res.status}`);
  }

  let nextTime = ctx.currentTime + 0.08;
  let pending = new Uint8Array(0);
  let scheduled = 0;
  let lastSource = null;

  const schedule = (bytes) => {
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    nextTime = Math.max(nextTime, ctx.currentTime + 0.02);
    src.start(nextTime);
    nextTime += buffer.duration;
    activeSources.push(src);
    src.onended = () => { activeSources = activeSources.filter((s) => s !== src); };
    lastSource = src;
    scheduled++;
  };

  const flush = (final) => {
    // Only whole 16-bit samples; keep an odd trailing byte for the next network chunk
    while (pending.length >= MIN_CHUNK_BYTES || (final && pending.length >= 2)) {
      const take = Math.min(pending.length, Math.max(MIN_CHUNK_BYTES, final ? pending.length : 0)) & ~1;
      schedule(pending.slice(0, take));
      pending = pending.slice(take);
    }
  };

  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (gen !== generation) return;
      if (done) break;
      const merged = new Uint8Array(pending.length + value.length);
      merged.set(pending);
      merged.set(value, pending.length);
      pending = merged;
      flush(false);
    }
    flush(true);
  } catch (err) {
    if (gen !== generation) return;
    if (scheduled === 0) throw err; // nothing played: let the browser voice take over
  }

  if (scheduled === 0) throw new Error("TTS sem áudio");
  // Resolve when the last scheduled piece finishes
  await new Promise((resolve) => {
    lastSource.addEventListener("ended", resolve, { once: true });
  });
}

export function stopSpeaking() {
  generation++;
  stopServerAudio();
  speechSynthesis.cancel();
  if (speaking) {
    setSpeaking(false);
    if (onSpeakEnd) onSpeakEnd();
  }
}

// Split text into chunks of at most MAX_CHUNK chars, preferring sentence, then comma, then word boundaries
function chunkText(text) {
  const sentences = text.match(/[^.!?:;]+[.!?:;]+|[^.!?:;]+$/g) || [text];
  const pieces = [];
  for (const s of sentences) {
    if (s.length <= MAX_CHUNK) { pieces.push(s); continue; }
    let rest = s;
    while (rest.length > MAX_CHUNK) {
      let cut = rest.lastIndexOf(",", MAX_CHUNK);
      if (cut < MAX_CHUNK / 2) cut = rest.lastIndexOf(" ", MAX_CHUNK);
      if (cut <= 0) cut = MAX_CHUNK;
      pieces.push(rest.slice(0, cut + 1));
      rest = rest.slice(cut + 1);
    }
    if (rest.trim()) pieces.push(rest);
  }

  const chunks = [];
  let current = "";
  for (const p of pieces) {
    if ((current + p).length > MAX_CHUNK) {
      if (current.trim()) chunks.push(current.trim());
      current = p;
    } else {
      current += p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// "R$ 1.810,35" -> "1810 reais e 35 centavos"; "R$ 0,00" -> "0 reais"; "R$ 1,00" -> "1 real"
// (voices read "R$" as "real" with no agreement: "zero real")
export function speakableMoney(text) {
  return text.replace(/(-\s*)?R\$\s*(-\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g, (m, neg1, neg2, int, cents) => {
    const n = parseInt(int.replace(/\./g, ""), 10);
    const c = cents ? parseInt(cents.padEnd(2, "0"), 10) : 0;
    const reais = `${n} ${n === 1 ? "real" : "reais"}`;
    const centavos = `${c} ${c === 1 ? "centavo" : "centavos"}`;
    const spoken = c === 0 ? reais : n === 0 ? centavos : `${reais} e ${centavos}`;
    return (neg1 || neg2 ? "menos " : "") + spoken;
  });
}

export function speak(text) {
  if (!ttsEnabled || !text) return;
  stopSpeaking();

  const clean = speakableMoney(text)
    .replace(/```[\s\S]*?```/g, ". bloco de código omitido. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[|_~>-]{2,}/g, " ")
    .replace(/\n{2,}/g, ". ")
    .trim();

  if (!clean) return;

  const gen = generation;
  setSpeaking(true);
  if (onSpeakStart) onSpeakStart();

  const finish = () => {
    if (gen !== generation) return;
    setSpeaking(false);
    if (onSpeakEnd) onSpeakEnd();
  };

  speakServer(clean, gen)
    .then(finish)
    .catch((err) => {
      if (gen !== generation) return;
      console.warn("Voz do servidor indisponível, usando a do navegador:", err.message);
      speakBrowser(clean, gen, finish);
    });
}

// Browser voice (Web Speech API), chunked to dodge Chrome's long-utterance bugs
function speakBrowser(clean, gen, finish) {
  if (!bestVoice) loadBestVoice();
  const chunks = chunkText(clean);
  // Keep references: Chrome can garbage-collect a pending utterance and never fire onend
  const utterances = [];

  function speakChunk(index) {
    if (gen !== generation) return;
    if (index >= chunks.length) return finish();

    let advanced = false;
    const next = () => {
      if (advanced) return;
      advanced = true;
      clearInterval(watchdog);
      speakChunk(index + 1);
    };

    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    utterances.push(utterance);
    utterance.lang = "pt-BR";
    utterance.rate = 1.0;
    utterance.pitch = 0.8;
    utterance.volume = 1.0;
    if (bestVoice) utterance.voice = bestVoice;
    utterance.onend = next;
    utterance.onerror = (e) => {
      // "interrupted"/"canceled" means someone stopped us: don't continue the old reply
      if (e.error === "interrupted" || e.error === "canceled") return;
      next();
    };

    // Some Android voices never fire onend; move on once the engine has gone idle
    // (also skips a chunk the engine never starts, e.g. audio blocked, so we never hang)
    let started = false;
    let ticks = 0;
    const watchdog = setInterval(() => {
      if (gen !== generation) return clearInterval(watchdog);
      ticks++;
      if (speechSynthesis.speaking || speechSynthesis.pending) started = true;
      else if (started || ticks > 6) next();
    }, 700);

    speechSynthesis.speak(utterance);
  }

  speakChunk(0);
}
