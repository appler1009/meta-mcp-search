import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import {
  loadToolsFromConfig,
  loadToolsFromFile,
  validateTool,
  validateTools,
  createTool,
} from '../src/registry.js';
import type { ToolDef, ConfigJson, ToolsManifest } from '../src/types.js';

// Test directory for temporary files
const TEST_DIR = join(process.cwd(), 'test-temp');

describe('registry', () => {
  beforeEach(async () => {
    // Create test directory
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(TEST_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('validateTool', () => {
    it('should return true for a valid tool definition', () => {
      const tool: ToolDef = {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        },
      };

      expect(validateTool(tool)).toBe(true);
    });

    it('should return true for a tool with optional fields', () => {
      const tool: ToolDef = {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        serverKey: 'test-server',
      };

      expect(validateTool(tool)).toBe(true);
    });

    it('should return false for null', () => {
      expect(validateTool(null)).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(validateTool('string')).toBe(false);
      expect(validateTool(123)).toBe(false);
      expect(validateTool(undefined)).toBe(false);
    });

    it('should return false for missing name', () => {
      const tool = {
        description: 'A test tool',
        inputSchema: { type: 'object', properties: {} },
      };

      expect(validateTool(tool)).toBe(false);
    });

    it('should return false for empty name', () => {
      const tool = {
        name: '',
        description: 'A test tool',
        inputSchema: { type: 'object', properties: {} },
      };

      expect(validateTool(tool)).toBe(false);
    });

    it('should return false for missing description', () => {
      const tool = {
        name: 'test_tool',
        inputSchema: { type: 'object', properties: {} },
      };

      expect(validateTool(tool)).toBe(false);
    });

    it('should return false for missing inputSchema', () => {
      const tool = {
        name: 'test_tool',
        description: 'A test tool',
      };

      expect(validateTool(tool)).toBe(false);
    });

    it('should return false for inputSchema with wrong type', () => {
      const tool = {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: { type: 'array', properties: {} },
      };

      expect(validateTool(tool)).toBe(false);
    });
  });

  describe('validateTools', () => {
    it('should separate valid and invalid tools', () => {
      const validTool: ToolDef = {
        name: 'valid_tool',
        description: 'A valid tool',
        inputSchema: { type: 'object', properties: {} },
      };

      const invalidTool = {
        name: '',
        description: 'Invalid tool',
        inputSchema: { type: 'object', properties: {} },
      };

      const result = validateTools([validTool, invalidTool]);

      expect(result.valid).toHaveLength(1);
      expect(result.valid[0]).toEqual(validTool);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0]).toEqual(invalidTool);
    });

    it('should return empty arrays for empty input', () => {
      const result = validateTools([]);

      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(0);
    });
  });

  describe('createTool', () => {
    it('should create a tool definition with all fields', () => {
      const inputSchema: ToolDef['inputSchema'] = {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      };

      const tool = createTool('search', 'Search for items', inputSchema, 'search-server');

      expect(tool).toEqual({
        name: 'search',
        description: 'Search for items',
        inputSchema,
        serverKey: 'search-server',
      });
    });

    it('should create a tool definition without serverKey', () => {
      const inputSchema: ToolDef['inputSchema'] = {
        type: 'object',
        properties: {},
      };

      const tool = createTool('test', 'A test tool', inputSchema);

      expect(tool).toEqual({
        name: 'test',
        description: 'A test tool',
        inputSchema,
        serverKey: undefined,
      });
    });
  });

  describe('loadToolsFromFile', () => {
    it('should load tools from tools-manifest.json format', async () => {
      const manifest: ToolsManifest = {
        version: '1.0.0',
        tools: [
          {
            name: 'tool1',
            description: 'First tool',
            inputSchema: { type: 'object', properties: {} },
            serverKey: 'server1',
          },
          {
            name: 'tool2',
            description: 'Second tool',
            inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
          },
        ],
      };

      const filePath = join(TEST_DIR, 'manifest.json');
      await writeFile(filePath, JSON.stringify(manifest));

      const tools = await loadToolsFromFile(filePath);

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('tool1');
      expect(tools[0].serverKey).toBe('server1');
      expect(tools[1].name).toBe('tool2');
    });

    it('should load tools from config.json format with mcpServers', async () => {
      const config: ConfigJson = {
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
            tools: [
              {
                name: 'test_tool',
                description: 'A test tool',
                inputSchema: { type: 'object', properties: {} },
              },
            ],
          },
        },
      };

      const filePath = join(TEST_DIR, 'config.json');
      await writeFile(filePath, JSON.stringify(config));

      const tools = await loadToolsFromFile(filePath);

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test_tool');
      expect(tools[0].serverKey).toBe('test-server');
    });

    it('should generate placeholder tools for servers without tools array', async () => {
      const config: ConfigJson = {
        mcpServers: {
          'my-server': {
            command: 'node',
            args: ['server.js'],
          },
        },
      };

      const filePath = join(TEST_DIR, 'config.json');
      await writeFile(filePath, JSON.stringify(config));

      const tools = await loadToolsFromFile(filePath);

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('my_server_execute');
      expect(tools[0].description).toBe('Execute commands on my-server server.');
      expect(tools[0].serverKey).toBe('my-server');
    });

    it('should throw error for unknown format', async () => {
      const filePath = join(TEST_DIR, 'unknown.json');
      await writeFile(filePath, JSON.stringify({ foo: 'bar' }));

      await expect(loadToolsFromFile(filePath)).rejects.toThrow('Unknown configuration format');
    });
  });

  describe('loadToolsFromConfig', () => {
    it('should return empty array when no config file found', async () => {
      // Spy on console.error to suppress output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const tools = await loadToolsFromConfig('/nonexistent/path.json');

      expect(tools).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[registry] No configuration file found, using empty tool registry'
      );
    });

    it('should load tools from specified config path', async () => {
      const manifest: ToolsManifest = {
        tools: [
          {
            name: 'custom_tool',
            description: 'Custom tool',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      };

      const filePath = join(TEST_DIR, 'custom-config.json');
      await writeFile(filePath, JSON.stringify(manifest));

      const tools = await loadToolsFromConfig(filePath);

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('custom_tool');
    });

    it('should handle JSON parse errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const filePath = join(TEST_DIR, 'invalid.json');
      await writeFile(filePath, 'not valid json');

      const tools = await loadToolsFromConfig(filePath);

      expect(tools).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[registry] Error loading'),
        expect.anything()
      );
    });

    it('should handle empty mcpServers object', async () => {
      const config: ConfigJson = {
        mcpServers: {},
      };

      const filePath = join(TEST_DIR, 'empty-config.json');
      await writeFile(filePath, JSON.stringify(config));

      const tools = await loadToolsFromConfig(filePath);

      expect(tools).toHaveLength(0);
    });

    it('should handle config without mcpServers', async () => {
      const config = {};

      const filePath = join(TEST_DIR, 'no-servers.json');
      await writeFile(filePath, JSON.stringify(config));

      // This should fall through to unknown format and return empty
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const tools = await loadToolsFromConfig(filePath);

      expect(tools).toHaveLength(0);
    });
  });
});
