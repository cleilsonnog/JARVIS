require("dotenv").config();
const express = require("express");
const path = require("path");
const routes = require("./src/routes");
const { authMiddleware, loginHandler } = require("./src/auth");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

// Login API (before auth middleware)
app.post("/api/login", loginHandler);

// Auth middleware (skipped if JARVIS_PASSWORD not set)
app.use(authMiddleware);

app.use(express.static(path.join(__dirname, "public")));

routes.register(app);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`JARVIS rodando em http://localhost:${PORT}`);
  if (process.env.JARVIS_PASSWORD) {
    console.log("Autenticacao ativada (JARVIS_PASSWORD definido)");
  } else {
    console.log("Sem autenticacao (defina JARVIS_PASSWORD no .env para ativar)");
  }
});
