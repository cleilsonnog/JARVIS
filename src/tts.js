// ===== Server TTS: Gemini voice streamed to the browser =====
// The browser posts the text; we open a streaming TTS interaction and forward the raw PCM
// (16-bit, mono, 24 kHz) as it arrives, so playback starts in ~1-2s even for long replies.
// If anything fails before the first audio byte, we answer with an error status and the
// browser falls back to its own (Web Speech) voice.

const MODEL = process.env.TTS_MODEL || "gemini-3.1-flash-tts-preview";
const VOICE = process.env.TTS_VOICE || "Algenib";
const STYLE = "Fale em português do Brasil, com tom calmo, confiante e cordial de um assistente pessoal:";
const MAX_CHARS = 3000;
const SAMPLE_RATE = 24000;

function isEnabled() {
  return process.env.TTS_PROVIDER !== "browser" && !!process.env.GEMINI_API_KEY;
}

async function streamSpeech(text, res, signal) {
  const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse", {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY,
      "Content-Type": "application/json",
      "Api-Revision": "2026-05-20",
    },
    body: JSON.stringify({
      model: MODEL,
      input: `${STYLE} ${text}`,
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: VOICE }] },
      stream: true,
    }),
    signal,
  });
  if (!upstream.ok) {
    const err = new Error(`TTS ${upstream.status}`);
    err.status = upstream.status === 429 ? 429 : 502;
    throw err;
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let started = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;

      let event;
      try { event = JSON.parse(line.slice(5)); } catch { continue; }
      if (event.event_type !== "step.delta" || event.delta?.type !== "audio") continue;

      if (!started) {
        started = true;
        res.writeHead(200, {
          "Content-Type": `audio/L16; rate=${SAMPLE_RATE}; channels=1`,
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no", // tell Nginx not to buffer the stream
        });
      }
      res.write(Buffer.from(event.delta.data, "base64"));
    }
  }

  if (!started) {
    const err = new Error("TTS sem áudio");
    err.status = 502;
    throw err;
  }
  res.end();
}

function register(app) {
  app.get("/api/tts/config", (req, res) => {
    res.json({ enabled: isEnabled(), voice: VOICE });
  });

  app.post("/api/tts", async (req, res) => {
    if (!isEnabled()) return res.status(501).json({ error: "TTS do servidor desativado" });
    const text = String(req.body?.text || "").trim().slice(0, MAX_CHARS);
    if (!text) return res.status(400).json({ error: "Texto vazio" });

    // Stop generating (and spending quota) if the user interrupts playback
    const abort = new AbortController();
    res.on("close", () => abort.abort());

    try {
      await streamSpeech(text, res, abort.signal);
    } catch (err) {
      if (abort.signal.aborted) return;
      if (!res.headersSent) res.status(err.status || 502).json({ error: err.message });
      else res.end(); // failed mid-stream: the browser plays what it already got
      if (err.status !== 429) console.error("Erro TTS:", err.message);
    }
  });
}

module.exports = { register };
