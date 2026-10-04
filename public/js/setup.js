// ===== Configuração inicial: guided first run (Gemini key + profile required, the rest optional) =====
// Opens by itself until the setup is finished; afterwards it stays reachable from the sidebar
// ("Configuração") to change the key, the name or the "about me" instructions.
import { registerPage, openPage, closePage, isCurrentPage, header, icon, esc, pill } from "./pages.js";
import { speak } from "./tts.js";
import { pushSupported, subscribePush } from "./reminders.js";

const view = document.getElementById("page-view");
const STEPS = ["Boas-vindas", "Chave do Gemini", "Seu perfil", "Extras"];

let status = null;
let step = 0;

async function loadStatus() {
  status = await (await fetch("/api/setup/status")).json();
  return status;
}

const canReach = (i) => i <= 1 || (i === 2 && status.gemini.configured) || (i === 3 && status.gemini.configured && status.profile.nome);

async function renderSetup({ focus } = {}) {
  try {
    await loadStatus();
  } catch {
    view.innerHTML = `<p class="text-sm text-red-400 p-6">Não consegui carregar a configuração.</p>`;
    return;
  }
  if (!isCurrentPage("setup")) return;
  step = focus !== undefined ? Number(focus) : status.done ? 2 : 0;
  draw();
}

function draw() {
  view.innerHTML = `
    <div class="max-w-3xl mx-auto w-full animate-slide-up">
      ${header("Primeiros passos", "Configuração", "Duas etapas obrigatórias; o resto você ativa quando quiser.", status.done ? undefined : "")}
      <ol class="setup-steps">
        ${STEPS.map((label, i) => `
          <li>
            <button type="button" class="setup-step ${i === step ? "is-current" : ""} ${stepDone(i) ? "is-done" : ""}" data-step="${i}" ${canReach(i) ? "" : "disabled"}>
              <span class="setup-num">${stepDone(i) ? icon("check", 13) : i + 1}</span>
              <span>${label}</span>
            </button>
          </li>`).join("")}
      </ol>
      <div id="setup-body">${[welcomeStep, geminiStep, profileStep, extrasStep][step]()}</div>
    </div>`;
  if (step === 3) loadExtras();
}

function stepDone(i) {
  if (i === 0) return step > 0 || status.done;
  if (i === 1) return status.gemini.configured;
  if (i === 2) return !!status.profile.nome;
  return status.done;
}

const nav = (back, next, nextLabel = "Próximo", disabled = false) => `
  <div class="flex items-center justify-between gap-2 mt-6">
    ${back !== null ? `<button type="button" class="page-btn" data-step="${back}">${icon("back", 14)} Voltar</button>` : "<span></span>"}
    ${next !== null ? `<button type="button" class="page-btn page-btn-primary" data-step="${next}" ${disabled ? "disabled" : ""}>${nextLabel}</button>` : ""}
  </div>`;

// ----- 1. Welcome -----
function welcomeStep() {
  return `
    <section class="panel panel-hero">
      <h3 class="text-xl font-semibold text-gray-100">Bem-vindo ao JARVIS</h3>
      <p class="integ-desc text-sm">Um assistente pessoal com IA: conversa por texto ou voz, enxerga imagens, cria lembretes, lembra do que você conta e monta um resumo do seu dia.</p>
      <div class="grid gap-4 sm:grid-cols-2 mt-5">
        <div>
          <p class="field-label">OBRIGATÓRIO · CERCA DE 2 MIN</p>
          <ul class="setup-list">
            <li>${icon("key", 15)} Chave gratuita do Gemini, o “cérebro” do JARVIS</li>
            <li>${icon("user", 15)} Como o JARVIS deve te chamar</li>
          </ul>
        </div>
        <div>
          <p class="field-label">OPCIONAL · QUANDO QUISER</p>
          <ul class="setup-list text-gray-400">
            <li>${icon("mic", 15)} Voz e palavra de ativação</li>
            <li>${icon("bell", 15)} Notificações de lembretes</li>
            <li>${icon("sunrise", 15)} Briefing, clima e e-mail</li>
            <li>${icon("link", 15)} Aplicações externas</li>
          </ul>
        </div>
      </div>
      <p class="field-hint mt-5">Você só precisa de uma conta Google. Para melhor experiência com voz, use o Chrome.</p>
    </section>
    ${nav(null, 1, "Começar")}`;
}

