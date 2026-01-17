import axios from 'axios';
import { TOOLS } from './tool.schema.js';

const DEFAULT_CHAT_URL = 'http://localhost:11434/ollama/api/chat';

function buildChatUrl(rawUrl) {
  if (!rawUrl) return DEFAULT_CHAT_URL;
  const trimmed = rawUrl.replace(/\/+$/, '');
  if (
    trimmed.endsWith('/api/chat') ||
    trimmed.endsWith('/ollama/api/chat')
  ) {
    return trimmed;
  }
  if (trimmed.endsWith('/api') || trimmed.endsWith('/ollama/api')) {
    return `${trimmed}/chat`;
  }
  return `${trimmed}/ollama/api/chat`;
}

function formatAxiosError(err) {
  if (err.response?.data) {
    const data = JSON.stringify(err.response.data);
    return `${err.message} (${err.response.status}) ${data}`;
  }
  return err.message || 'Unknown error';
}

const api = axios.create({
  headers: {
    ...(process.env.OLLAMA_API_KEY
      ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` }
      : {}),
    'Content-Type': 'application/json',
  },
  timeout: 120000,
});

export async function chatCompletion(messages, options = {}) {
  const model =
    options.model || process.env.OLLAMA_MODEL || 'qwen3:8b';
  const chatUrl = buildChatUrl(
    options.apiUrl ||
      process.env.OLLAMA_API ||
      process.env.OPENWEBUI_API
  );

  let res;
  try {
    res = await api.post(chatUrl, {
      model,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      stream: false,
    });
  } catch (err) {
    return { role: 'assistant', content: `Error: ${formatAxiosError(err)}` };
  }

  const msg = res.data?.message;
  if (!msg) {
    return { role: 'assistant', content: 'Error: empty response from model' };
  }

  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
    return { role: 'assistant', tool_calls: msg.tool_calls };
  }

  return { role: 'assistant', content: msg.content || '' };
}
