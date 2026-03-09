/**
 * Core type definitions for meta-mcp-search
 */

/**
 * Represents a tool definition with its metadata
 */
export interface ToolDef {
  /** Unique tool name (e.g., 'google_drive_list') */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
      default?: unknown;
    }>;
    required?: string[];
  };
  /** Optional server key identifying which MCP server provides this tool */
  serverKey?: string;
}

/**
 * Tool with its pre-computed embedding vector
 */
export interface ToolWithEmbedding {
  tool: ToolDef;
  embedding: number[];
}

/**
 * Search result with tool and similarity score
 */
export interface ScoredTool {
  tool: ToolDef;
  score: number;
}

/**
 * Input schema for the search_tool
 */
export interface SearchToolInput {
  /** Natural language query describing what you want to do */
  query: string;
  /** Maximum number of results to return (default: 8) */
  limit?: number;
}

/**
 * Configuration for loading tools from config.json
 */
export interface McpServerConfig {
  /** Command to run the MCP server */
  command: string;
  /** Arguments for the command */
  args?: string[];
  /** Environment variables for the server */
  env?: Record<string, string>;
  /** Tools provided by this server (optional, for manifest format) */
  tools?: ToolDef[];
}

/**
 * Format for config.json with mcpServers section
 */
export interface ConfigJson {
  mcpServers?: Record<string, McpServerConfig>;
}

/**
 * Format for tools-manifest.json
 */
export interface ToolsManifest {
  tools: ToolDef[];
  version?: string;
  generatedAt?: string;
}

/**
 * Options for initializing the MetaMcpSearch instance
 */
export interface MetaMcpSearchOptions {
  /** Path to config.json or tools-manifest.json */
  configPath?: string;
  /** Pre-loaded tools array (alternative to configPath) */
  tools?: ToolDef[];
  /** Model name for embeddings (default: 'Xenova/gte-small') */
  embeddingModel?: string;
}

/**
 * Result of the initialization process
 */
export interface InitResult {
  /** Number of tools loaded */
  toolCount: number;
  /** Time taken to initialize in milliseconds */
  initTimeMs: number;
  /** Whether embeddings were loaded from cache */
  fromCache: boolean;
}

/**
 * Search function result
 */
export interface SearchResult {
  /** Matching tools with scores */
  results: ScoredTool[];
  /** Query that was searched */
  query: string;
  /** Time taken for search in milliseconds */
  searchTimeMs: number;
}
