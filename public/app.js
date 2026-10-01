// ===== JARVIS - Main Entry Point =====
import { speak, stopSpeaking, setOnSpeakStart, setOnSpeakEnd } from "./js/tts.js";
import { createMessageEl, hideWelcome, showTyping, hideTyping, scrollToBottom } from "./js/chat.js";
import { getSessionId, loadConversations, startNewChat } from "./js/sidebar.js";
import { getPendingFile, clearPendingFile } from "./js/upload.js";
import { handleSlashCommand, getCommandSuggestions } from "./js/commands.js";
import { isCameraOn, cameraIntent, captureFrame, closeCamera } from "./js/camera.js";
import "./js/stt.js";
import "./js/theme.js";
import "./js/reminders.js";
import "./js/dashboard.js";

const form = document.getElementById("input-form");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const voiceIndicator = document.getElementById("voice-indicator");
const voiceShowTextBtn = document.getElementById("voice-show-text");
const chatEl = document.getElementById("chat");

let currentBubbleWrapper = null;
const IS_TOUCH = window.matchMedia("(pointer: coarse)").matches;

// ===== JARVIS logo -> dashboard =====
document.getElementById("jarvis-home").addEventListener("click", () => {
  stopSpeaking();
  hideVoiceIndicator();
  currentBubbleWrapper = null;
  startNewChat();
});

// ===== Voice indicator controls =====
function showVoiceIndicator() {
  document.body.classList.add("voice-view");
  voiceIndicator.classList.remove("hidden");
  voiceIndicator.classList.add("flex");
  chatEl.classList.add("hidden");
}

function hideVoiceIndicator() {
  document.body.classList.remove("voice-view");
  voiceIndicator.classList.add("hidden");
  voiceIndicator.classList.remove("flex");
  chatEl.classList.remove("hidden");
  // Only conversations jump to the latest message; the dashboard keeps its scroll position
  if (!document.getElementById("welcome")) scrollToBottom();
}

setOnSpeakStart(() => {
  if (currentBubbleWrapper) {
    showVoiceIndicator();
  }
});

setOnSpeakEnd(() => {
  hideVoiceIndicator();
  currentBubbleWrapper = null;
});

voiceShowTextBtn.addEventListener("click", () => {
  hideVoiceIndicator();
  stopSpeaking();
  currentBubbleWrapper = null;
});

// ===== Autocomplete for slash commands =====
const autocompleteEl = document.createElement("div");
autocompleteEl.id = "cmd-autocomplete";
autocompleteEl.className = "hidden absolute bottom-full left-0 right-0 mb-1 rounded-xl border border-white/10 bg-dark-300/95 backdrop-blur-sm overflow-hidden z-50";
form.style.position = "relative";
form.appendChild(autocompleteEl);

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 144) + "px";

  const text = input.value.trim();
  const suggestions = getCommandSuggestions(text);

  if (suggestions.length > 0 && text.length > 0) {
    autocompleteEl.innerHTML = suggestions.map((s) =>
      `<button type="button" class="cmd-suggestion w-full text-left px-4 py-2 hover:bg-jarvis-500/10 transition-colors flex items-center gap-3" data-cmd="${s.cmd}">
        <code class="text-jarvis-400 text-xs">${s.cmd}</code>
        <span class="text-xs text-gray-500">${s.description}</span>
      </button>`
    ).join("");
    autocompleteEl.classList.remove("hidden");

    autocompleteEl.querySelectorAll(".cmd-suggestion").forEach((btn) => {
      btn.addEventListener("click", () => {
        input.value = btn.dataset.cmd + " ";
        autocompleteEl.classList.add("hidden");
        input.focus();
      });
    });
  } else {
    autocompleteEl.classList.add("hidden");
  }
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    autocompleteEl.classList.add("hidden");
    form.dispatchEvent(new Event("submit"));
  }
  if (e.key === "Escape") {
    autocompleteEl.classList.add("hidden");
  }
});

