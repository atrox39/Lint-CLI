import fs from 'node:fs/promises';
import path from 'node:path';

const STATE_DIR = path.join(process.cwd(), '.lint-cli');
const MEMORY_FILE = path.join(STATE_DIR, 'memory.json');

export async function loadMemory() {
  try {
    const raw = await fs.readFile(MEMORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

export async function saveMemory(messages) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(
    MEMORY_FILE,
    JSON.stringify({ messages }, null, 2),
    'utf-8'
  );
}

export async function clearMemory() {
  try {
    await fs.rm(MEMORY_FILE, { force: true });
  } catch {}
}

export function getMemoryPath() {
  return MEMORY_FILE;
}
