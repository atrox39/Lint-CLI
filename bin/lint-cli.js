#!/usr/bin/env node
import 'dotenv/config';
import readline from 'readline';
import fs from 'node:fs';
import path from 'node:path';
import { chatCompletion } from '../src/core/openwebui.js';
import { SYSTEM_PROMPT } from '../src/core/system.js';
import {
  loadMemory,
  saveMemory,
  clearMemory,
  getMemoryPath,
} from '../src/core/chat.js';
import * as tools from '../src/core/tools.js';

const PROJECT_MARKER = '.lint-cli';
const projectDir = path.join(process.cwd(), PROJECT_MARKER);
const CONFIG_FILE = path.join(projectDir, 'config.json');
const MAX_HISTORY = 80;
const SPINNER_FRAMES = ['|', '/', '-', '\\'];

let spinnerInterval = null;
let spinnerIndex = 0;

function startSpinner(text = 'thinking') {
  if (spinnerInterval) return;
  process.stdout.write('\n');
  spinnerInterval = setInterval(() => {
    const frame = SPINNER_FRAMES[spinnerIndex++ % SPINNER_FRAMES.length];
    process.stdout.write(`\r${frame} ${text}...`);
  }, 80);
}

function stopSpinner() {
  if (!spinnerInterval) return;
  clearInterval(spinnerInterval);
  spinnerInterval = null;
  spinnerIndex = 0;
  process.stdout.write('\r\x1b[K');
}

