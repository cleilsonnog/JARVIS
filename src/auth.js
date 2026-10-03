// ===== Authentication Middleware =====
const crypto = require("crypto");
const { stmts } = require("./database");

const SESSION_COOKIE = "jarvis_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

// Login brute-force protection: per IP, MAX_FAILURES wrong passwords per window
const MAX_FAILURES = 5;
const FAILURE_WINDOW = 15 * 60 * 1000;
const failures = new Map(); // ip -> { count, first }

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Sessions are persisted (they survive restarts/deploys) but only as a hash,
// so a leaked database can't be used to log in.
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isValidSession(token) {
  if (!token) return false;
  const row = stmts.getSession.get(hashToken(token));
  return !!row && row.expires_at > Date.now();
}

function passwordMatches(given, expected) {
  const a = crypto.createHash("sha256").update(String(given ?? "")).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function isLockedOut(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.first > FAILURE_WINDOW) {
    failures.delete(ip);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

function recordFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first > FAILURE_WINDOW) failures.set(ip, { count: 1, first: Date.now() });
  else f.count++;
}

function authMiddleware(req, res, next) {
  const password = process.env.JARVIS_PASSWORD;

  // If no password set, skip auth (local dev)
  if (!password) return next();

  // Login route is always accessible
  if (req.path === "/login" || req.path === "/api/login") return next();

  // Strava OAuth return: cross-site navigation (SameSite=Strict cookie not sent); validated by its one-time state
  if (req.path === "/api/strava/callback") return next();

  // Allow login page and PWA assets
  // sw.js must stay public: if it redirected to login, a logged-out browser could never update a stale worker
  if (req.path === "/login.html" || req.path === "/tailwind.css" || req.path === "/sw.js" || req.path === "/manifest.json" || req.path.startsWith("/icons/")) return next();

  // Check session cookie
  const cookies = parseCookies(req.headers.cookie || "");
  if (isValidSession(cookies[SESSION_COOKIE])) {
    return next();
  }

  // API requests get 401
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Redirect to login page
  return res.redirect("/login.html");
}

function loginHandler(req, res) {
  const { password } = req.body;
  const correctPassword = process.env.JARVIS_PASSWORD;

  if (!correctPassword) {
    return res.status(400).json({ error: "No password configured" });
  }

  if (isLockedOut(req.ip)) {
    return res.status(429).json({ error: "Muitas tentativas. Tente novamente em alguns minutos." });
  }

  if (!passwordMatches(password, correctPassword)) {
    recordFailure(req.ip);
    return res.status(401).json({ error: "Senha incorreta" });
  }
  failures.delete(req.ip);

  const token = generateToken();
  const now = Date.now();
  stmts.addSession.run(hashToken(token), now, now + SESSION_MAX_AGE);

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE,
    // req.secure is true behind Nginx+HTTPS thanks to "trust proxy" + X-Forwarded-Proto
    secure: req.secure,
  });

  return res.json({ ok: true });
}

function logoutHandler(req, res) {
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (token) stmts.deleteSession.run(hashToken(token));
  res.clearCookie(SESSION_COOKIE);
  return res.json({ ok: true });
}

function parseCookies(cookieHeader) {
  const cookies = {};
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name) cookies[name] = rest.join("=");
  });
  return cookies;
}

// Cleanup expired sessions and stale login-failure counters every hour
setInterval(() => {
  const now = Date.now();
  stmts.deleteExpiredSessions.run(now);
  for (const [ip, f] of failures) if (now - f.first > FAILURE_WINDOW) failures.delete(ip);
}, 60 * 60 * 1000);

module.exports = { authMiddleware, loginHandler, logoutHandler };
