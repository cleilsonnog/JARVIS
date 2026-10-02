const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { stmts } = require("./database");
const finplan = require("./finplan");
const { getBriefing } = require("./briefing");

const functionDeclarations = [
  {
    name: "execute_command",
    description: "Executa um comando no terminal Linux.",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "O comando bash" } },
      required: ["command"],
    },
  },
  {
    name: "open_application",
    description: "Abre um aplicativo no sistema.",
    parameters: {
      type: "object",
      properties: {
        app_name: { type: "string", description: "Nome do aplicativo" },
        args: { type: "string", description: "Argumentos opcionais" },
      },
      required: ["app_name"],
    },
  },
  {
    name: "read_file",
    description: "Lê o conteúdo de um arquivo do sistema.",
    parameters: {
      type: "object",
      properties: { file_path: { type: "string", description: "Caminho do arquivo" } },
      required: ["file_path"],
    },
  },
  {
    name: "write_file",
    description: "Cria ou sobrescreve um arquivo.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Caminho do arquivo" },
        content: { type: "string", description: "Conteúdo a ser escrito" },
      },
      required: ["file_path", "content"],
    },
  },
  {
    name: "list_files",
    description: "Lista arquivos e pastas de um diretório.",
    parameters: {
      type: "object",
      properties: { directory: { type: "string", description: "Caminho do diretório" } },
      required: [],
    },
  },
  {
    name: "create_reminder",
    description: "Cria um lembrete/alarme para uma data e hora específica. Use quando o usuário pedir para lembrar algo.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Texto do lembrete" },
        remind_at: { type: "string", description: "Data e hora no formato YYYY-MM-DD HH:MM" },
      },
      required: ["text", "remind_at"],
    },
  },
  {
    name: "list_reminders",
    description: "Lista todos os lembretes pendentes.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "save_memory",
    description: "Salva uma informação na memória persistente do JARVIS. Use para lembrar preferências, fatos sobre o usuário, configurações, ou qualquer informação que deva persistir entre conversas. Exemplos: nome, preferências, projetos, aniversários, etc.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Identificador curto da memória (ex: 'linguagem_preferida', 'aniversario', 'projeto_atual')" },
        value: { type: "string", description: "O conteúdo da memória" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "recall_memories",
    description: "Busca memórias salvas. Sem parâmetro retorna todas. Com 'search' filtra por palavra-chave.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Palavra-chave para buscar (opcional)" },
      },
      required: [],
    },
  },
  {
    name: "delete_memory",
    description: "Remove uma memória salva pelo seu identificador (key).",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Identificador da memória a remover" },
      },
      required: ["key"],
    },
  },
];

// ===== Tool access mode =====
// TOOLS_MODE=full  -> local machine: shell, apps and the whole filesystem (blocklist below applies)
// TOOLS_MODE=safe  -> default, for internet-facing servers: no shell/apps, files confined to FILES_ROOT.
// Safe is the default so a server that forgets to set the variable is never left open.
const TOOLS_MODE = process.env.TOOLS_MODE === "full" ? "full" : "safe";
const FILES_ROOT = TOOLS_MODE === "full"
  ? os.homedir()
  : path.resolve(process.env.JARVIS_FILES_DIR || path.join(os.homedir(), "jarvis-files"));
const SAFE_DISABLED = new Set(["execute_command", "open_application"]);

if (TOOLS_MODE === "safe") fs.mkdirSync(FILES_ROOT, { recursive: true });

functionDeclarations.push({
  name: "briefing_do_dia",
  description:
    "Resumo do dia do usuário em uma chamada: data/hora, clima da cidade dele (agora e previsão de hoje), " +
    "lembretes atrasados / de hoje / próximos, saldo do mês e faturas vencendo em 7 dias (FinPlan) e o versículo do dia (NVI). " +
    "Use quando ele disser bom dia, pedir o briefing, o resumo do dia ou 'como está meu dia'.",
  parameters: { type: "OBJECT", properties: {} },
});

// Read-only finance tool, offered only when the FinPlan integration is configured
if (finplan.isConfigured()) {
  functionDeclarations.push({
    name: "consultar_financas",
    description:
      "Consulta (somente leitura) as finanças do usuário no FinPlan: saldo do mês (receitas - despesas - investimentos), " +
      "totais do mês, cartões de crédito com fatura do mês e do próximo mês (valor, status OPEN/CLOSED/PAID/OVERDUE, " +
      "fechamento, vencimento), limite e limite disponível, e últimas transações. " +
      "Use para perguntas sobre saldo, fatura, cartão, limite, gastos ou receitas.",
    parameters: {
      type: "OBJECT",
      properties: {
        mes: { type: "INTEGER", description: "Mês (1-12) de referência; omita para o mês atual" },
      },
    },
  });
}

// Declarations actually offered to the model (disabled tools are not even advertised)
const activeDeclarations = functionDeclarations.filter(
  (d) => TOOLS_MODE === "full" || !SAFE_DISABLED.has(d.name)
);

