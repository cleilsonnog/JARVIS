// ===== Chat UI helpers =====
const chat = document.getElementById("chat");

let hasMessages = false;

export function getHasMessages() { return hasMessages; }
export function setHasMessages(val) { hasMessages = val; }

export function hideWelcome() {
  const w = document.getElementById("welcome");
  if (w) { w.remove(); hasMessages = true; }
}

export function createMessageEl(role, content) {
  const wrapper = document.createElement("div");
  wrapper.className = `flex ${role === "user" ? "justify-end" : "justify-start"} animate-fade-in`;

  const bubble = document.createElement("div");
  const maxW = "max-w-[80%]";

  if (role === "user") {
    bubble.className = `${maxW} px-4 py-3 rounded-2xl rounded-br-md bg-jarvis-500/10 border border-jarvis-500/20 text-sm leading-relaxed`;
    bubble.textContent = content;
  } else {
    bubble.className = `${maxW} px-4 py-3 rounded-2xl rounded-bl-md bg-white/[0.03] border border-white/5 text-sm leading-relaxed prose-jarvis`;
    bubble.innerHTML = content ? marked.parse(content) : "";
  }

  wrapper.appendChild(bubble);
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}

export function showTyping() {
  const wrapper = document.createElement("div");
  wrapper.className = "flex justify-start animate-fade-in";
  wrapper.id = "typing";
  wrapper.innerHTML = `
    <div class="px-4 py-3 rounded-2xl rounded-bl-md bg-white/[0.03] border border-white/5 flex items-center gap-1.5">
      <span class="w-1.5 h-1.5 rounded-full bg-jarvis-400 animate-typing-1"></span>
      <span class="w-1.5 h-1.5 rounded-full bg-jarvis-400 animate-typing-2"></span>
      <span class="w-1.5 h-1.5 rounded-full bg-jarvis-400 animate-typing-3"></span>
    </div>`;
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
}

export function hideTyping() {
  const el = document.getElementById("typing");
  if (el) el.remove();
}

export function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}
