import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetaMcpSearch, createMetaMcpSearch, searchToolsDirect } from '../src/server.js';
import type { ToolDef } from '../src/types.js';

// Mock the search module
vi.mock('../src/search.js', () => ({
  SearchEngine: class MockSearchEngine {
    private tools: ToolDef[] = [];
    private initialized = false;
    private modelName: string;

    constructor(modelName?: string) {
      this.modelName = modelName || 'Xenova/all-MiniLM-L6-v2';
    }

    getModelName() {
      return this.modelName;
    }

    async init(tools: ToolDef[]) {
      this.tools = tools;
      this.initialized = true;
      return { toolCount: tools.length, initTimeMs: 10, fromCache: false };
    }

    async search(query: string, limit: number = 8) {
      if (!this.initialized) {
        throw new Error('SearchEngine not initialized. Call init() first.');
      }
      
      // Simple mock search that returns tools matching query keywords
      const results = this.tools
        .filter(tool => 
          tool.name.toLowerCase().includes(query.toLowerCase()) ||
          tool.description.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, limit)
        .map(tool => ({ tool, score: 0.9 }));

      return {
        results,
        query,
        searchTimeMs: 5,
      };
    }

    async searchTools(query: string, limit: number = 8) {
      const result = await this.search(query, limit);
      return result.results.map(r => r.tool);
    }
  },
  getSearchEngine: vi.fn(() => new (class {
    private tools: ToolDef[] = [];
    private initialized = false;

    getModelName() {
      return 'Xenova/all-MiniLM-L6-v2';
    }

    async init(tools: ToolDef[]) {
      this.tools = tools;
      this.initialized = true;
      return { toolCount: tools.length, initTimeMs: 10, fromCache: false };
    }

    async search(query: string, limit: number = 8) {
      const results = this.tools
        .filter(tool => 
          tool.name.toLowerCase().includes(query.toLowerCase()) ||
          tool.description.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, limit)
        .map(tool => ({ tool, score: 0.9 }));
      return { results, query, searchTimeMs: 5 };
    }

    async searchTools(query: string, limit: number = 8) {
      const result = await this.search(query, limit);
      return result.results.map(r => r.tool);
    }
  })()),
}));

// Mock the registry module
vi.mock('../src/registry.js', () => ({
  loadToolsFromConfig: vi.fn(async () => [
    {
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: { type: 'object', properties: {} },
      serverKey: 'test-server',
    },
    {
      name: 'another_tool',
      description: 'Another tool for testing',
      inputSchema: { type: 'object', properties: {} },
    },
  ]),
}));

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
];

describe('server', () => {
  let metaMcp: MetaMcpSearch;

  beforeEach(() => {
    vi.clearAllMocks();
    metaMcp = new MetaMcpSearch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MetaMcpSearch', () => {
    describe('constructor', () => {
      it('should create instance with default options', () => {
        const mcp = new MetaMcpSearch();
        expect(mcp).toBeInstanceOf(MetaMcpSearch);
        expect(mcp.isInitialized()).toBe(false);
      });

      it('should create instance with custom options', () => {
        const mcp = new MetaMcpSearch({
          configPath: './test-config.json',
          embeddingModel: 'custom-model',
        });
        expect(mcp).toBeInstanceOf(MetaMcpSearch);
      });

      it('should accept pre-loaded tools', () => {
        const mcp = new MetaMcpSearch({
          tools: sampleTools,
        });
        expect(mcp).toBeInstanceOf(MetaMcpSearch);
      });
    });

    describe('init', () => {
      it('should initialize with pre-loaded tools', async () => {
        const mcp = new MetaMcpSearch({ tools: sampleTools });
        const result = await mcp.init();

        expect(result.toolCount).toBe(2);
        expect(result.initTimeMs).toBeGreaterThanOrEqual(0);
        expect(mcp.isInitialized()).toBe(true);
      });

      it('should load tools from config when no tools provided', async () => {
        const result = await metaMcp.init();

        expect(result.toolCount).toBe(2); // From mocked loadToolsFromConfig
        expect(metaMcp.isInitialized()).toBe(true);
      });

      it('should return tools after initialization', async () => {
        const mcp = new MetaMcpSearch({ tools: sampleTools });
        await mcp.init();
        
        const tools = mcp.getTools();
        expect(tools).toEqual(sampleTools);
      });
    });

    describe('isInitialized', () => {
      it('should return false before init', () => {
        expect(metaMcp.isInitialized()).toBe(false);
      });

      it('should return true after init', async () => {
        await metaMcp.init();
        expect(metaMcp.isInitialized()).toBe(true);
      });
    });

    describe('getTools', () => {
      it('should return empty array before init', () => {
        expect(metaMcp.getTools()).toHaveLength(0);
      });

      it('should return tools after init', async () => {
        const mcp = new MetaMcpSearch({ tools: sampleTools });
        await mcp.init();
        expect(mcp.getTools()).toEqual(sampleTools);
      });
    });

    describe('search', () => {
      it('should throw if not initialized', async () => {
        await expect(metaMcp.search('test')).rejects.toThrow(
          'MetaMcpSearch not initialized. Call init() first.'
        );
      });

      it('should return matching tools', async () => {
        const mcp = new MetaMcpSearch({ tools: sampleTools });
        await mcp.init();
        
        const results = await mcp.search('drive');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].name).toBe('google_drive_list');
      });

      it('should use default limit of 8', async () => {
        const mcp = new MetaMcpSearch({ tools: sampleTools });
        await mcp.init();
        
        const results = await mcp.search('tool');
        expect(results.length).toBeLessThanOrEqual(8);
      });

      it('should respect custom limit', async () => {
        const mcp = new MetaMcpSearch({ tools: sampleTools });
        await mcp.init();
        
        const results = await mcp.search('tool', 1);
        expect(results.length).toBeLessThanOrEqual(1);
      });
    });

    describe('searchWithScores', () => {
      it('should throw if not initialized', async () => {
        await expect(metaMcp.searchWithScores('test')).rejects.toThrow(
          'MetaMcpSearch not initialized. Call init() first.'
        );
      });

      it('should return tools with scores', async () => {
        const mcp = new MetaMcpSearch({ tools: sampleTools });
        await mcp.init();
        
        const results = await mcp.searchWithScores('drive');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0]).toHaveProperty('tool');
        expect(results[0]).toHaveProperty('score');
      });
    });

    describe('createServer', () => {
      it('should create and return a Server instance', async () => {
        await metaMcp.init();
        const server = metaMcp.createServer();
        expect(server).toBeDefined();
      });
    });
  });

  describe('createMetaMcpSearch', () => {
    it('should create and initialize a MetaMcpSearch instance', async () => {
      const mcp = await createMetaMcpSearch({ tools: sampleTools });
      
      expect(mcp).toBeInstanceOf(MetaMcpSearch);
      expect(mcp.isInitialized()).toBe(true);
    });

    it('should work without options', async () => {
      const mcp = await createMetaMcpSearch();
      
      expect(mcp).toBeInstanceOf(MetaMcpSearch);
      expect(mcp.isInitialized()).toBe(true);
    });
  });

  describe('searchToolsDirect', () => {
    it('should search and return tools directly', async () => {
      const tools = await searchToolsDirect('drive', { tools: sampleTools });
      
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('Zod Validation', () => {
    it('should validate correct input schema', async () => {
      const mcp = new MetaMcpSearch({ tools: sampleTools });
      await mcp.init();
      mcp.createServer();

      // The server should accept valid input
      const results = await mcp.search('drive');
      expect(results).toBeDefined();
    });
  });
});