// Resolve a model-supplied path. In safe mode it must stay inside FILES_ROOT, symlinks included.
function resolvePath(p, { forWrite = false } = {}) {
  const abs = path.isAbsolute(p) ? path.resolve(p) : path.resolve(FILES_ROOT, p);
  if (TOOLS_MODE === "full") return abs;

  const root = fs.realpathSync(FILES_ROOT);
  // For writes the file may not exist yet: check the closest existing ancestor
  let probe = abs;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  const real = fs.realpathSync(probe);
  if (real !== root && !real.startsWith(root + path.sep)) {
    throw new Error(`Acesso negado: neste servidor só posso ${forWrite ? "escrever" : "acessar"} arquivos dentro de ${FILES_ROOT}`);
  }
  return abs;
}

function listDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.length === 0) return "(pasta vazia)";
  return entries
    .map((e) => {
      if (e.isDirectory()) return `[pasta] ${e.name}/`;
      let size = "";
      try { size = ` (${fs.statSync(path.join(dir, e.name)).size} bytes)`; } catch {}
      return `${e.name}${size}`;
    })
    .join("\n");
}

const BLOCKED_PATTERNS = [
  /rm\s+(-rf?|--recursive)\s+\//, /mkfs/, /dd\s+if=/,
  /:\(\)\{.*\}/, /chmod\s+777\s+\//, /shutdown/, /reboot/, /init\s+0/,
];

function isCommandSafe(cmd) {
  return !BLOCKED_PATTERNS.some((p) => p.test(cmd));
}

function executeToolCall(name, args) {
  if (TOOLS_MODE === "safe" && SAFE_DISABLED.has(name)) {
    return { error: "Esta ferramenta está desativada neste servidor por segurança." };
  }
  try {
    switch (name) {
      case "execute_command": {
        if (!isCommandSafe(args.command)) return { error: "Comando bloqueado por segurança." };
        const output = execSync(args.command, {
          encoding: "utf-8", timeout: 15000, cwd: os.homedir(), maxBuffer: 1024 * 512,
        });
        return { output: output.slice(0, 5000) || "(executado sem saída)" };
      }
      case "open_application": {
        const cmd = args.args
          ? `nohup ${args.app_name} ${args.args} > /dev/null 2>&1 &`
          : `nohup ${args.app_name} > /dev/null 2>&1 &`;
        execSync(cmd, { shell: true, cwd: os.homedir() });
        return { output: `${args.app_name} aberto.` };
      }
      case "read_file": {
        const fp = resolvePath(args.file_path);
        return { output: fs.readFileSync(fp, "utf-8").slice(0, 10000) };
      }
      case "write_file": {
        const fp = resolvePath(args.file_path, { forWrite: true });
        const dir = path.dirname(fp);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fp, args.content, "utf-8");
        return { output: `Arquivo ${fp} salvo.` };
      }
      case "list_files": {
        const dir = resolvePath(args.directory || ".");
        return { output: listDir(dir).slice(0, 5000) };
      }
      case "briefing_do_dia":
        return getBriefing().catch((err) => ({ error: err.message }));
      case "consultar_financas":
        // Async: the caller awaits it; errors become a tool error instead of a rejection
        return finplan.getFinancialSummary(args.mes).catch((err) => ({ error: err.message }));
      case "create_reminder": {
        stmts.addReminder.run(args.text, args.remind_at);
        return { output: `Lembrete criado: "${args.text}" para ${args.remind_at}` };
      }
      case "list_reminders": {
        const reminders = stmts.getReminders.all();
        if (reminders.length === 0) return { output: "Nenhum lembrete pendente." };
        return {
          output: reminders.map((r) => `[${r.id}] ${r.remind_at} - ${r.text}`).join("\n"),
        };
      }
      case "save_memory": {
        stmts.saveMemory.run(args.key, args.value);
        return { output: `Memória salva: "${args.key}" = "${args.value}"` };
      }
      case "recall_memories": {
        let memories;
        if (args.search) {
          const q = `%${args.search}%`;
          memories = stmts.searchMemories.all(q, q);
        } else {
          memories = stmts.getAllMemories.all();
        }
        if (memories.length === 0) return { output: "Nenhuma memória encontrada." };
        return {
          output: memories.map((m) => `[${m.key}]: ${m.value}`).join("\n"),
        };
      }
      case "delete_memory": {
        const existing = stmts.getMemory.get(args.key);
        if (!existing) return { output: `Memória "${args.key}" não encontrada.` };
        stmts.deleteMemory.run(args.key);
        return { output: `Memória "${args.key}" removida.` };
      }
      default:
        return { error: `Ferramenta desconhecida: ${name}` };
    }
  } catch (err) {
    return { error: err.message.slice(0, 1000) };
  }
}

module.exports = { functionDeclarations: activeDeclarations, executeToolCall, TOOLS_MODE, FILES_ROOT };
