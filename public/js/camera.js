// ===== Camera (JARVIS vision) =====
// While the camera is on, every message carries a fresh frame. When it's off, phrases like
// "o que você vê?" open it and capture automatically (see cameraIntent).

const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const MAX_SIDE = 1024;      // frames are downscaled to keep uploads small
const JPEG_QUALITY = 0.8;
const WARMUP_MS = 700;      // let exposure/focus settle after the stream starts

let stream = null;
let facing = IS_MOBILE ? "environment" : "user";
let panel = null;

export function isCameraOn() { return !!stream; }

// ----- Intent detection (works for typed and spoken messages) -----
function normalize(text) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const CLOSE_RE = /\b(fecha|feche|fechar|desliga|desligue|desligar)\b.*\bcamera\b/;
const LOOK_RE = [
  /\b(abre|abra|abrir|liga|ligue|ligar|ativa|ative|ativar|acessa|acesse|acessar|usa|use|usar|pela|na)\b.*\bcamera\b/,
  /\bo que (voce |vc )?(esta |ta )?(vendo|ve)\b/,
  /\b(olha|olhe|veja) (isso|isto|aqui|so|pra mim)\b/,
  /\b(consegue|pode) ver\b/,
];

// Returns "close" | "look" | null
export function cameraIntent(text) {
  const t = normalize(text);
  if (CLOSE_RE.test(t)) return "close";
  if (LOOK_RE.some((re) => re.test(t))) return "look";
  return null;
}

// ----- Panel -----
function buildPanel() {
  panel = document.createElement("div");
  panel.id = "camera-panel";
  panel.className = "cam-panel animate-fade-in";
  panel.innerHTML = `
    <span class="hud-corner tl"></span><span class="hud-corner tr"></span>
    <span class="hud-corner bl"></span><span class="hud-corner br"></span>
    <div class="cam-header">
      <span class="cam-live"></span>
      <span class="hud-code">VIS</span>
      <span class="hud-title">Visão · ao vivo</span>
      <span class="hud-rule"></span>
      <button type="button" class="hud-btn hidden" data-cam="switch" title="Trocar câmera">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
      </button>
      <button type="button" class="hud-btn" data-cam="close" title="Desligar câmera">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="cam-view">
      <video playsinline muted autoplay></video>
      <div class="cam-reticle"></div>
      <div class="cam-flash"></div>
    </div>
    <p class="cam-hint">Pergunte algo: cada mensagem envia o que a câmera está vendo</p>`;
  document.body.appendChild(panel);

  panel.addEventListener("click", (e) => {
    const action = e.target.closest("[data-cam]")?.dataset.cam;
    if (action === "close") closeCamera();
    if (action === "switch") switchCamera();
  });
}

async function startStream() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("A câmera só funciona em HTTPS (ou localhost) e num navegador com suporte.");
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    stream = null;
    if (err.name === "NotAllowedError") throw new Error("Permissão da câmera negada. Libere a câmera para este site nas configurações do navegador.");
    if (err.name === "NotFoundError" || err.name === "OverconstrainedError") throw new Error("Nenhuma câmera encontrada neste dispositivo.");
    if (err.name === "NotReadableError") throw new Error("A câmera está em uso por outro aplicativo.");
    throw new Error(`Não consegui acessar a câmera (${err.name}).`);
  }

  const video = panel.querySelector("video");
  video.srcObject = stream;
  video.classList.toggle("mirrored", facing === "user");
  await video.play().catch(() => {});

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter((d) => d.kind === "videoinput").length;
  panel.querySelector('[data-cam="switch"]').classList.toggle("hidden", cams < 2);
}

function stopStream() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

export async function openCamera() {
  if (stream) return;
  if (!panel) buildPanel();
  panel.classList.remove("hidden");
  try {
    await startStream();
  } catch (err) {
    panel.classList.add("hidden");
    throw err;
  }
  document.getElementById("camera-btn")?.classList.add("cam-btn-on");
}

export function closeCamera() {
  stopStream();
  panel?.classList.add("hidden");
  document.getElementById("camera-btn")?.classList.remove("cam-btn-on");
}

export async function toggleCamera() {
  if (stream) closeCamera();
  else await openCamera();
}

async function switchCamera() {
  facing = facing === "user" ? "environment" : "user";
  stopStream();
  try { await startStream(); } catch (err) { alert(err.message); closeCamera(); }
}

// Grab the current frame as { base64, mimeType, source }. Opens the camera first if needed.
export async function captureFrame() {
  const justOpened = !stream;
  await openCamera();

  const video = panel.querySelector("video");
  if (video.readyState < 2) {
    await new Promise((resolve) => video.addEventListener("loadeddata", resolve, { once: true }));
  }
  if (justOpened) await new Promise((r) => setTimeout(r, WARMUP_MS));

  const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

  const flash = panel.querySelector(".cam-flash");
  flash.classList.remove("on");
  void flash.offsetWidth; // restart the animation
  flash.classList.add("on");

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return { base64: dataUrl.split(",")[1], mimeType: "image/jpeg", source: "camera" };
}

// Release the camera when the page goes to the background (phones keep the LED on otherwise)
document.addEventListener("visibilitychange", () => {
  if (document.hidden && stream) closeCamera();
});

document.getElementById("camera-btn")?.addEventListener("click", () => {
  toggleCamera().catch((err) => alert(err.message));
});
