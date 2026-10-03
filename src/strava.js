// ===== Strava integration (read-only): workouts synced from the Amazfit/Zepp app =====
// OAuth 2: /api/strava/connect -> Strava consent -> /api/strava/callback stores the tokens
// (settings table). Access tokens last 6h and are refreshed automatically.
// Enabled when STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are set.

const crypto = require("crypto");
const { stmts } = require("./database");

const API = "https://www.strava.com/api/v3";
const TOKENS_KEY = "strava_tokens";
const SCOPE = "read,activity:read_all"; // read_all: include "Only me" activities
const STATE_TTL = 10 * 60 * 1000;
const pendingStates = new Map(); // state -> created at

const SPORTS = {
  Run: "corrida", TrailRun: "corrida em trilha", VirtualRun: "corrida na esteira", Walk: "caminhada", Hike: "trilha",
  Ride: "pedal", MountainBikeRide: "mountain bike", GravelRide: "pedal gravel", VirtualRide: "pedal indoor", EBikeRide: "pedal elétrico",
  Swim: "natação", WeightTraining: "musculação", Workout: "treino", Yoga: "yoga", Pilates: "pilates", Elliptical: "elíptico",
  HighIntensityIntervalTraining: "HIIT", Crossfit: "crossfit", Rowing: "remo", StairStepper: "escada", Soccer: "futebol",
};

function isConfigured() {
  return !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

function loadTokens() {
  const row = stmts.getSetting.get(TOKENS_KEY);
  return row ? JSON.parse(row.value) : null;
}

function saveTokens(t) {
  stmts.setSetting.run(TOKENS_KEY, JSON.stringify(t));
}

async function tokenRequest(params) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, ...params }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Strava recusou a autorização (${res.status}).`);
  return res.json();
}

async function getAccessToken() {
  const t = loadTokens();
  if (!t) throw new Error("Strava não conectado. Conecte em Integrações (menu lateral).");
  if (t.expires_at - 60 > Date.now() / 1000) return t.access_token;
  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token });
  saveTokens({ ...t, access_token: fresh.access_token, refresh_token: fresh.refresh_token, expires_at: fresh.expires_at });
  return fresh.access_token;
}

async function api(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 401) throw new Error("A autorização do Strava expirou ou foi revogada. Conecte novamente.");
  if (res.status === 429) throw new Error("Limite de consultas do Strava atingido; tente em alguns minutos.");
  if (!res.ok) throw new Error(`Strava respondeu ${res.status}.`);
  return res.json();
}

// ----- Formatting for the model -----
const duration = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return h ? `${h}h${String(m).padStart(2, "0")}min` : `${m}min${sec ? ` ${sec}s` : ""}`;
};
const pace = (metersPerSec) => {
  if (!metersPerSec) return null;
  const secPerKm = 1000 / metersPerSec;
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, "0")} min/km`;
};
const isFootSport = (t) => /Run|Walk|Hike/.test(t);

function summarize(a) {
  const km = a.distance / 1000;
  return {
    nome: a.name,
    tipo: SPORTS[a.sport_type] || a.sport_type,
    data: a.start_date_local.replace("T", " ").slice(0, 16),
    distancia_km: km ? Number(km.toFixed(2)) : undefined,
    tempo: duration(a.moving_time),
    ritmo: km && isFootSport(a.sport_type) ? pace(a.average_speed) : undefined,
    velocidade_media_kmh: km && !isFootSport(a.sport_type) ? Number((a.average_speed * 3.6).toFixed(1)) : undefined,
    fc_media: a.average_heartrate ? Math.round(a.average_heartrate) : undefined,
    fc_maxima: a.max_heartrate ? Math.round(a.max_heartrate) : undefined,
    elevacao_m: a.total_elevation_gain ? Math.round(a.total_elevation_gain) : undefined,
  };
}

