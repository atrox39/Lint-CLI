export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from disk (optionally by line range)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          start_line: { type: 'number' },
          end_line: { type: 'number' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write a file to disk',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a directory (optional recursion)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          recursive: { type: 'boolean' },
          max_depth: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_text',
      description: 'Search for text in files',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string' },
          regex: { type: 'boolean' },
          case_sensitive: { type: 'boolean' },
          max_results: { type: 'number' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_in_file',
      description: 'Replace text in a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          search: { type: 'string' },
          replace: { type: 'string' },
          all: { type: 'boolean' },
          regex: { type: 'boolean' },
        },
        required: ['path', 'search', 'replace'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in the project directory',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          args: { type: 'array', items: { type: 'string' } },
          cwd: { type: 'string' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'current_dir',
      description: 'Get current working directory',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];