// ----- 2. Gemini key -----
function geminiStep() {
  const g = status.gemini;
  if (g.source === "env") {
    return `
      <section class="panel">
        <div class="panel-head"><span class="panel-icon">${icon("key", 20)}</span><div><h3>Chave do Gemini</h3><p>Definida no arquivo .env do servidor.</p></div><span class="ml-auto">${pill("on", "Configurada")}</span></div>
        <p class="integ-meta">Chave em uso: <code>${esc(g.hint)}</code></p>
        <p class="integ-desc mt-3">A chave do .env tem prioridade. Para trocar, edite <code>GEMINI_API_KEY</code> no .env e reinicie o servidor; para gerenciar por esta tela, apague essa linha do .env.</p>
      </section>
      ${nav(0, 2)}`;
  }
  return `
    <section class="panel">
      <div class="panel-head">
        <span class="panel-icon">${icon("key", 20)}</span>
        <div><h3>Chave do Gemini</h3><p>É gratuita e leva um minuto.</p></div>
        <span class="ml-auto">${g.configured ? pill("on", "Salva") : pill("warn", "Pendente")}</span>
      </div>
      ${g.configured ? `<p class="integ-meta">Chave em uso: <code>${esc(g.hint)}</code>. Para trocar, cole a nova abaixo: a atual só é substituída se a nova funcionar.</p>` : ""}
      <ol class="setup-howto">
        <li>Abra o <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> e entre com sua conta Google.</li>
        <li>Clique em <b>Create API key</b> (Criar chave de API) e aceite os termos, se pedir.</li>
        <li>Copie a chave (começa com <code>AIza</code>) e cole abaixo.</li>
      </ol>
      <form id="gemini-form" class="mt-4">
        <label class="field-label" for="gemini-key">${g.configured ? "TROCAR CHAVE" : "SUA CHAVE"}</label>
        <div class="flex flex-col sm:flex-row gap-2">
          <input id="gemini-key" name="key" type="password" class="field font-mono" placeholder="AIza…" autocomplete="off" spellcheck="false" required>
          <button type="submit" class="page-btn page-btn-primary justify-center whitespace-nowrap">Testar e salvar</button>
        </div>
        <p class="integ-result" data-result="gemini"></p>
        <span class="field-hint">A chave é testada e guardada criptografada só neste servidor. O plano gratuito tem limite diário de uso, suficiente para uso pessoal.</span>
      </form>
    </section>
    ${nav(0, 2, "Próximo", !g.configured)}`;
}

// ----- 3. Profile -----
function profileStep() {
  const p = status.profile;
  return `
    <section class="panel">
      <div class="panel-head"><span class="panel-icon">${icon("user", 20)}</span><div><h3>Seu perfil</h3><p>Personaliza todas as respostas do JARVIS.</p></div></div>
      <form id="profile-form" class="mt-4 space-y-4">
        <div>
          <label class="field-label" for="profile-nome">COMO O JARVIS DEVE TE CHAMAR? *</label>
          <input id="profile-nome" name="nome" class="field" maxlength="60" placeholder="Seu nome ou apelido" value="${esc(p.nome)}" required>
        </div>
        <div>
          <label class="field-label" for="profile-sobre">SOBRE VOCÊ (OPCIONAL)</label>
          <textarea id="profile-sobre" name="sobre" class="field" rows="6" maxlength="2000" placeholder="Ex.: Sou estudante de engenharia em Recife. Prefiro respostas curtas e diretas. Estou aprendendo Python. Torço para o Sport.">${esc(p.sobre)}</textarea>
          <span class="field-hint">Vira uma instrução fixa para o JARVIS: quem você é, do que gosta, como prefere as respostas. O resto ele aprende conversando.</span>
        </div>
        <p class="integ-result" data-result="profile"></p>
        <div class="flex items-center justify-between gap-2">
          <button type="button" class="page-btn" data-step="1">${icon("back", 14)} Voltar</button>
          <button type="submit" class="page-btn page-btn-primary">Salvar e continuar</button>
        </div>
      </form>
    </section>`;
}

