import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SearchEngine, getSearchEngine, initSearchEngine, searchTools, searchToolsWithScores } from '../src/search.js';
import type { ToolDef } from '../src/types.js';

// Mock the transformers pipeline
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue(mockEmbedder),
  env: { allowLocalModels: false, backends: { onnx: { wasm: { numThreads: 1 } } } },
  Tensor: class Tensor {
    data: Float32Array;
    constructor(data: Float32Array) {
      this.data = data;
    }
  },
}));

// Mock embedder that returns predictable embeddings
function mockEmbedder(text: string) {
  // Create a simple embedding based on text length and first char code
  const size = 384; // all-MiniLM-L6-v2 embedding size
  const data = new Float32Array(size);
  const baseValue = text.length / 100;
  for (let i = 0; i < size; i++) {
    data[i] = baseValue + (i / size) * 0.1;
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < size; i++) {
    norm += data[i] * data[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < size; i++) {
    data[i] /= norm;
  }
  return { data, pooling: 'mean', normalize: true };
}

// Sample tools for testing
const sampleTools: ToolDef[] = [
  {
    name: 'google_drive_list',
    description: 'List files in Google Drive',
    inputSchema: { type: 'object', properties: {} },
    serverKey: 'google-drive',
  },
  {
    name: 'slack_send_message',
    description: 'Send a message to Slack',
    inputSchema: { type: 'object', properties: {} },
    serverKey: 'slack',
  },
  {
    name: 'github_create_issue',
    description: 'Create a GitHub issue',
    inputSchema: { type: 'object', properties: {} },
    serverKey: 'github',
  },
];

describe('search', () => {
  let engine: SearchEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new SearchEngine();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SearchEngine', () => {
    describe('constructor', () => {
      it('should create instance with default model', () => {
        const se = new SearchEngine();
        expect(se.getModelName()).toBe('Xenova/gte-small');
      });

      it('should create instance with custom model', () => {
        const se = new SearchEngine('custom-model');
        expect(se.getModelName()).toBe('custom-model');
      });
    });

    describe('getModelName', () => {
      it('should return the model name', () => {
        expect(engine.getModelName()).toBe('Xenova/gte-small');
      });
    });

    describe('init', () => {
      it('should initialize with tools and return result', async () => {
        const result = await engine.init(sampleTools);

        expect(result.toolCount).toBe(3);
        expect(result.initTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.fromCache).toBe(false);
      });

      it('should set initialized flag', async () => {
        expect(engine.isInitialized()).toBe(false);
        await engine.init(sampleTools);
        expect(engine.isInitialized()).toBe(true);
      });

      it('should store tools', async () => {
        await engine.init(sampleTools);
        expect(engine.getTools()).toEqual(sampleTools);
      });

      it('should compute embeddings for all tools', async () => {
        await engine.init(sampleTools);
        const embeddings = engine.getEmbeddings();
        expect(embeddings).toHaveLength(3);
        expect(embeddings[0]).toHaveLength(384);
      });

      it('should handle empty tools array', async () => {
        const result = await engine.init([]);
        expect(result.toolCount).toBe(0);
        expect(engine.getTools()).toHaveLength(0);
        expect(engine.getEmbeddings()).toHaveLength(0);
      });
    });

    describe('isInitialized', () => {
      it('should return false before init', () => {
        expect(engine.isInitialized()).toBe(false);
      });

      it('should return true after init', async () => {
        await engine.init(sampleTools);
        expect(engine.isInitialized()).toBe(true);
      });
    });

    describe('getTools', () => {
      it('should return empty array before init', () => {
        expect(engine.getTools()).toHaveLength(0);
      });

      it('should return tools after init', async () => {
        await engine.init(sampleTools);
        expect(engine.getTools()).toEqual(sampleTools);
      });
    });

    describe('getEmbeddings', () => {
      it('should return empty array before init', () => {
        expect(engine.getEmbeddings()).toHaveLength(0);
      });

      it('should return embeddings after init', async () => {
        await engine.init(sampleTools);
        expect(engine.getEmbeddings()).toHaveLength(3);
      });
    });

    describe('cosineSimilarity', () => {
      it('should return 1 for identical vectors', () => {
        const vec = [1, 2, 3, 4, 5];
        expect(engine.cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
      });

      it('should return 0 for orthogonal vectors', () => {
        const a = [1, 0, 0];
        const b = [0, 1, 0];
        expect(engine.cosineSimilarity(a, b)).toBeCloseTo(0, 5);
      });

      it('should return -1 for opposite vectors', () => {
        const a = [1, 2, 3];
        const b = [-1, -2, -3];
        expect(engine.cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
      });

      it('should return 0 for zero vectors', () => {
        const a = [0, 0, 0];
        const b = [1, 2, 3];
        expect(engine.cosineSimilarity(a, b)).toBe(0);
      });

      it('should throw for vectors of different lengths', () => {
        const a = [1, 2, 3];
        const b = [1, 2];
        expect(() => engine.cosineSimilarity(a, b)).toThrow('Vectors must have the same length');
      });

      it('should compute correct similarity for arbitrary vectors', () => {
        const a = [1, 2, 3];
        const b = [4, 5, 6];
        // cos(a, b) = (1*4 + 2*5 + 3*6) / (sqrt(1+4+9) * sqrt(16+25+36))
        // = 32 / (sqrt(14) * sqrt(77))
        // ≈ 0.9746
        const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
        expect(engine.cosineSimilarity(a, b)).toBeCloseTo(expected, 4);
      });
    });

    describe('search', () => {
      beforeEach(async () => {
        await engine.init(sampleTools);
      });

      it('should throw if not initialized', async () => {
        const uninitializedEngine = new SearchEngine();
        await expect(uninitializedEngine.search('test')).rejects.toThrow(
          'SearchEngine not initialized. Call init() first.'
        );
      });

      it('should return search results with correct structure', async () => {
        const result = await engine.search('list files');

        expect(result).toHaveProperty('results');
        expect(result).toHaveProperty('query', 'list files');
        expect(result).toHaveProperty('searchTimeMs');
        expect(result.searchTimeMs).toBeGreaterThanOrEqual(0);
      });

      it('should return results with tools and scores', async () => {
        const result = await engine.search('list files');

        expect(result.results.length).toBeGreaterThan(0);
        expect(result.results[0]).toHaveProperty('tool');
        expect(result.results[0]).toHaveProperty('score');
        expect(result.results[0].score).toBeGreaterThanOrEqual(-1);
        expect(result.results[0].score).toBeLessThanOrEqual(1);
      });

      it('should respect limit parameter', async () => {
        const result = await engine.search('test', 2);
        expect(result.results.length).toBeLessThanOrEqual(2);
      });

      it('should sort results by score descending', async () => {
        const result = await engine.search('send message');
        const scores = result.results.map(r => r.score);
        for (let i = 1; i < scores.length; i++) {
          expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
        }
      });

      it('should use default limit of 8', async () => {
        // Create engine with many tools
        const manyTools: ToolDef[] = Array.from({ length: 20 }, (_, i) => ({
          name: `tool_${i}`,
          description: `Tool number ${i}`,
          inputSchema: { type: 'object', properties: {} },
        }));

        const bigEngine = new SearchEngine();
        await bigEngine.init(manyTools);
        const result = await bigEngine.search('tool');
        expect(result.results.length).toBeLessThanOrEqual(8);
      });
    });

    describe('searchTools', () => {
      beforeEach(async () => {
        await engine.init(sampleTools);
      });

      it('should return only tools without scores', async () => {
        const tools = await engine.searchTools('list files');

        expect(Array.isArray(tools)).toBe(true);
        expect(tools.length).toBeGreaterThan(0);
        expect(tools[0]).toHaveProperty('name');
        expect(tools[0]).toHaveProperty('description');
        expect(tools[0]).toHaveProperty('inputSchema');
      });

      it('should respect limit parameter', async () => {
        const tools = await engine.searchTools('test', 1);
        expect(tools.length).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('getSearchEngine', () => {
    it('should return a SearchEngine instance', () => {
      const se = getSearchEngine();
      expect(se).toBeInstanceOf(SearchEngine);
    });

    it('should return the same instance on subsequent calls', () => {
      const se1 = getSearchEngine();
      const se2 = getSearchEngine();
      expect(se1).toBe(se2);
    });

    it('should warn when called with different model name after initialization', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // First call initializes with default model
      getSearchEngine();
      
      // Second call with different model should warn
      getSearchEngine('different-model');
      
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Warning: getSearchEngine called with modelName 'different-model'")
      );
    });
  });

  describe('initSearchEngine', () => {
    it('should initialize the default search engine with tools', async () => {
      const result = await initSearchEngine(sampleTools);
      expect(result.toolCount).toBe(3);
    });
  });

  describe('searchTools', () => {
    it('should search using the default engine', async () => {
      await initSearchEngine(sampleTools);
      const tools = await searchTools('list files');
      expect(Array.isArray(tools)).toBe(true);
    });
  });

  describe('searchToolsWithScores', () => {
    it('should search and return scored results', async () => {
      await initSearchEngine(sampleTools);
      const results = await searchToolsWithScores('list files');
      expect(Array.isArray(results)).toBe(true);
      expect(results[0]).toHaveProperty('tool');
      expect(results[0]).toHaveProperty('score');
    });
  });
});
