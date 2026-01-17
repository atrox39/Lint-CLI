import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';

const ROOT_DIR = path.resolve(process.cwd());
const MAX_READ_BYTES = 512 * 1024;
const DEFAULT_IGNORES = new Set(['.git', 'node_modules', '.lint-cli', 'dist', 'build']);
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

function resolvePathSafe(p) {
  const fullPath = path.resolve(ROOT_DIR, p);
  const rootLower = ROOT_DIR.toLowerCase();
  const fullLower = fullPath.toLowerCase();
  if (fullLower === rootLower || fullLower.startsWith(rootLower + path.sep)) {
    return { fullPath };
  }
  return { error: `ERROR: Path outside project: ${p}` };
}

async function statSafe(p) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

async function readFileRange(fullPath, startLine, endLine) {
  const start = Math.max(1, Number(startLine) || 1);
  const end =
    Number(endLine) && Number(endLine) >= start
      ? Number(endLine)
      : start + 200;

  const stream = fsSync.createReadStream(fullPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const lines = [];
  let lineNo = 0;

  for await (const line of rl) {
    lineNo += 1;
    if (lineNo < start) continue;
    if (lineNo > end) break;
    lines.push(line);
  }

  rl.close();
  stream.close();

  return lines.join('\n');
}

async function isTextFile(fullPath) {
  try {
    const fd = await fs.open(fullPath, 'r');
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await fd.read(buffer, 0, buffer.length, 0);
    await fd.close();
    for (let i = 0; i < bytesRead; i += 1) {
      if (buffer[i] === 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function walkForSearch(basePath, currentPath, out, options) {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    if (DEFAULT_IGNORES.has(entry.name)) continue;
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await walkForSearch(basePath, entryPath, out, options);
      if (out.length >= options.maxResults) return;
      continue;
    }
    const stat = await statSafe(entryPath);
    if (!stat || !stat.isFile() || stat.size > MAX_READ_BYTES) continue;
    if (!(await isTextFile(entryPath))) continue;
    const content = await fs.readFile(entryPath, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const matched = options.regex
        ? options.regex.test(line)
        : options.caseSensitive
          ? line.includes(options.pattern)
          : line.toLowerCase().includes(options.pattern.toLowerCase());
      if (matched) {
        const rel = path.relative(basePath, entryPath);
        out.push(`${rel}:${i + 1}: ${line}`);
        if (out.length >= options.maxResults) return;
      }
    }
  }
}

export async function current_dir() {
  return process.cwd();
}

export async function read_file(p, start_line, end_line) {
  const resolved = resolvePathSafe(p);
  if (resolved.error) return resolved.error;

  const stat = await statSafe(resolved.fullPath);
  if (!stat) return `ERROR: File not found: ${p}`;
  if (!stat.isFile()) return `ERROR: Path is not a file: ${p}`;

  const wantsRange = Number.isFinite(Number(start_line)) || Number.isFinite(Number(end_line));
  if (stat.size > MAX_READ_BYTES && !wantsRange) {
    return `ERROR: File is too large to read at once (${stat.size} bytes). Use start_line/end_line.`;
  }

  if (wantsRange || stat.size > MAX_READ_BYTES) {
    return readFileRange(resolved.fullPath, start_line, end_line);
  }

  return fs.readFile(resolved.fullPath, 'utf-8');
}

export async function write_file(p, content) {
  const resolved = resolvePathSafe(p);
  if (resolved.error) return resolved.error;

  const dir = path.dirname(resolved.fullPath);

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(resolved.fullPath, content, 'utf-8');
    return `OK: File written -> ${p}`;
  } catch (err) {
    return `ERROR: Cannot write file ${p}: ${err.message}`;
  }
}

async function walkDir(basePath, currentPath, depth, maxDepth, out) {
  if (depth > maxDepth) return;
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);
    const relPath = path.relative(basePath, entryPath) + (entry.isDirectory() ? '/' : '');
    out.push(relPath);
    if (entry.isDirectory()) {
      await walkDir(basePath, entryPath, depth + 1, maxDepth, out);
    }
  }
}

