// ===== Sidebar: navigation; the chat history only opens from "Chat" =====
import { createMessageEl, setHasMessages } from "./chat.js";
import { renderDashboard } from "./dashboard.js";
import { openPage, closePage } from "./pages.js";

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const toggleSidebarBtn = document.getElementById("toggle-sidebar");
const closeSidebarBtn = document.getElementById("close-sidebar");
const newChatBtn = document.getElementById("new-chat-btn");
const conversationList = document.getElementById("conversation-list");
const chatNav = sidebar.querySelector('[data-nav="chat"]');
const chatHistory = document.getElementById("chat-history");
const IS_TOUCH = window.matchMedia("(pointer: coarse)").matches;

let sessionId = crypto.randomUUID();

export function getSessionId() { return sessionId; }
export function setSessionId(id) { sessionId = id; }

function openSidebar() {
  sidebar.classList.remove("sidebar-closed");
  sidebarOverlay.classList.add("active");
}

function closeSidebar() {
  sidebar.classList.add("sidebar-closed");
  sidebarOverlay.classList.remove("active");
}

toggleSidebarBtn.addEventListener("click", () => {
  if (sidebar.classList.contains("sidebar-closed")) openSidebar();
  else closeSidebar();
});

closeSidebarBtn.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSidebar();
});

// ----- Navigation -----
// Highlights where the user is: "painel" (dashboard), "chat" (a conversation) or a screen
function setActive(view) {
  sidebar.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("is-active", el.dataset.nav === view));
}
window.addEventListener("jarvis:view", (e) => setActive(e.detail));

function toggleHistory(open = chatHistory.classList.contains("hidden")) {
  chatHistory.classList.toggle("hidden", !open);
  chatNav.setAttribute("aria-expanded", String(open));
  if (open) loadConversations();
}

sidebar.querySelector("nav").addEventListener("click", (e) => {
  const item = e.target.closest(".nav-item");
  if (!item) return;
  const view = item.dataset.nav;
  if (view === "chat") return toggleHistory();
  if (view === "painel") return startNewChat();
  if (view === "lembretes") {
    // The agenda lives in the header bell; stop the click here so its outside-click handler doesn't close it
    e.stopPropagation();
    closeSidebar();
    document.getElementById("agenda-btn").click();
    return;
  }
  openPage(view);
  closeSidebar();
});

// ----- Conversation history -----
export async function loadConversations() {
  // Only rendered while the history is open; it's reloaded each time it opens
  if (chatHistory.classList.contains("hidden")) return;
  const res = await fetch("/api/conversations");
  const conversations = await res.json();
  conversationList.innerHTML = conversations.length
    ? ""
    : `<p class="px-3 py-2 text-[11px] text-gray-600">Nenhuma conversa ainda.</p>`;

  conversations.forEach((conv) => {
    const div = document.createElement("div");
    const isActive = conv.id === sessionId;
    div.className = `conv-item group ${isActive ? "is-active" : ""}`;
    div.innerHTML = `
      <span class="text-xs truncate flex-1"></span>
      <button class="delete-conv opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 transition-all" title="Apagar conversa">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>`;
    div.querySelector("span").textContent = conv.title;

    div.addEventListener("click", (e) => {
      if (e.target.closest(".delete-conv")) return;
      loadConversation(conv.id);
    });

    div.querySelector(".delete-conv").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Apagar a conversa "${conv.title}"?`)) return;
      await fetch(`/api/conversations/${conv.id}`, { method: "DELETE" });
      if (conv.id === sessionId) startNewChat({ keepSidebar: true });
      else loadConversations();
    });

    conversationList.appendChild(div);
  });
}

async function loadConversation(id) {
  sessionId = id;
  setHasMessages(true);
  closePage();

  const res = await fetch(`/api/conversations/${id}/messages`);
  const messages = await res.json();

  chat.innerHTML = "";
  messages.forEach((msg) => {
    createMessageEl(msg.role === "assistant" ? "assistant" : "user", msg.content);
  });

  setActive("chat");
  closeSidebar();
  loadConversations();
  if (!IS_TOUCH) input.focus();
}

export function startNewChat({ keepSidebar = false } = {}) {
  sessionId = crypto.randomUUID();
  setHasMessages(false);
  closePage();
  renderDashboard();
  setActive("painel");
  if (!keepSidebar) closeSidebar();
  loadConversations();
  if (!IS_TOUCH) input.focus();
}

newChatBtn.addEventListener("click", () => startNewChat());

// A message sent from the dashboard starts a conversation
window.addEventListener("jarvis:reply-done", () => {
  if (!document.getElementById("welcome") && document.getElementById("page-view").classList.contains("hidden")) setActive("chat");
});

setActive("painel");
