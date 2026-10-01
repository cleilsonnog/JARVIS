// ===== Sidebar =====
import { createMessageEl, setHasMessages } from "./chat.js";
import { renderDashboard } from "./dashboard.js";

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const toggleSidebarBtn = document.getElementById("toggle-sidebar");
const closeSidebarBtn = document.getElementById("close-sidebar");
const newChatBtn = document.getElementById("new-chat-btn");
const conversationList = document.getElementById("conversation-list");

let sessionId = crypto.randomUUID();

export function getSessionId() { return sessionId; }
export function setSessionId(id) { sessionId = id; }

function openSidebar() {
  sidebar.classList.remove("-translate-x-full");
  sidebarOverlay.classList.add("active");
}

function closeSidebar() {
  sidebar.classList.add("-translate-x-full");
  sidebarOverlay.classList.remove("active");
}

toggleSidebarBtn.addEventListener("click", () => {
  if (sidebar.classList.contains("-translate-x-full")) openSidebar();
  else closeSidebar();
});

closeSidebarBtn.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

export async function loadConversations() {
  const res = await fetch("/api/conversations");
  const conversations = await res.json();
  conversationList.innerHTML = "";

  conversations.forEach((conv) => {
    const div = document.createElement("div");
    const isActive = conv.id === sessionId;
    div.className = `group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
      isActive
        ? "bg-jarvis-500/10 border border-jarvis-500/20 text-jarvis-400"
        : "text-gray-400 hover:bg-white/[0.03] hover:text-gray-300"
    }`;
    div.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="flex-shrink-0 opacity-50">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
      <span class="text-xs truncate flex-1">${conv.title}</span>
      <button class="delete-conv opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 transition-all" data-id="${conv.id}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>`;

    div.addEventListener("click", (e) => {
      if (e.target.closest(".delete-conv")) return;
      loadConversation(conv.id);
    });

    div.querySelector(".delete-conv").addEventListener("click", async (e) => {
      e.stopPropagation();
      await fetch(`/api/conversations/${conv.id}`, { method: "DELETE" });
      if (conv.id === sessionId) startNewChat();
      else loadConversations();
    });

    conversationList.appendChild(div);
  });
}

async function loadConversation(id) {
  sessionId = id;
  setHasMessages(true);

  const res = await fetch(`/api/conversations/${id}/messages`);
  const messages = await res.json();

  chat.innerHTML = "";
  messages.forEach((msg) => {
    createMessageEl(msg.role === "assistant" ? "assistant" : "user", msg.content);
  });

  closeSidebar();
  loadConversations();
  input.focus();
}

export function startNewChat() {
  sessionId = crypto.randomUUID();
  setHasMessages(false);
  renderDashboard();
  closeSidebar();
  loadConversations();
  input.focus();
}

newChatBtn.addEventListener("click", startNewChat);

// Init
loadConversations();
