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
  }
});

document.addEventListener(
  "click",
  function unlockTts() {
    const unlock = new SpeechSynthesisUtterance("");
    unlock.volume = 0;
    speechSynthesis.speak(unlock);
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

export function stopSpeaking() {
  generation++;
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

export function speak(text) {
  if (!ttsEnabled || !text) return;
  stopSpeaking();
  if (!bestVoice) loadBestVoice();

  const clean = text
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

  const chunks = chunkText(clean);
  const gen = generation;
  // Keep references: Chrome can garbage-collect a pending utterance and never fire onend
  const utterances = [];
  setSpeaking(true);
  if (onSpeakStart) onSpeakStart();

  function finish() {
    if (gen !== generation) return;
    setSpeaking(false);
    if (onSpeakEnd) onSpeakEnd();
  }

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