export async function list_files(p = '.', recursive = false, max_depth = 2) {
  const resolved = resolvePathSafe(p);
  if (resolved.error) return resolved.error;

  const stat = await statSafe(resolved.fullPath);

  if (!stat) return `ERROR: Directory not found: ${p}`;
  if (!stat.isDirectory()) return `ERROR: Path is not a directory: ${p}`;

  const depth = Math.max(0, Number(max_depth) || 0);
  if (!recursive || depth === 0) {
    const files = await fs.readdir(resolved.fullPath, { withFileTypes: true });
    return files.map((f) => (f.isDirectory() ? `${f.name}/` : f.name));
  }

  const out = [];
  await walkDir(resolved.fullPath, resolved.fullPath, 1, depth, out);
  return out.sort();
}

export async function search_text(
  pattern,
  p = '.',
  regex = false,
  case_sensitive = false,
  max_results = 50
) {
  if (!pattern) return 'ERROR: pattern is required';
  const resolved = resolvePathSafe(p);
  if (resolved.error) return resolved.error;

  const rgArgs = [
    '--line-number',
    '--column',
    '--color',
    'never',
    '--no-heading',
  ];
  if (!case_sensitive) rgArgs.push('-i');
  if (!regex) rgArgs.push('-F');
  rgArgs.push('--max-count', String(max_results));
  rgArgs.push(pattern);
  rgArgs.push(resolved.fullPath);

  try {
    const { stdout } = await execFileAsync('rg', rgArgs, {
      cwd: ROOT_DIR,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim() ? stdout.trim().split('\n') : [];
  } catch (err) {
    if (err.code === 1) {
      return [];
    }
    if (err.code !== 'ENOENT') {
      const output = err.stdout || '';
      return output.trim() ? output.trim().split('\n') : `ERROR: ${err.message}`;
    }
  }

  const out = [];
  let regexObj = null;
  if (regex) {
    try {
      regexObj = new RegExp(pattern, case_sensitive ? '' : 'i');
    } catch (err) {
      return `ERROR: Invalid regex: ${err.message}`;
    }
  }
  await walkForSearch(resolved.fullPath, resolved.fullPath, out, {
    pattern,
    regex: regexObj,
    caseSensitive: case_sensitive,
    maxResults: Math.max(1, Number(max_results) || 50),
  });
  return out;
}

export async function replace_in_file(
  p,
  search,
  replace,
  all = true,
  regex = false
) {
  if (!search) return 'ERROR: search is required';
  const resolved = resolvePathSafe(p);
  if (resolved.error) return resolved.error;

  const stat = await statSafe(resolved.fullPath);
  if (!stat) return `ERROR: File not found: ${p}`;
  if (!stat.isFile()) return `ERROR: Path is not a file: ${p}`;

  const content = await fs.readFile(resolved.fullPath, 'utf-8');
  let next;
  if (regex) {
    const flags = all ? 'g' : '';
    const re = new RegExp(search, flags);
    next = content.replace(re, replace);
  } else if (all) {
    next = content.split(search).join(replace);
  } else {
    next = content.replace(search, replace);
  }

  if (next === content) return 'OK: No changes made';
  await fs.writeFile(resolved.fullPath, next, 'utf-8');
  return `OK: Replaced in ${p}`;
}

export async function run_command(command, args = [], cwd = '.') {
  if (!command) return 'ERROR: command is required';
  const resolved = resolvePathSafe(cwd || '.');
  if (resolved.error) return resolved.error;

  const isArrayArgs = Array.isArray(args) && args.length > 0;
  if (isArrayArgs) {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: resolved.fullPath,
      maxBuffer: 2 * 1024 * 1024,
    });
    return [stdout, stderr].filter(Boolean).join('\n');
  }

  const { stdout, stderr } = await execAsync(command, {
    cwd: resolved.fullPath,
    maxBuffer: 2 * 1024 * 1024,
  });
  return [stdout, stderr].filter(Boolean).join('\n');
}
