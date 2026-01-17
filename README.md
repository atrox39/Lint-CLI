# lint-cli

AI-powered command-line assistant for local development.
It connects to a local OpenWebUI / Ollama-compatible API and can read, write, and list files in your current project, acting like a coding partner that lives inside your terminal.

## Features

- Interactive REPL-style CLI (`lint-cli (model) >` prompt)
- Talks to a local model via HTTP
- Can read, write, and list files in your project (with safe path checks)
- Can search text, replace in files, and run commands (with confirmation)
- Persists conversation state and context between runs
- Provides a lightweight developer workflow similar to Codex CLI / Gemini CLI

## Requirements

- Node.js 18+ (ES modules, `node:` imports)
- A running HTTP API compatible with OpenWebUI / Ollama.
  - Default: `http://localhost:11434/ollama/api/chat`
  - Override with `OLLAMA_API` or `OPENWEBUI_API`

Optionally, you can provide an API key via `OLLAMA_API_KEY`. When present, it is sent as:

```http
Authorization: Bearer <OLLAMA_API_KEY>
```

## Installation

Clone this repository and install dependencies:

```bash
npm install
```

You can run the CLI locally without installing it globally:

```bash
npm start
# or
node bin/lint-cli.js
```

If you want to install it globally (so you can run `lint-cli` from anywhere), from the project root:

```bash
npm install -g .
```

This exposes two commands:

- `lint-cli`
- `lc`

Both point to `bin/lint-cli.js`.

## Configuration

Create a `.env` file in the project where you run the CLI (not necessarily in this repo) to override defaults:

```env
OLLAMA_API=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
OLLAMA_API_KEY=your-api-key-if-needed
```

If `OLLAMA_API` is not set, the CLI falls back to `http://localhost:11434/ollama/api/chat`.
You can also set `OPENWEBUI_API` if you prefer that name.

## Usage

From a project directory where you want the assistant to work:

```bash
lint-cli
# or
lc
```

You will see a prompt like:

```text
lint-cli (qwen3:8b) >
```

Then you can type natural-language instructions, for example:

- "create a basic index.html landing page"
- "add a unit test for function X in file Y"
- "refactor this module to use async/await"

The assistant can:

- Read files in the current project
- Write / overwrite files (after asking for confirmation in the CLI)
- List files and directories
- Search text across files
- Replace text in files
- Run commands (after asking for confirmation in the CLI)

Commands (slash or colon prefix):

- `/help` to show available commands
- `/ls [path]` to list files
- `/pwd` to show the current directory
- `/model [name]` to show or set model
- `/api [url]` to show or set API base or full chat URL
- `/system [text|reset]` to show or set system prompt override
- `/memory [on|off|clear|path]` to manage memory
- `/set k=v ...` to set multiple settings (model, api, memory)
- `/search <pattern> [path]` to search text in files
- `/run <command>` to run a shell command (with confirmation)
- `/clear` to clear the screen
- `/exit` to quit the CLI

## State and memory

The CLI stores conversation history and context in a project-specific directory:

- A hidden folder named `.lint-cli/` is created in the directory where you run the command.
- Inside it, a `memory.json` file keeps the message history so the assistant can preserve context between runs.
- A `config.json` file stores local settings (model, API URL, memory toggle, system prompt override).

You can safely delete `.lint-cli/` if you want to reset the assistant's memory for that project.

## Project structure

- `bin/lint-cli.js` - main entry point for the CLI (REPL loop, tool execution, spinner, memory handling)
- `src/core/openwebui.js` - HTTP client to the OpenWebUI / Ollama-compatible API
- `src/core/system.js` - system prompt that defines the assistant's behavior inside the CLI
- `src/core/tools.js` - implementations of `read_file`, `write_file`, `list_files`, and `current_dir`
- `src/core/tool.schema.js` - tool schema definitions passed to the model
- `.lint-cli/` (runtime, per-project) - persisted conversation state (not committed)

## License

ISC

## Roadmap

See `ROADMAP.md` for pending items and possible future features.

## Pendientes

- Modo batch por stdin para automatizar comandos
- Flags de aprobacion (por ejemplo `--yes`) para ejecuciones no interactivas
- Streaming de respuestas del modelo
- Resumen de memoria y recorte inteligente de historial
- Modo read-only para bloquear escrituras/ejecucion de comandos
- Tests basicos para comandos internos y herramientas
- Reintentos con backoff y mejores mensajes de error HTTP
- Limites por herramienta (timeout, max output) y protecciones de contexto
- Vista previa de diffs antes de aplicar cambios grandes
- Perfilado de modelos (fast/balanced/quality) y presets de temperatura/top-p
- Ignorar rutas por configuracion (archivo tipo `.lintcliignore`)
