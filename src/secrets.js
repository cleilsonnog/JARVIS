// ===== Encryption of secrets saved from the UI (e-mail app passwords, Gemini key) =====
// AES-256-GCM with a key kept outside the database: JARVIS_SECRET or the .jarvis-secret file
// (created on first use, gitignored). Back it up together with the database.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SECRET_FILE = path.join(__dirname, "..", ".jarvis-secret");

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

module.exports = { encrypt, decrypt };