// Activities of the last `dias` days (optionally of one type), newest first, with totals per type
async function getActivities({ dias = 7, tipo } = {}) {
  const days = Math.min(365, Math.max(1, parseInt(dias, 10) || 7));
  const after = Math.floor(Date.now() / 1000) - days * 86400;
  let list = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await api(`/athlete/activities?after=${after}&per_page=100&page=${page}`);
    list = list.concat(batch);
    if (batch.length < 100) break;
  }
  if (tipo) {
    const wanted = String(tipo).toLowerCase();
    list = list.filter((a) => (SPORTS[a.sport_type] || a.sport_type).toLowerCase().includes(wanted) || a.sport_type.toLowerCase().includes(wanted));
  }
  list.sort((a, b) => b.start_date.localeCompare(a.start_date));

  const totals = {};
  for (const a of list) {
    const k = SPORTS[a.sport_type] || a.sport_type;
    const t = (totals[k] ||= { atividades: 0, distancia_km: 0, tempo_s: 0 });
    t.atividades++;
    t.distancia_km += a.distance / 1000;
    t.tempo_s += a.moving_time;
  }
  const totais_por_tipo = Object.fromEntries(Object.entries(totals).map(([k, t]) => [k, {
    atividades: t.atividades,
    distancia_km: Number(t.distancia_km.toFixed(2)),
    tempo: duration(t.tempo_s),
  }]));

  return { periodo_dias: days, total_atividades: list.length, totais_por_tipo, atividades: list.slice(0, 15).map(summarize) };
}

// ----- Routes -----
function register(app) {
  app.get("/api/strava/status", (req, res) => {
    const t = isConfigured() ? loadTokens() : null;
    res.json({ configured: isConfigured(), connected: !!t, athlete: t?.athlete || null });
  });

  // Logged-in user starts the consent flow
  app.get("/api/strava/connect", (req, res) => {
    if (!isConfigured()) return res.status(501).send("Strava não configurado (STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET).");
    const state = crypto.randomBytes(16).toString("hex");
    pendingStates.set(state, Date.now());
    const url = new URL("https://www.strava.com/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      response_type: "code",
      redirect_uri: `${req.protocol}://${req.get("host")}/api/strava/callback`,
      approval_prompt: "auto",
      scope: SCOPE,
      state,
    });
    res.redirect(url.toString());
  });

  // Strava redirects here. Public route (the session cookie is SameSite=Strict, so it isn't sent
  // on this cross-site navigation); protected by the one-time `state` created in /connect.
  app.get("/api/strava/callback", async (req, res) => {
    const { state, code, error } = req.query;
    const created = pendingStates.get(state);
    pendingStates.delete(state);
    const back = (msg) => res.send(`<!doctype html><meta charset="utf-8"><script>location.replace("/?strava=${msg}")</script>`);
    if (!created || Date.now() - created > STATE_TTL) return res.status(400).send("Link de autorização inválido ou expirado. Tente conectar de novo.");
    if (error || !code) return back("cancelado");
    try {
      const t = await tokenRequest({ grant_type: "authorization_code", code });
      if (!String(t.scope || req.query.scope || "").includes("activity:read")) return back("sem-permissao");
      saveTokens({
        access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at,
        athlete: { id: t.athlete?.id, nome: [t.athlete?.firstname, t.athlete?.lastname].filter(Boolean).join(" ") },
      });
      back("conectado");
    } catch (err) {
      console.error("Erro Strava:", err.message);
      back("erro");
    }
  });

  app.post("/api/strava/disconnect", async (req, res) => {
    const t = loadTokens();
    if (t) {
      await fetch("https://www.strava.com/oauth/deauthorize", {
        method: "POST",
        headers: { Authorization: `Bearer ${t.access_token}` },
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});
      stmts.setSetting.run(TOKENS_KEY, "null");
    }
    res.json({ ok: true });
  });
}

// Clean abandoned consent attempts
setInterval(() => {
  for (const [s, at] of pendingStates) if (Date.now() - at > STATE_TTL) pendingStates.delete(s);
}, STATE_TTL).unref();

module.exports = { isConfigured, isConnected: () => !!loadTokens(), getActivities, register };