// ----- 4. Optional extras -----
function extra(id, iconName, title, desc, state, actions = "") {
  return `
    <section class="panel flex flex-col">
      <div class="flex items-center justify-between"><span class="panel-icon">${icon(iconName, 20)}</span><span data-state="${id}">${state}</span></div>
      <h3 class="integ-title">${title}</h3>
      <p class="integ-desc">${desc}</p>
      <p class="integ-result" data-result="${id}"></p>
      ${actions ? `<div class="flex flex-wrap gap-2 mt-auto pt-4">${actions}</div>` : ""}
    </section>`;
}

function pushState() {
  if (!pushSupported) return pill("off", "Sem suporte");
  if (Notification.permission === "granted") return pill("on", "Ativas");
  if (Notification.permission === "denied") return pill("warn", "Bloqueadas");
  return pill("off", "Desligadas");
}

function extrasStep() {
  const loading = pill("off", "…");
  return `
    <p class="page-sub mb-4">Tudo aqui é opcional: o JARVIS já funciona. Volte quando quiser pelo menu lateral, em Configuração.</p>
    <div class="grid gap-4 md:grid-cols-2">
      ${extra("voz", "mic", "Voz", "Toque no microfone e diga “JARVIS” seguido do pedido. As respostas são faladas; funciona melhor no Chrome.", pill("on", "Pronta"),
        `<button type="button" class="page-btn" data-setup="voz">Testar voz</button>`)}
      ${extra("push", "bell", "Notificações", "Os lembretes chegam na hora, mesmo com o app fechado. Precisa de HTTPS (ou localhost).", pushState(),
        pushSupported && Notification.permission === "default" ? `<button type="button" class="page-btn" data-setup="push">Ativar notificações</button>` : "")}
      ${extra("clima", "sunrise", "Briefing e clima", "Diga “bom dia” para ouvir clima, agenda, e-mails e notícias. Defina sua cidade e o que entra no resumo.", loading,
        `<button type="button" class="page-btn" data-page-open="briefing-config">Configurar briefing</button>`)}
      ${extra("email", "emails", "E-mail", "Triagem dos não lidos (remetente e assunto), só leitura. Usa uma senha de app do Gmail, Outlook, Yahoo ou iCloud.", loading,
        `<button type="button" class="page-btn" data-page-open="briefing-config" data-focus="email">Adicionar conta</button>`)}
      ${extra("apps", "link", "Aplicações externas", "O JARVIS pode se conectar a outros serviços, como o Strava (treinos) ou aplicações próprias via API, sempre só para leitura.", pill("off", "Opcional"),
        `<button type="button" class="page-btn" data-page-open="integracoes">Ver integrações</button>`)}
      ${extra("celular", "phone", "Instalar no celular", "No Chrome do celular, abra o JARVIS e toque em ⋮ → <b>Instalar app</b>. Para acessar fora de casa, ele precisa estar num servidor com HTTPS.", pill("off", "Opcional"))}
      ${extra("senha", "shield", "Senha de acesso", "Só é necessária se o JARVIS ficar acessível pela internet. Defina <code>JARVIS_PASSWORD</code> no .env e reinicie o servidor.",
        status.senha ? pill("on", "Ativa") : pill("off", "Sem senha"))}
      ${extra("tools", "terminal", "Comandos no computador", status.toolsMode === "full"
        ? "Modo completo: o JARVIS pode executar comandos, abrir apps e mexer em arquivos deste computador."
        : "Por segurança, o JARVIS não executa comandos neste computador. Para permitir, defina <code>TOOLS_MODE=full</code> no .env (só no seu PC, nunca num servidor).",
        status.toolsMode === "full" ? pill("on", "Completo") : pill("off", "Seguro"))}
    </div>
    <div class="flex items-center justify-between gap-2 mt-6">
      <button type="button" class="page-btn" data-step="2">${icon("back", 14)} Voltar</button>
      <button type="button" class="page-btn page-btn-primary" data-setup="finish">${status.done ? "Fechar" : "Concluir configuração"}</button>
    </div>`;
}

