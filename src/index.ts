#!/usr/bin/env node
/**
 * Meta MCP Search - Main entry point
 * 
 * A single MCP server exposing search_tool that routes to 1000+ local MCP tools via semantic search.
 * 
 * Usage:
 *   1. As MCP server (stdio): npx meta-mcp-search
 *   2. As imported module: import { MetaMcpSearch, searchToolsDirect } from 'meta-mcp-search';
 */

// Export all types
export type {
  ToolDef,
  ToolWithEmbedding,
  ScoredTool,
  SearchToolInput,
  McpServerConfig,
  ConfigJson,
  ToolsManifest,
  MetaMcpSearchOptions,
  InitResult,
  SearchResult,
} from './types.js';

// Export registry functions
export {
  loadToolsFromConfig,
  loadToolsFromFile,
  validateTool,
  validateTools,
  createTool,
} from './registry.js';

// Export search engine
export {
  SearchEngine,
  getSearchEngine,
  initSearchEngine,
  searchTools,
  searchToolsWithScores,
} from './search.js';

// Export MCP server
export {
  MetaMcpSearch,
  createMetaMcpSearch,
  searchToolsDirect,
} from './server.js';

// Main entry point for CLI usage
import { MetaMcpSearch } from './server.js';

async function main(): Promise<void> {
  console.error('[meta-mcp-search] Starting...');
  
  const metaMcp = new MetaMcpSearch();
  
  // Initialize tools and embeddings
  const initResult = await metaMcp.init();
  console.error(`[meta-mcp-search] Initialized with ${initResult.toolCount} tools in ${initResult.initTimeMs}ms`);
  
  // Create and start the MCP server
  metaMcp.createServer();
  await metaMcp.start();
}

// Run main if executed directly
main().catch((error) => {
  console.error('[meta-mcp-search] Fatal error:', error);
  process.exit(1);
});
