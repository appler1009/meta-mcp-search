/**
 * MCP Server module - Implements the Model Context Protocol server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ToolDef, MetaMcpSearchOptions, InitResult } from './types.js';
import { loadToolsFromConfig } from './registry.js';
import { SearchEngine, getSearchEngine } from './search.js';

/**
 * Zod schema for validating search_tool input
 */
const SearchToolInputSchema = z.object({
  query: z.string().min(1, 'query must be a non-empty string'),
  limit: z.number().int().positive().optional().default(8),
});

/**
 * Search tool definition exposed by the MCP server
 */
const SEARCH_TOOL_DEFINITION = {
  name: 'search_tool',
  description: 'Search all available tools by natural language intent or keywords. Always use this first when unsure which tool to use. Returns matching tools with their descriptions and input schemas.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query describing what you want to accomplish (e.g., "list files in google drive", "send a message to slack")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 8,
      },
    },
    required: ['query'],
  },
};

/**
 * MetaMcpSearch class - Main class that can be used standalone or imported
 */
export class MetaMcpSearch {
  private server: Server | null = null;
  private searchEngine: SearchEngine;
  private tools: ToolDef[] = [];
  private options: MetaMcpSearchOptions;
  private initialized = false;

  constructor(options: MetaMcpSearchOptions = {}) {
    this.options = options;
    this.searchEngine = options.embeddingModel 
      ? new SearchEngine(options.embeddingModel)
      : getSearchEngine();
  }

  /**
   * Initialize the MetaMcpSearch instance
   * Loads tools and builds embeddings
   */
  async init(): Promise<InitResult> {
    const startTime = Date.now();

    // Load tools from config or use provided tools
    if (this.options.tools && this.options.tools.length > 0) {
      this.tools = this.options.tools;
    } else {
      this.tools = await loadToolsFromConfig(this.options.configPath);
    }

    // Initialize search engine with tools
    const result = await this.searchEngine.init(this.tools);
    this.initialized = true;

    return {
      ...result,
      initTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get loaded tools
   */
  getTools(): ToolDef[] {
    return this.tools;
  }

  /**
   * Search for tools (can be called directly without MCP)
   */
  async search(query: string, limit: number = 8): Promise<ToolDef[]> {
    this.ensureInitialized();
    return this.searchEngine.searchTools(query, limit);
  }

  /**
   * Search for tools with similarity scores
   */
  async searchWithScores(query: string, limit: number = 8): Promise<{ tool: ToolDef; score: number }[]> {
    this.ensureInitialized();
    const result = await this.searchEngine.search(query, limit);
    return result.results;
  }

  /**
   * Create and configure the MCP server
   */
  createServer(): Server {
    const server = new Server(
      {
        name: 'meta-mcp-search',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Handler for tools/list
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [SEARCH_TOOL_DEFINITION],
      };
    });

    // Handler for tools/call
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'search_tool') {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      // Validate input using Zod schema
      const parseResult = SearchToolInputSchema.safeParse(request.params.arguments);
      
      if (!parseResult.success) {
        const errorMessages = parseResult.error.issues.map(issue => 
          `${issue.path.join('.')}: ${issue.message}`
        ).join('; ');
        throw new Error(`Invalid arguments: ${errorMessages}`);
      }

      const { query, limit } = parseResult.data;

      const results = await this.searchEngine.search(query, limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results.results.map(r => ({
              name: r.tool.name,
              description: r.tool.description,
              inputSchema: r.tool.inputSchema,
              serverKey: r.tool.serverKey,
              score: r.score,
            })), null, 2),
          },
        ],
      };
    });

    this.server = server;
    return server;
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start(): Promise<void> {
    if (!this.server) {
      this.createServer();
    }

    const transport = new StdioServerTransport();
    await this.server!.connect(transport);
    
    console.error('[meta-mcp-search] Server started and listening on stdio');
  }

  /**
   * Ensure the instance is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('MetaMcpSearch not initialized. Call init() first.');
    }
  }
}

/**
 * Create and initialize a MetaMcpSearch instance
 */
export async function createMetaMcpSearch(options?: MetaMcpSearchOptions): Promise<MetaMcpSearch> {
  const instance = new MetaMcpSearch(options);
  await instance.init();
  return instance;
}

/**
 * Convenience function to search tools directly
 */
export async function searchToolsDirect(
  query: string,
  options?: MetaMcpSearchOptions
): Promise<ToolDef[]> {
  const instance = await createMetaMcpSearch(options);
  return instance.search(query);
}
