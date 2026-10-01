// ===== STT (Speech-to-Text) - Wake Word "JARVIS" =====
import { isSpeaking, stopSpeaking } from "./tts.js";

const micBtn = document.getElementById("mic-btn");
const input = document.getElementById("input");
const form = document.getElementById("input-form");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

// Modes: "off" | "wake" (listening for wake word) | "active" (capturing command) | "waiting" (JARVIS answering)
let mode = "off";
const WAKE_WORDS = ["jarvis", "járvis", "jarves", "jarvs", "javis"];

function containsWakeWord(text) {
  const lower = text.toLowerCase().trim();
  return WAKE_WORDS.some((w) => lower.includes(w));
}

// ===== Visual states =====
function setMicWake() {
  micBtn.classList.remove(
    "bg-red-500/20", "border-red-500/50", "text-red-400",
    "text-gray-400", "border-white/10"
  );
  micBtn.classList.add("bg-emerald-500/20", "border-emerald-500/50", "text-emerald-400");
  micBtn.title = "Ouvindo... diga \"JARVIS\" (clique para desativar)";
}

function setMicActive() {
  micBtn.classList.remove(
    "bg-emerald-500/20", "border-emerald-500/50", "text-emerald-400",
    "text-gray-400", "border-white/10"
  );
  micBtn.classList.add("bg-red-500/20", "border-red-500/50", "text-red-400");
  micBtn.title = "Escutando comando...";
}

function setMicOff() {
  micBtn.classList.remove(
    "bg-red-500/20", "border-red-500/50", "text-red-400",
    "bg-emerald-500/20", "border-emerald-500/50", "text-emerald-400"
  );
  micBtn.classList.add("text-gray-400", "border-white/10");
  micBtn.title = "Clique para ativar escuta por voz";
}

// ===== Recognition setup =====
// Android Chrome ignores `continuous` and ends the session at every short pause, so speech is
// accumulated across sessions and only sent after SILENCE_MS without new words.
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const SILENCE_MS = IS_MOBILE ? 2000 : 1500;
const ACTIVE_TIMEOUT_MS = 10000; // back to wake-word mode if nothing is said after "JARVIS"
const MAX_REPLY_WAIT_MS = 180000;

let committed = "";   // text from sessions that already ended
let sessionText = ""; // text of the current session (final + interim)
let silenceTimer = null;
let activeTimer = null;

function heardText() {
  return `${committed} ${sessionText}`.replace(/\s+/g, " ").trim();
}

function resetBuffer() {
  committed = "";
  sessionText = "";
  clearTimeout(silenceTimer);
  clearTimeout(activeTimer);
}

// Command = what was said after the last wake word (ignores chatter before "JARVIS")
function commandFrom(text) {
  const lower = text.toLowerCase();
  let cut = -1;
  for (const w of WAKE_WORDS) {
    const i = lower.lastIndexOf(w);
    if (i >= 0 && i + w.length > cut) cut = i + w.length;
  }
  const rest = cut >= 0 ? text.slice(cut) : text;
  return rest.replace(/^[\s,.:!?]+/, "").trim();
}

function armActiveTimeout() {
  clearTimeout(activeTimer);
  activeTimer = setTimeout(() => {
    if (mode !== "active") return;
    resetBuffer();
    input.value = "";
    mode = "wake";
    setMicWake();
  }, ACTIVE_TIMEOUT_MS);
}

function armSilence() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    if (mode !== "active") return;
    const command = commandFrom(heardText());
    // Only "JARVIS" so far: keep listening for the command
    if (command.length > 2) sendCommand(command);
  }, SILENCE_MS);
}

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "pt-BR";
  recognition.interimResults = true;
  recognition.continuous = !IS_MOBILE;

  recognition.onstart = () => {
    isListening = true;
    if (mode === "wake") setMicWake();
    else if (mode === "active") setMicActive();
  };

  recognition.onend = () => {
    isListening = false;
    // Keep what this session heard while a command is in progress; drop idle chatter in wake mode
    committed = mode === "active" ? heardText() : "";
    sessionText = "";
    if (mode === "wake" || mode === "active") {
      setTimeout(() => {
        if (mode === "wake" || mode === "active") startRecognition();
      }, IS_MOBILE ? 100 : 300);
    } else if (mode === "off") {
      setMicOff();
    }
  };

  recognition.onresult = (event) => {
    if (mode !== "wake" && mode !== "active") return;

    let text = "";
    for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
    sessionText = text;
    const heard = heardText();

    if (mode === "wake") {
      if (!containsWakeWord(heard)) return;
      mode = "active";
      setMicActive();
    }

    // Show what the user is saying
    const display = commandFrom(heard);
    input.value = display;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 144) + "px";

    armActiveTimeout();
    armSilence();
  };

  recognition.onerror = (event) => {
    if (event.error === "no-speech" || event.error === "aborted") return;
    console.error("Erro STT:", event.error);
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      mode = "off";
      resetBuffer();
      setMicOff();
      alert("Permissão de microfone negada. Libere o microfone para este site nas configurações do navegador.");
    }
  };
}

function startRecognition() {
  if (!recognition || isListening) return;
  try { recognition.start(); }
  catch (e) { /* already started */ }
}

function sendCommand(text) {
  // "waiting": mic stays off while JARVIS answers (on phones an open mic cuts the TTS audio)
  mode = "waiting";
  resetBuffer();
  if (isListening) recognition.abort();

  input.value = text;
  form.dispatchEvent(new Event("submit"));

  waitForReply(() => {
    if (mode !== "waiting") return; // user turned the mic off meanwhile
    mode = "wake";
    setMicWake();
    startRecognition();
  });
}

// Resume listening only after the reply has arrived (app.js fires "jarvis:reply-done")
// and the TTS has finished reading all of it
function waitForReply(callback) {
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    clearTimeout(safety);
    setTimeout(callback, 600);
  };
  const safety = setTimeout(done, MAX_REPLY_WAIT_MS);

  window.addEventListener("jarvis:reply-done", () => {
    const check = setInterval(() => {
      if (!isSpeaking()) {
        clearInterval(check);
        done();
      }
    }, 300);
  }, { once: true });
}

// ===== Mic button: toggle wake word mode =====
micBtn.addEventListener("click", () => {
  if (!recognition) {
    alert("Navegador não suporta reconhecimento de voz. Use Chrome ou Edge.");
    return;
  }

  if (mode !== "off") {
    // Turn off
    mode = "off";
    resetBuffer();
    if (isListening) recognition.abort();
    setMicOff();
  } else {
    // Activate wake word mode
    mode = "wake";
    resetBuffer();
    stopSpeaking();
    setMicWake();
    startRecognition();
  }
});