async function loadExtras() {
  try {
    const s = await (await fetch("/api/integrations")).json();
    if (!isCurrentPage("setup") || step !== 3) return;
    view.querySelector('[data-state="clima"]').innerHTML = s.clima.cidade ? pill("on", esc(s.clima.cidade)) : pill("off", "Sem cidade");
    view.querySelector('[data-state="email"]').innerHTML = s.email.contas ? pill("on", "Conectado") : pill("off", "Sem contas");
    if (s.strava.connected || s.finplan.configured) view.querySelector('[data-state="apps"]').innerHTML = pill("on", "Conectadas");
  } catch {}
}

const result = (name, text, ok) => {
  const el = view.querySelector(`[data-result="${name}"]`);
  if (!el) return;
  el.className = `integ-result ${ok === undefined ? "text-gray-400" : ok ? "text-emerald-400" : "text-red-400"}`;
  el.textContent = text;
};

// ----- Events -----
view.addEventListener("click", async (e) => {
  if (!isCurrentPage("setup")) return;
  const go = e.target.closest("[data-step]");
  if (go && !go.disabled) {
    step = Number(go.dataset.step);
    draw();
    view.scrollTop = 0;
    return;
  }
  const action = e.target.closest("[data-setup]")?.dataset.setup;
  if (action === "voz") {
    speak(`Olá${status.profile.nome ? `, ${status.profile.nome}` : ""}. Todos os sistemas operacionais.`);
  } else if (action === "push") {
    // Must run inside the tap: Android only shows the permission dialog for a user gesture
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      try {
        await subscribePush();
        fetch("/api/push/test", { method: "POST" }).catch(() => {});
        result("push", "Pronto! Uma notificação de teste foi enviada.", true);
      } catch {
        result("push", "Permissão dada, mas não consegui registrar este aparelho.", false);
      }
    }
    view.querySelector('[data-state="push"]').innerHTML = pushState();
    e.target.closest("[data-setup]").remove();
  } else if (action === "finish") {
    const wasDone = status.done;
    const res = await fetch("/api/setup/done", { method: "POST" });
    if (!res.ok) return;
    // First time: reload so voice, briefing and the dashboard pick up the new key and name
    if (!wasDone) location.reload();
    else closePage();
  }
});

view.addEventListener("submit", async (e) => {
  if (!isCurrentPage("setup")) return;
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;

  if (form.id === "gemini-form") {
    result("gemini", "Testando a chave…");
    const res = await fetch("/api/setup/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: form.key.value }),
    });
    const r = await res.json().catch(() => ({}));
    btn.disabled = false;
    if (!res.ok) return result("gemini", r.error || "Não consegui salvar a chave.", false);
    const replaced = status.gemini.configured;
    await loadStatus();
    if (!replaced) step = 2; // first key: move on; a replacement stays here to confirm
    draw();
    if (replaced) result("gemini", `Chave trocada. Em uso agora: ${status.gemini.hint}`, true);
  } else if (form.id === "profile-form") {
    const res = await fetch("/api/setup/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: form.nome.value, sobre: form.sobre.value }),
    });
    const r = await res.json().catch(() => ({}));
    btn.disabled = false;
    if (!res.ok) return result("profile", r.error || "Não consegui salvar.", false);
    await loadStatus();
    step = 3;
    draw();
  }
});

registerPage("setup", renderSetup);

// First run: open the guide by itself until it's finished
(async () => {
  try {
    if (!(await loadStatus()).done) openPage("setup");
  } catch {}
})();
