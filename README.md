# Meta MCP Search

A single MCP server exposing `search_tool` that routes to 1000+ local MCP tools via semantic search.

## Features

- **Semantic Search**: Uses `all-MiniLM-L6-v2` embeddings via `@xenova/transformers` for fast, accurate tool discovery
- **Hybrid Search**: Cosine similarity on query vs tool name + description
- **MCP Protocol**: Full implementation of Model Context Protocol with stdio transport
- **Dual Usage**: Can be used as an MCP server or imported directly as a TypeScript module

## Installation

```bash
npm install
npm run build
```

## Usage

### As MCP Server (stdio)

```bash
npm start
```

The server will:
1. Load tools from `config.json` or `tools-manifest.json`
2. Build embeddings for all tools
3. Listen on stdio for MCP requests

### As Imported Module

```typescript
import { MetaMcpSearch, searchToolsDirect } from 'meta-mcp-search';

// Option 1: Create instance and use directly
const metaMcp = new MetaMcpSearch({
  configPath: './tools-manifest.json'
});
await metaMcp.init();

const tools = await metaMcp.search('send a message to slack');
console.log(tools);

// Option 2: Quick search function
const tools = await searchToolsDirect('list files in google drive', {
  configPath: './config.json'
});
```

### Direct Function Calls

```typescript
import { 
  SearchEngine, 
  loadToolsFromConfig,
  initSearchEngine,
  searchTools 
} from 'meta-mcp-search';

// Load tools
const tools = await loadToolsFromConfig('./tools-manifest.json');

// Initialize search engine
await initSearchEngine(tools);

// Search
const results = await searchTools('create a github issue', 5);
```

## Configuration

### config.json Format

```json
{
  "mcpServers": {
    "google-drive": {
      "command": "node",
      "args": ["./servers/google-drive/dist/index.js"],
      "tools": [
        {
          "name": "google_drive_list",
          "description": "List files in Google Drive",
          "inputSchema": {
            "type": "object",
            "properties": {
              "folderId": { "type": "string" }
            },
            "required": ["folderId"]
          }
        }
      ]
    }
  }
}
```

### tools-manifest.json Format

```json
{
  "version": "1.0.0",
  "tools": [
    {
      "name": "google_drive_list",
      "description": "List files in Google Drive",
      "inputSchema": {
        "type": "object",
        "properties": {
          "folderId": { "type": "string" }
        },
        "required": ["folderId"]
      },
      "serverKey": "google-drive"
    }
  ]
}
```

## API Reference

### `MetaMcpSearch`

Main class for the meta MCP search functionality.

```typescript
const metaMcp = new MetaMcpSearch(options?: MetaMcpSearchOptions);
await metaMcp.init();
await metaMcp.search(query: string, limit?: number);
await metaMcp.start(); // Start MCP server
```

### `SearchEngine`

Low-level search engine class.

```typescript
const engine = new SearchEngine();
await engine.init(tools);
const results = await engine.search(query, limit);
```

### `loadToolsFromConfig(path?: string)`

Load tools from configuration file.

```typescript
const tools = await loadToolsFromConfig('./config.json');
```

## MCP Tool: search_tool

The server exposes a single tool:

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Natural language query describing what you want to accomplish"
    },
    "limit": {
      "type": "number",
      "default": 8,
      "description": "Maximum number of results to return"
    }
  },
  "required": ["query"]
}
```

**Output:**
```json
[
  {
    "name": "slack_send_message",
    "description": "Send a message to a Slack channel",
    "inputSchema": { ... },
    "serverKey": "slack",
    "score": 0.89
  }
]
```

## Development

```bash
# Build
npm run build

# Development (watch mode)
npm run dev

# Clean build artifacts
npm run clean
```

## Requirements

- Node.js >= 18.0.0
- npm

## License

MIT
