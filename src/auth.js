// ===== Authentication Middleware =====
const crypto = require("crypto");

const SESSION_COOKIE = "jarvis_session";
const sessions = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function authMiddleware(req, res, next) {
  const password = process.env.JARVIS_PASSWORD;

  // If no password set, skip auth (local dev)
  if (!password) return next();

  // Login route is always accessible
  if (req.path === "/login" || req.path === "/api/login") return next();

  // Allow login page and PWA assets
  if (req.path === "/login.html" || req.path === "/manifest.json" || req.path.startsWith("/icons/")) return next();

  // Check session cookie
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];

  if (token && sessions.has(token)) {
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

  if (password !== correctPassword) {
    return res.status(401).json({ error: "Senha incorreta" });
  }

  const token = generateToken();
  sessions.set(token, { createdAt: Date.now() });

  // Cookie expires in 30 days
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === "production",
  });

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

// Cleanup old sessions every hour
setInterval(() => {
  const maxAge = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const [token, data] of sessions) {
    if (now - data.createdAt > maxAge) {
      sessions.delete(token);
    }
  }
}, 60 * 60 * 1000);

module.exports = { authMiddleware, loginHandler };