function confirm(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      const a = answer.trim().toLowerCase();
      resolve(a === 'y' || a === 'yes');
    });
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--model' || arg === '-m') {
      out.model = argv[i + 1];
      i += 1;
    } else if (arg === '--api' || arg === '--base-url') {
      out.apiUrl = argv[i + 1];
      i += 1;
    } else if (arg === '--no-memory') {
      out.memory = false;
    } else if (arg === '--memory') {
      out.memory = true;
    }
  }
  return out;
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveConfig(config) {
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function normalizeResponse(response) {
  if (
    response?.content &&
    response.content.trim().startsWith('{') &&
    response.content.includes('"name"') &&
    response.content.includes('"parameters"')
  ) {
    const fallback = extractToolFromText(response.content);
    if (fallback) {
      return { tool_calls: [fallback] };
    }
  }
  return response;
}

function extractToolFromText(content) {
  if (!content) return null;
  const trimmed = content.trim();
  const match = trimmed.match(/^\s*\{[\s\S]*\}\s*$/);
  if (!match) return null;

  try {
    const obj = JSON.parse(match[0]);
    if (obj?.name && obj?.parameters && typeof obj.parameters === 'object') {
      return {
        id: 'call_text_fallback',
        function: {
          name: obj.name,
          parameters: obj.parameters,
        },
      };
    }
  } catch {}
  return null;
}

function parseToolArgs(call) {
  const fn = call?.function || {};
  if (fn.parameters && typeof fn.parameters === 'object') return fn.parameters;
  const a = fn.arguments;
  if (!a) return {};
  if (typeof a === 'string') {
    try {
      return JSON.parse(a);
    } catch {
      return {};
    }
  }
  if (typeof a === 'object') return a;
  return {};
}

function formatToolResult(result) {
  if (Array.isArray(result)) return result.join('\n');
  if (typeof result === 'object') return JSON.stringify(result, null, 2);
  return String(result);
}

function printBanner(state) {
  const apiLabel = state.apiUrl ? state.apiUrl : 'default';
  console.log('lint-cli');
  console.log(`Model: ${state.model}`);
  console.log(`API: ${apiLabel}`);
  console.log('Type /help for commands.\n');
}

function printHelp() {
  console.log('Commands:');
  console.log('  /help                Show this help');
  console.log('  /exit                Exit the CLI');
  console.log('  /ls [path]            List files');
  console.log('  /pwd                 Show current directory');
  console.log('  /model [name]         Show or set model');
  console.log('  /api [url]            Show or set API base or full chat URL');
  console.log('  /system [text|reset]  Show or set system prompt override');
  console.log('  /memory [on|off|clear|path]  Manage memory');
  console.log('  /set k=v [...]        Set model/api/memory in one command');
  console.log('  /search <pattern> [path]  Search text in files');
  console.log('  /run <command>        Run a shell command (confirm first)');
  console.log('  /clear               Clear the screen');
  console.log('');
}

function parseCommand(input) {
  const trimmed = input.trim();
  if (!trimmed) return { type: 'empty' };
  if (trimmed === 'exit' || trimmed === 'quit') {
    return { type: 'command', name: 'exit', args: '' };
  }
  if (trimmed === 'ls') {
    return { type: 'command', name: 'ls', args: '' };
  }
  if (trimmed.startsWith('/') || trimmed.startsWith(':')) {
    const raw = trimmed.slice(1);
    const [name, ...rest] = raw.split(' ');
    return { type: 'command', name: name.toLowerCase(), args: rest.join(' ').trim() };
  }
  return { type: 'chat', text: trimmed };
}

function trimHistory(all) {
  const system = all.find((m) => m.role === 'system');
  const rest = all.filter((m) => m.role !== 'system');
  const trimmed = rest.slice(-MAX_HISTORY);
  return system ? [system, ...trimmed] : trimmed;
}

if (!fs.existsSync(projectDir)) {
  fs.mkdirSync(projectDir, { recursive: true });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on('SIGINT', () => {
  console.log('\nExiting.');
  process.exit(0);
});
rl.on('close', () => {
  process.exit(0);
});

const args = parseArgs(process.argv.slice(2));
let config = loadConfig();

const state = {
  model:
    args.model ||
    process.env.OLLAMA_MODEL ||
    config.model ||
    'qwen3:8b',
  apiUrl:
    args.apiUrl ||
    process.env.OLLAMA_API ||
    process.env.OPENWEBUI_API ||
    config.api_url ||
    '',
  memoryEnabled:
    typeof args.memory === 'boolean'
      ? args.memory
      : config.memory_enabled !== false,
  systemPrompt: config.system_prompt || SYSTEM_PROMPT,
};

const savedMessages = state.memoryEnabled ? await loadMemory() : [];
let messages = [
  { role: 'system', content: state.systemPrompt },
  ...savedMessages,
];

printBanner(state);

async function handleCommand(cmd) {
  if (cmd.name === 'help') {
    printHelp();
    return;
  }

  if (cmd.name === 'exit' || cmd.name === 'quit') {
    process.exit(0);
  }

  if (cmd.name === 'clear') {
    console.clear();
    return;
  }

  if (cmd.name === 'pwd') {
    const result = await tools.current_dir();
    console.log(result + '\n');
    return;
  }

  if (cmd.name === 'ls') {
    const result = await tools.list_files(cmd.args || '.');
    console.log(formatToolResult(result) + '\n');
    return;
  }

  if (cmd.name === 'model') {
    if (!cmd.args) {
      console.log(`Model: ${state.model}\n`);
      return;
    }
    state.model = cmd.args;
    config = { ...config, model: state.model };
    saveConfig(config);
    console.log(`Model set to: ${state.model}\n`);
    return;
  }

  if (cmd.name === 'api') {
    if (!cmd.args) {
      console.log(`API: ${state.apiUrl || 'default'}\n`);
      return;
    }
    state.apiUrl = cmd.args;
    config = { ...config, api_url: state.apiUrl };
    saveConfig(config);
    console.log(`API set to: ${state.apiUrl}\n`);
    return;
  }

  if (cmd.name === 'system') {
    if (!cmd.args) {
      console.log(`System prompt: ${state.systemPrompt}\n`);
      return;
    }
    if (cmd.args === 'reset') {
      state.systemPrompt = SYSTEM_PROMPT;
      config = { ...config };
      delete config.system_prompt;
      saveConfig(config);
      messages = [{ role: 'system', content: state.systemPrompt }];
      console.log('System prompt reset.\n');
      return;
    }
    state.systemPrompt = cmd.args;
    config = { ...config, system_prompt: state.systemPrompt };
    saveConfig(config);
    messages = [{ role: 'system', content: state.systemPrompt }];
    console.log('System prompt updated.\n');
    return;
  }

  if (cmd.name === 'memory') {
    const arg = (cmd.args || '').toLowerCase();
    if (!cmd.args || arg === 'path') {
      console.log(`Memory: ${state.memoryEnabled ? 'on' : 'off'}`);
      console.log(`Path: ${getMemoryPath()}\n`);
      return;
    }
    if (arg === 'on' || arg === 'off') {
      state.memoryEnabled = arg === 'on';
      config = { ...config, memory_enabled: state.memoryEnabled };
      saveConfig(config);
      console.log(`Memory ${state.memoryEnabled ? 'enabled' : 'disabled'}.\n`);
      return;
    }
    if (arg === 'clear') {
      const ok = await confirm('Clear memory? (y/n): ');
      if (!ok) {
        console.log('Cancelled.\n');
        return;
      }
      await clearMemory();
      messages = [{ role: 'system', content: state.systemPrompt }];
      console.log('Memory cleared.\n');
      return;
    }
  }

  if (cmd.name === 'search') {
    const [pattern, ...rest] = cmd.args.split(' ').filter(Boolean);
    const searchPath = rest.join(' ') || '.';
    if (!pattern) {
      console.log('Usage: /search <pattern> [path]\n');
      return;
    }
    const result = await tools.search_text(pattern, searchPath);
    console.log(formatToolResult(result) + '\n');
    return;
  }

  if (cmd.name === 'run') {
    if (!cmd.args) {
      console.log('Usage: /run <command>\n');
      return;
    }
    console.log(`\nThe assistant wants to run:\n  ${cmd.args}\n`);
    const ok = await confirm('Proceed? (y/n): ');
    if (!ok) {
      console.log('Cancelled.\n');
      return;
    }
    const result = await tools.run_command(cmd.args);
    console.log(formatToolResult(result) + '\n');
    return;
  }

  if (cmd.name === 'set') {
    if (!cmd.args) {
      console.log('Usage: /set model=... api=... memory=on|off\n');
      return;
    }
    const parts = cmd.args.split(' ').filter(Boolean);
    let changed = false;
    for (const part of parts) {
      const [rawKey, ...rest] = part.split('=');
      const key = rawKey.toLowerCase();
      const value = rest.join('=').trim();
      if (!key || !value) continue;
      if (key === 'model') {
        state.model = value;
        config = { ...config, model: state.model };
        changed = true;
      } else if (key === 'api') {
        state.apiUrl = value;
        config = { ...config, api_url: state.apiUrl };
        changed = true;
      } else if (key === 'memory') {
        if (value === 'on' || value === 'off') {
          state.memoryEnabled = value === 'on';
          config = { ...config, memory_enabled: state.memoryEnabled };
          changed = true;
        }
      }
    }
    if (changed) {
      saveConfig(config);
      console.log('Settings updated.\n');
      return;
    }
    console.log('No valid settings provided. Use model=, api=, memory=on|off.\n');
    return;
  }

  console.log('Unknown command. Type /help for commands.\n');
}

async function loop() {
  const prompt = `lint-cli (${state.model}) > `;
  if (rl.closed) return;
  rl.question(prompt, async (input) => {
    if (input === undefined) {
      rl.close();
      return;
    }
    const cmd = parseCommand(input);
    if (cmd.type === 'empty') {
      loop();
      return;
    }
    if (cmd.type === 'command') {
      await handleCommand(cmd);
      loop();
      return;
    }

    messages.push({ role: 'user', content: cmd.text });

    startSpinner('thinking');
    let response = await chatCompletion(messages, {
      model: state.model,
      apiUrl: state.apiUrl,
    });
    stopSpinner();
    response = normalizeResponse(response);

    while (true) {
      let toolCalls = response?.tool_calls;
      if ((!toolCalls || toolCalls.length === 0) && response?.content) {
        const fallbackCall = extractToolFromText(response.content);
        if (fallbackCall) toolCalls = [fallbackCall];
      }

      if (!toolCalls || toolCalls.length === 0) break;

      for (const call of toolCalls) {
        const toolName = call?.function?.name;
        if (!toolName || !tools[toolName]) {
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: `ERROR: Unknown tool "${toolName}"`,
          });
          continue;
        }

        const argsObj = parseToolArgs(call);
        let result;
        try {
          if (toolName === 'write_file') {
            console.log(`\nThe assistant wants to write:\n  ${argsObj.path}\n`);
            const ok = await confirm('Proceed? (y/n): ');
            if (!ok) {
              result = 'CANCELLED: write_file aborted by user';
            } else {
              result = await tools.write_file(argsObj.path, argsObj.content);
            }
          } else if (toolName === 'replace_in_file') {
            console.log(`\nThe assistant wants to edit:\n  ${argsObj.path}\n`);
            const ok = await confirm('Proceed? (y/n): ');
            if (!ok) {
              result = 'CANCELLED: replace_in_file aborted by user';
            } else {
              result = await tools.replace_in_file(
                argsObj.path,
                argsObj.search,
                argsObj.replace,
                argsObj.all,
                argsObj.regex
              );
            }
          } else if (toolName === 'read_file') {
            result = await tools.read_file(
              argsObj.path,
              argsObj.start_line,
              argsObj.end_line
            );
          } else if (toolName === 'list_files') {
            result = await tools.list_files(
              argsObj.path,
              argsObj.recursive,
              argsObj.max_depth
            );
          } else if (toolName === 'search_text') {
            result = await tools.search_text(
              argsObj.pattern,
              argsObj.path,
              argsObj.regex,
              argsObj.case_sensitive,
              argsObj.max_results
            );
          } else if (toolName === 'run_command') {
            console.log(`\nThe assistant wants to run:\n  ${argsObj.command}\n`);
            const ok = await confirm('Proceed? (y/n): ');
            if (!ok) {
              result = 'CANCELLED: run_command aborted by user';
            } else {
              result = await tools.run_command(
                argsObj.command,
                argsObj.args,
                argsObj.cwd
              );
            }
          } else if (toolName === 'current_dir') {
            result = await tools.current_dir();
          } else {
            result = `ERROR: Tool "${toolName}" not implemented`;
          }
        } catch (err) {
          result = `ERROR: ${err.message}`;
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        });
        console.log(`\n[tool:${toolName}]\n${formatToolResult(result)}\n`);
      }

      startSpinner('thinking');
      response = await chatCompletion(messages, {
        model: state.model,
        apiUrl: state.apiUrl,
      });
      stopSpinner();
      response = normalizeResponse(response);
    }

    if (response?.content) {
      console.log(response.content.trim() + '\n');
      messages.push({ role: 'assistant', content: response.content });
    }

    if (state.memoryEnabled) {
      messages = trimHistory(messages);
      const memory = messages.filter((m) => m.role !== 'system');
      await saveMemory(memory);
    }

    loop();
  });
}

loop();
