// ===== Web Push: reminder notifications that arrive even with the app closed =====
const webpush = require("web-push");
const { stmts } = require("./database");

const CHECK_INTERVAL = 15 * 1000;

// VAPID keys identify this server to the browsers' push services. They come from the
// environment if set; otherwise they're generated once and kept in the database, so
// existing subscriptions stay valid across restarts and deploys.
function loadVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const saved = stmts.getSetting.get("vapid_keys");
  if (saved) return JSON.parse(saved.value);
  const keys = webpush.generateVAPIDKeys();
  stmts.setSetting.run("vapid_keys", JSON.stringify(keys));
  return keys;
}

const vapid = loadVapidKeys();
webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", vapid.publicKey, vapid.privateKey);

function getPublicKey() {
  return vapid.publicKey;
}

function saveSubscription(sub) {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Inscrição inválida");
  stmts.savePushSub.run(sub.endpoint, sub.keys.p256dh, sub.keys.auth);
}

function removeSubscription(endpoint) {
  stmts.deletePushSub.run(endpoint);
}

// Send to every subscribed device; drop subscriptions the push service says are gone
async function sendToAll(payload) {
  const subs = stmts.getPushSubs.all();
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(subs.map((s) =>
    webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      body,
      { TTL: 60 * 60, urgency: "high" },
    ).catch((err) => {
      if (err.statusCode === 404 || err.statusCode === 410) removeSubscription(s.endpoint);
      else console.error("Erro push:", err.statusCode || "", err.message);
      throw err;
    })
  ));
  return { devices: subs.length, delivered: results.filter((r) => r.status === "fulfilled").length };
}

// Scheduler: the server (not the page) decides when a reminder is due
async function checkDueReminders() {
  const due = stmts.getPendingReminders.all();
  for (const r of due) {
    stmts.markNotified.run(r.id);
    await sendToAll({ type: "reminder", id: r.id, text: r.text, remind_at: r.remind_at }).catch(() => {});
  }
}

function startReminderScheduler() {
  setInterval(() => checkDueReminders().catch((err) => console.error("Erro lembretes:", err.message)), CHECK_INTERVAL);
}

module.exports = { getPublicKey, saveSubscription, removeSubscription, sendToAll, startReminderScheduler };
