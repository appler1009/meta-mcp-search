/**
 * Search module - Handles embeddings and semantic search
 */

import { pipeline, env, Tensor } from '@xenova/transformers';
import { cpus } from 'os';
import type { ToolDef, ScoredTool, SearchResult, InitResult } from './types.js';

// Configure transformers.js
env.allowLocalModels = false;

/**
 * Default embedding model
 */
const DEFAULT_MODEL = 'Xenova/gte-small';

/**
 * Search engine class that handles tool embeddings and semantic search
 */
export class SearchEngine {
  private embedder: Awaited<ReturnType<typeof pipeline>> | null = null;
  private tools: ToolDef[] = [];
  private embeddings: number[][] = [];
  private modelName: string;
  private initialized = false;

  constructor(modelName: string = DEFAULT_MODEL) {
    this.modelName = modelName;
  }

  /**
   * Get the model name used by this search engine
   */
  getModelName(): string {
    return this.modelName;
  }

  /**
   * Initialize the embedding model
   */
  async initModel(): Promise<void> {
    if (this.embedder) return;
    
    // Set thread count to match CPU cores before loading the WASM backend
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (env as any).backends.onnx.wasm.numThreads = cpus().length;
    console.error(`[search] Loading embedding model: ${this.modelName}`);
    this.embedder = await pipeline('feature-extraction', this.modelName, { quantized: true });
    console.error('[search] Embedding model loaded');
  }

  /**
   * Compute embedding for a single text
   */
  async computeEmbedding(text: string): Promise<number[]> {
    if (!this.embedder) {
      await this.initModel();
    }

    // Use any type assertion to work around complex union types in transformers.js
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output = await (this.embedder as any)(text, { 
      pooling: 'mean', 
      normalize: true 
    });
    
    // Handle Tensor output
    if (output instanceof Tensor) {
      return Array.from(output.data as Float32Array);
    }
    
    // Fallback: try to extract data from the output
    const tensor = output as unknown as { data?: Float32Array };
    if (tensor.data) {
      return Array.from(tensor.data);
    }
    
    throw new Error('Unexpected output format from embedding model');
  }

  /**
   * Compute embeddings for all tools
   */
  async computeToolEmbeddings(tools: ToolDef[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    
    console.error(`[search] Computing embeddings for ${tools.length} tools...`);
    
    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];
      const text = `${tool.name} ${tool.description}`;
      const embedding = await this.computeEmbedding(text);
      embeddings.push(embedding);
      
      // Progress indicator every 100 tools
      if ((i + 1) % 100 === 0) {
        console.error(`[search] Embedded ${i + 1}/${tools.length} tools`);
      }
    }
    
    console.error(`[search] Completed embedding ${tools.length} tools`);
    return embeddings;
  }

  /**
   * Initialize the search engine with tools
   */
  async init(tools: ToolDef[]): Promise<InitResult> {
    const startTime = Date.now();
    
    await this.initModel();
    
    this.tools = tools;
    this.embeddings = await this.computeToolEmbeddings(tools);
    this.initialized = true;
    
    const initTimeMs = Date.now() - startTime;
    
    return {
      toolCount: tools.length,
      initTimeMs,
      fromCache: false,
    };
  }

  /**
   * Check if the search engine is initialized
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
   * Get pre-computed embeddings
   */
  getEmbeddings(): number[][] {
    return this.embeddings;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Search for tools matching the query
   */
  async search(query: string, limit: number = 8): Promise<SearchResult> {
    if (!this.initialized) {
      throw new Error('SearchEngine not initialized. Call init() first.');
    }

    const startTime = Date.now();

    // Compute query embedding
    const queryEmbedding = await this.computeEmbedding(query);

    // Calculate similarity scores for all tools
    const scored: ScoredTool[] = this.tools.map((tool, index) => ({
      tool,
      score: this.cosineSimilarity(queryEmbedding, this.embeddings[index]),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Take top N results
    const results = scored.slice(0, limit);

    const searchTimeMs = Date.now() - startTime;

    return {
      results,
      query,
      searchTimeMs,
    };
  }

  /**
   * Search and return just the tools (without scores)
   */
  async searchTools(query: string, limit: number = 8): Promise<ToolDef[]> {
    const result = await this.search(query, limit);
    return result.results.map(r => r.tool);
  }
}

/**
 * Create a singleton instance for convenience
 */
let defaultEngine: SearchEngine | null = null;

/**
 * Get or create the default search engine
 * Note: If an engine already exists and a different modelName is requested,
 * a warning is logged and the existing engine is returned.
 */
export function getSearchEngine(modelName?: string): SearchEngine {
  if (!defaultEngine) {
    defaultEngine = new SearchEngine(modelName);
  } else if (modelName && modelName !== defaultEngine.getModelName()) {
    console.warn(`[search] Warning: getSearchEngine called with modelName '${modelName}' but engine already initialized with '${defaultEngine.getModelName()}'. Returning existing engine.`);
  }
  return defaultEngine;
}

/**
 * Initialize the default search engine with tools
 */
export async function initSearchEngine(tools: ToolDef[]): Promise<InitResult> {
  const engine = getSearchEngine();
  return engine.init(tools);
}

/**
 * Search using the default engine
 */
export async function searchTools(query: string, limit: number = 8): Promise<ToolDef[]> {
  const engine = getSearchEngine();
  return engine.searchTools(query, limit);
}

/**
 * Search with scores using the default engine
 */
export async function searchToolsWithScores(query: string, limit: number = 8): Promise<ScoredTool[]> {
  const engine = getSearchEngine();
  const result = await engine.search(query, limit);
  return result.results;
}