// ===== Submit =====
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  autocompleteEl.classList.add("hidden");

  let message = input.value.trim();
  const pendingFile = getPendingFile();
  if (!message && !pendingFile) return;

  // Check for slash commands
  if (message.startsWith("/") && !pendingFile) {
    const result = handleSlashCommand(message);
    if (result.handled) {
      input.value = "";
      input.style.height = "auto";
      replyDone();
      return;
    }
    if (result.forward) {
      // Forward to AI as a normal message
      message = result.forward;
    }
  }

  let imageData = null;

  // Camera: "fecha a câmera" is handled locally; with the camera on (or "o que você vê?") send a frame
  if (!pendingFile) {
    const intent = cameraIntent(message);
    if (intent === "close") {
      closeCamera();
      hideWelcome();
      createMessageEl("user", message);
      createMessageEl("assistant", "Câmera desligada.");
      speak("Câmera desligada.");
      input.value = "";
      input.style.height = "auto";
      replyDone();
      return;
    }
    if (isCameraOn() || intent === "look") {
      try {
        imageData = await captureFrame();
      } catch (err) {
        hideWelcome();
        createMessageEl("user", message);
        createMessageEl("assistant", err.message);
        speak(err.message);
        input.value = "";
        input.style.height = "auto";
        replyDone();
        return;
      }
    }
  }

  if (pendingFile) {
    if (pendingFile.type === "image") {
      imageData = { base64: pendingFile.base64, mimeType: pendingFile.mimeType };
      message = message || "O que você vê nesta imagem?";
    } else {
      message = `[Documento anexado: ${pendingFile.filename}]\n\n${pendingFile.content}\n\n${message || "Analise este documento."}`;
    }
    clearPendingFile();
    const fb = document.getElementById("file-badge");
    if (fb) fb.remove();
  }

  stopSpeaking();
  hideWelcome();

  const userDisplay = input.value.trim() || (imageData ? "Analise esta imagem." : message.slice(0, 100));
  if (imageData) {
    createImageMessage(imageData, userDisplay);
  } else {
    createMessageEl("user", userDisplay);
  }

  input.value = "";
  input.style.height = "auto";
  input.placeholder = "Mensagem para JARVIS...";
  sendBtn.disabled = true;
  showTyping();
  document.body.dataset.thinking = "1";

  try {
    const body = { message, sessionId: getSessionId() };
    if (imageData) body.image = imageData;

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    hideTyping();
    // Session expired (e.g. server restarted after a deploy): log in again
    if (res.status === 401) {
      location.href = "/login.html";
      return;
    }
    if (!res.ok) throw new Error("Erro na API");

    const bubble = createMessageEl("assistant", "");
    currentBubbleWrapper = bubble.parentElement;
    let fullText = "";

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let pending = ""; // incomplete line carried over to the next network chunk

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // stream: true keeps multi-byte chars (accents) intact when split across chunks
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop();

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              fullText += parsed.text;
              bubble.innerHTML = marked.parse(fullText);
              if (!voiceIndicator.classList.contains("flex")) {
                scrollToBottom();
              }
            }
            if (parsed.toolCall) {
              const tc = parsed.toolCall;
              const toolNames = {
                execute_command: "Terminal",
                open_application: "Abrindo app",
                read_file: "Lendo arquivo",
                write_file: "Escrevendo arquivo",
                list_files: "Listando arquivos",
                create_reminder: "Lembrete criado",
                list_reminders: "Lembretes",
                save_memory: "Memorizado",
                recall_memories: "Lembrando",
                delete_memory: "Esquecido",
                consultar_financas: "Consultando FinPlan",
              };
              const label = toolNames[tc.name] || tc.name;
              const detail = tc.args.command || tc.args.app_name || tc.args.file_path || tc.args.key || tc.args.directory || "";
              const badge = document.createElement("div");
              badge.className = "my-2 flex items-center gap-1.5 text-[11px] text-amber-400/80 px-2.5 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10";
              badge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 17l6-6-6-6"/><path d="M12 19h8"/></svg> <span class="font-medium">${label}:</span> <code class="text-amber-300/70">${detail}</code>`;
              bubble.appendChild(badge);
              if (!voiceIndicator.classList.contains("flex")) {
                scrollToBottom();
              }
            }
            if (parsed.searchQueries) {
              const badge = document.createElement("div");
              badge.className = "mt-2 flex items-center gap-1.5 text-[11px] text-jarvis-500/70";
              badge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Pesquisou: ${parsed.searchQueries.map((q) => `<span class="px-1.5 py-0.5 rounded bg-jarvis-500/10">${q}</span>`).join(" ")}`;
              bubble.appendChild(badge);
            }
          } catch {}
        }
      }
    }

    speak(fullText);
    loadConversations();
  } catch (err) {
    hideTyping();
    createMessageEl("assistant", "Desculpe, ocorreu um erro. Tente novamente.");
    console.error(err);
  }

  sendBtn.disabled = false;
  delete document.body.dataset.thinking;
  replyDone();
  // On phones focusing the input pops the keyboard over the voice UI
  if (!IS_TOUCH) input.focus();
});

// Tells the voice module (stt.js) the reply is complete so it can wait for TTS and reopen the mic
function replyDone() {
  window.dispatchEvent(new Event("jarvis:reply-done"));
}

// ===== Image message helper =====
function createImageMessage(imageData, text) {
  const wrapper = document.createElement("div");
  wrapper.className = "flex justify-end animate-fade-in";

  const bubble = document.createElement("div");
  bubble.className = "max-w-[80%] px-4 py-3 rounded-2xl rounded-br-md bg-jarvis-500/10 border border-jarvis-500/20 text-sm leading-relaxed";
  bubble.innerHTML = `
    <img src="data:${imageData.mimeType};base64,${imageData.base64}" class="max-w-[240px] rounded-lg border border-white/10 mb-2"/>
    <p>${text}</p>`;

  wrapper.appendChild(bubble);
  chatEl.appendChild(wrapper);
  chatEl.scrollTop = chatEl.scrollHeight;
}
