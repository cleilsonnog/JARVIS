// ===== E-mail (IMAP, read-only): unread messages for the briefing and "tenho e-mail novo?" =====
// Accounts are added on the "Configurar briefing" screen. The app password is stored encrypted
// (AES-256-GCM) with a key kept outside the database (JARVIS_SECRET or the .jarvis-secret file)
// and never sent back to the browser. Mailboxes are opened read-only: nothing is marked as read.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ImapFlow } = require("imapflow");
const { stmts } = require("./database");

const ACCOUNTS_KEY = "email_accounts";
const SECRET_FILE = path.join(__dirname, "..", ".jarvis-secret");
const CACHE_MS = 5 * 60 * 1000;
const MAX_ACCOUNTS = 5;

const PROVIDERS = {
  gmail: { label: "Gmail", host: "imap.gmail.com", port: 993 },
  outlook: { label: "Outlook / Hotmail", host: "outlook.office365.com", port: 993 },
  yahoo: { label: "Yahoo", host: "imap.mail.yahoo.com", port: 993 },
  icloud: { label: "iCloud", host: "imap.mail.me.com", port: 993 },
  outro: { label: "Outro (IMAP)", host: "", port: 993 },
};

// ----- Encryption of the app passwords -----
let key = null;
function secretKey() {
  if (key) return key;
  if (process.env.JARVIS_SECRET) {
    key = crypto.createHash("sha256").update(process.env.JARVIS_SECRET).digest();
  } else {
    if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
    key = Buffer.from(fs.readFileSync(SECRET_FILE, "utf8").trim(), "hex");
  }
  return key;
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

function decrypt(blob) {
  const [iv, tag, data] = blob.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// ----- Accounts -----
function loadAccounts() {
  const row = stmts.getSetting.get(ACCOUNTS_KEY);
  return row ? JSON.parse(row.value) : [];
}

function saveAccounts(list) {
  stmts.setSetting.run(ACCOUNTS_KEY, JSON.stringify(list));
  cache = { at: 0, data: null };
}

// What the browser may see: never the password
const publicAccount = (a) => ({ id: a.id, provider: a.provider, label: PROVIDERS[a.provider]?.label || "IMAP", email: a.email, host: a.host });

const hasAccounts = () => loadAccounts().length > 0;

// ----- IMAP -----
function client(account, pass) {
  return new ImapFlow({
    host: account.host,
    port: account.port,
    secure: true,
    auth: { user: account.email, pass },
    logger: false,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

function friendlyError(err) {
  if (err.authenticationFailed || /auth|credentials|login/i.test(err.responseText || err.message)) {
    return "E-mail ou senha de app incorretos (no Gmail, use uma senha de app, não a senha normal).";
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(err.code || err.message)) return "Não consegui conectar ao servidor de e-mail.";
  return err.responseText || err.message;
}

// Unread messages of the last `hours` in INBOX: sender, subject, date. Bodies are never read.
async function readUnread(account, pass, { hours = 24, limit = 10 } = {}) {
  const imap = client(account, pass);
  imap.on("error", () => {}); // socket errors after logout must not crash the server
  await imap.connect();
  try {
    const lock = await imap.getMailboxLock("INBOX", { readOnly: true });
    try {
      const uids = (await imap.search({ seen: false, since: new Date(Date.now() - hours * 3600000) }, { uid: true })) || [];
      const recent = uids.slice(-limit);
      const msgs = [];
      if (recent.length) {
        for await (const m of imap.fetch(recent, { envelope: true }, { uid: true })) {
          const from = m.envelope.from?.[0];
          msgs.push({
            de: from?.name || from?.address || "—",
            assunto: m.envelope.subject || "(sem assunto)",
            data: m.envelope.date?.toISOString(),
          });
        }
      }
      return { nao_lidos: uids.length, recentes: msgs.reverse() };
    } finally {
      lock.release();
    }
  } finally {
    await imap.logout().catch(() => imap.close());
  }
}

// All accounts, cached a few minutes (briefing + tool + screen share it)
let cache = { at: 0, data: null };
async function getUnreadSummary() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const accounts = loadAccounts();
  const results = await Promise.allSettled(accounts.map((a) => readUnread(a, decrypt(a.pass))));
  const data = accounts.map((a, i) => ({
    conta: a.email,
    ...(results[i].status === "fulfilled" ? results[i].value : { erro: friendlyError(results[i].reason) }),
  }));
  cache = { at: Date.now(), data };
  return data;
}

// ----- Routes (Configurar briefing → Contas de e-mail) -----
function register(app) {
  app.get("/api/email/accounts", (req, res) => {
    res.json({ accounts: loadAccounts().map(publicAccount), providers: PROVIDERS });
  });

  // Tests the login before saving, so a wrong password never gets stored
  app.post("/api/email/accounts", async (req, res) => {
    const { provider, email, password, host } = req.body || {};
    const p = PROVIDERS[provider];
    if (!p) return res.status(400).json({ error: "Escolha o provedor." });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || "")) return res.status(400).json({ error: "E-mail inválido." });
    if (!password) return res.status(400).json({ error: "Informe a senha de app." });
    const accounts = loadAccounts();
    if (accounts.length >= MAX_ACCOUNTS) return res.status(400).json({ error: `Limite de ${MAX_ACCOUNTS} contas.` });
    if (accounts.some((a) => a.email.toLowerCase() === email.toLowerCase())) return res.status(400).json({ error: "Essa conta já está cadastrada." });

    const account = { id: crypto.randomUUID(), provider, email: email.trim(), host: (provider === "outro" ? String(host || "") : p.host).trim(), port: p.port };
    if (!account.host) return res.status(400).json({ error: "Informe o servidor IMAP." });
    const pass = String(password).replace(/\s+/g, ""); // Gmail shows app passwords as "abcd efgh ijkl mnop"
    try {
      const r = await readUnread(account, pass, { limit: 0 });
      saveAccounts([...accounts, { ...account, pass: encrypt(pass) }]);
      res.json({ account: publicAccount(account), nao_lidos: r.nao_lidos });
    } catch (err) {
      res.status(400).json({ error: friendlyError(err) });
    }
  });

  app.delete("/api/email/accounts/:id", (req, res) => {
    saveAccounts(loadAccounts().filter((a) => a.id !== req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/email/test", async (req, res) => {
    if (!hasAccounts()) return res.json({ ok: false, error: "Nenhuma conta cadastrada." });
    cache = { at: 0, data: null };
    const data = await getUnreadSummary();
    res.json({ ok: data.every((d) => !d.erro), contas: data.map((d) => ({ conta: d.conta, nao_lidos: d.nao_lidos, erro: d.erro })) });
  });
}

module.exports = { register, hasAccounts, getUnreadSummary };
