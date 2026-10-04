// ===== First-run setup: Gemini key and the user's profile =====
// Lets someone who just cloned the project get it working from the browser: the Gemini key can
// come from .env (GEMINI_API_KEY, wins if set) or be pasted on the setup screen, where it's tested
// and stored encrypted. The profile (name + free-form "about me" instructions) personalizes the
// system prompt, so nothing about a specific user lives in the code.
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { stmts } = require("./database");
const { encrypt, decrypt } = require("./secrets");

const KEY_SETTING = "gemini_api_key";
const PROFILE_SETTING = "profile";
const DONE_SETTING = "setup_done";
const MAX_ABOUT = 2000;

// ----- Gemini key -----
let decrypted = { blob: null, key: null };

function getApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const row = stmts.getSetting.get(KEY_SETTING);
  if (!row) return null;
  if (decrypted.blob !== row.value) {
    try {
      decrypted = { blob: row.value, key: decrypt(row.value) };
    } catch {
      return null; // .jarvis-secret changed: the key has to be pasted again
    }
  }
  return decrypted.key;
}

function keySource() {
  if (process.env.GEMINI_API_KEY) return "env";
  return getApiKey() ? "app" : null;
}

// One client per key, so a key saved on the setup screen takes effect without a restart
let client = { key: null, ai: null };
function genAI() {
  const key = getApiKey();
  if (!key) throw new Error("Chave do Gemini não configurada. Abra Configuração no menu lateral.");
  if (client.key !== key) client = { key, ai: new GoogleGenerativeAI(key) };
  return client.ai;
}

// Listing models checks the key without spending tokens
async function testKey(key) {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.timeout(10000),
  });
  if (res.ok) return;
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new Error("Chave inválida. Confira se copiou a chave inteira.");
  throw new Error(`O Google respondeu com erro ${res.status}. Tente de novo em instantes.`);
}

// ----- Profile -----
function getProfile() {
  const row = stmts.getSetting.get(PROFILE_SETTING);
  const p = row ? JSON.parse(row.value) : {};
  return { nome: p.nome || "", sobre: p.sobre || "" };
}

// Enough to recognize which key is in use, never the key itself
const maskKey = (key) => (key ? `${key.slice(0, 4)}…${key.slice(-4)}` : null);

function status() {
  const profile = getProfile();
  return {
    done: stmts.getSetting.get(DONE_SETTING)?.value === "1",
    gemini: { configured: !!getApiKey(), source: keySource(), hint: maskKey(getApiKey()) },
    profile,
    senha: !!process.env.JARVIS_PASSWORD,
    toolsMode: process.env.TOOLS_MODE === "full" ? "full" : "safe",
  };
}

function register(app) {
  app.get("/api/setup/status", (req, res) => res.json(status()));

  app.post("/api/setup/gemini", async (req, res) => {
    if (process.env.GEMINI_API_KEY) return res.status(409).json({ error: "A chave já está definida no .env, que tem prioridade." });
    const key = String(req.body?.key || "").trim();
    if (!/^[\w-]{20,200}$/.test(key)) return res.status(400).json({ error: "Isso não parece uma chave do Gemini (começa com AIza…)." });
    try {
      await testKey(key);
    } catch (err) {
      return res.status(400).json({ error: err.name === "TimeoutError" ? "O Google não respondeu. Verifique a internet." : err.message });
    }
    stmts.setSetting.run(KEY_SETTING, encrypt(key));
    res.json({ ok: true });
  });

  app.put("/api/setup/profile", (req, res) => {
    const nome = String(req.body?.nome || "").trim().slice(0, 60);
    const sobre = String(req.body?.sobre || "").trim().slice(0, MAX_ABOUT);
    if (!nome) return res.status(400).json({ error: "Diga como o JARVIS deve te chamar." });
    stmts.setSetting.run(PROFILE_SETTING, JSON.stringify({ nome, sobre }));
    res.json({ ok: true });
  });

  app.post("/api/setup/done", (req, res) => {
    const s = status();
    if (!s.gemini.configured || !s.profile.nome) return res.status(400).json({ error: "Falta a chave do Gemini ou o seu nome." });
    stmts.setSetting.run(DONE_SETTING, "1");
    res.json({ ok: true });
  });
}

module.exports = { register, genAI, getApiKey, getProfile };
