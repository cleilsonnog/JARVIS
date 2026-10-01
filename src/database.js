const Database = require("better-sqlite3");
const path = require("path");

// JARVIS_DB lets tests (or a second instance) use a separate database file
const db = new Database(process.env.JARVIS_DB || path.join(__dirname, "..", "jarvis.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    remind_at DATETIME NOT NULL,
    notified INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrations for existing databases
const reminderCols = db.prepare("PRAGMA table_info(reminders)").all().map((c) => c.name);
// notified = alert already sent; done = user confirmed it ("Concluir")
if (!reminderCols.includes("done")) db.exec("ALTER TABLE reminders ADD COLUMN done INTEGER DEFAULT 0");

const stmts = {
  createConversation: db.prepare("INSERT INTO conversations (id, title) VALUES (?, ?)"),
  updateTimestamp: db.prepare("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"),
  getConversations: db.prepare("SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT 50"),
  getMessages: db.prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC"),
  addMessage: db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)"),
  deleteConversation: db.prepare("DELETE FROM conversations WHERE id = ?"),
  deleteMessages: db.prepare("DELETE FROM messages WHERE conversation_id = ?"),
  addReminder: db.prepare("INSERT INTO reminders (text, remind_at) VALUES (?, ?)"),
  getPendingReminders: db.prepare("SELECT id, text, remind_at FROM reminders WHERE notified = 0 AND remind_at <= datetime('now', 'localtime')"),
  markNotified: db.prepare("UPDATE reminders SET notified = 1 WHERE id = ?"),
  getReminders: db.prepare("SELECT id, text, remind_at, notified FROM reminders WHERE notified = 0 ORDER BY remind_at ASC"),
  deleteReminder: db.prepare("DELETE FROM reminders WHERE id = ?"),
  getTodayReminders: db.prepare("SELECT id, text, remind_at, notified, done FROM reminders WHERE date(remind_at) = date('now', 'localtime') ORDER BY remind_at ASC"),
  // Alerted but not confirmed yet (shown as cards until "Concluir" / "Adiar")
  getActiveReminders: db.prepare("SELECT id, text, remind_at FROM reminders WHERE notified = 1 AND done = 0 ORDER BY remind_at ASC"),
  // Agenda: everything not confirmed yet (overdue, today and future), soonest first
  getUpcomingReminders: db.prepare("SELECT id, text, remind_at, notified, done FROM reminders WHERE done = 0 ORDER BY remind_at ASC LIMIT 100"),
  getReminder: db.prepare("SELECT id, text, remind_at, notified, done FROM reminders WHERE id = ?"),
  markDone: db.prepare("UPDATE reminders SET done = 1 WHERE id = ?"),
  // ? = SQLite modifier like "+10 minutes"; keeps remind_at in the same local "YYYY-MM-DD HH:MM" format
  snoozeReminder: db.prepare("UPDATE reminders SET remind_at = strftime('%Y-%m-%d %H:%M', 'now', 'localtime', ?), notified = 0, done = 0 WHERE id = ?"),
  // Push
  savePushSub: db.prepare("INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth"),
  getPushSubs: db.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions"),
  deletePushSub: db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?"),
  getSetting: db.prepare("SELECT value FROM settings WHERE key = ?"),
  setSetting: db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
  // Sessions (token stored as SHA-256 hash; times in ms)
  addSession: db.prepare("INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)"),
  getSession: db.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?"),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
  deleteExpiredSessions: db.prepare("DELETE FROM sessions WHERE expires_at < ?"),
  // Memories
  saveMemory: db.prepare("INSERT INTO memories (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"),
  getMemory: db.prepare("SELECT key, value FROM memories WHERE key = ?"),
  getAllMemories: db.prepare("SELECT key, value FROM memories ORDER BY updated_at DESC"),
  deleteMemory: db.prepare("DELETE FROM memories WHERE key = ?"),
  searchMemories: db.prepare("SELECT key, value FROM memories WHERE key LIKE ? OR value LIKE ? ORDER BY updated_at DESC"),
};

module.exports = { db, stmts };
