/**
 * Tool Registry - Loads and manages tool definitions from config files
 */

import { readFile, access } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import type { ToolDef, ConfigJson, ToolsManifest, McpServerConfig } from './types.js';

/**
 * Default paths to search for configuration files
 */
const DEFAULT_CONFIG_PATHS = [
  'config.json',
  'tools-manifest.json',
  '../config.json',
  '../tools-manifest.json',
];

/**
 * Get the directory of the current module
 */
function getModuleDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  return dirname(__filename);
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load tools from a config.json with mcpServers format
 */
async function loadFromConfigJson(config: ConfigJson): Promise<ToolDef[]> {
  const tools: ToolDef[] = [];
  
  if (!config.mcpServers) {
    return tools;
  }

  for (const [serverKey, serverConfig] of Object.entries(config.mcpServers)) {
    // If tools are already defined in the config, use them
    if (serverConfig.tools && Array.isArray(serverConfig.tools)) {
      for (const tool of serverConfig.tools) {
        tools.push({
          ...tool,
          serverKey,
        });
      }
    } else {
      // Generate placeholder tools based on server key
      // In a real implementation, you might connect to the server to discover tools
      const toolName = serverKey.replace(/[-_]/g, '_');
      tools.push({
        name: `${toolName}_execute`,
        description: `Execute commands on ${serverKey} server.`,
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Command to execute',
            },
            args: {
              type: 'array',
              description: 'Arguments for the command',
            },
          },
          required: ['command'],
        },
        serverKey,
      });
    }
  }

  return tools;
}

/**
 * Load tools from a tools-manifest.json format
 */
function loadFromToolsManifest(manifest: ToolsManifest): ToolDef[] {
  return manifest.tools.map(tool => ({
    ...tool,
    inputSchema: tool.inputSchema || {
      type: 'object',
      properties: {},
    },
  }));
}

/**
 * Auto-detect and load tools from configuration files
 * Searches for config.json or tools-manifest.json in common locations
 */
export async function loadToolsFromConfig(configPath?: string): Promise<ToolDef[]> {
  const moduleDir = getModuleDir();
  const pathsToTry = configPath 
    ? [configPath] 
    : DEFAULT_CONFIG_PATHS.map(p => join(moduleDir, p));

  for (const filePath of pathsToTry) {
    if (await fileExists(filePath)) {
      console.error(`[registry] Loading tools from: ${filePath}`);
      
      try {
        const content = await readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        // Detect format based on structure
        if ('tools' in data && Array.isArray(data.tools)) {
          console.error(`[registry] Detected tools-manifest.json format`);
          return loadFromToolsManifest(data as ToolsManifest);
        } else if ('mcpServers' in data) {
          console.error(`[registry] Detected config.json format with mcpServers`);
          return loadFromConfigJson(data as ConfigJson);
        } else {
          console.error(`[registry] Unknown config format in ${filePath}`);
        }
      } catch (error) {
        console.error(`[registry] Error loading ${filePath}:`, error);
      }
    }
  }

  console.error('[registry] No configuration file found, using empty tool registry');
  return [];
}

/**
 * Load tools from a specific file path
 */
export async function loadToolsFromFile(filePath: string): Promise<ToolDef[]> {
  const content = await readFile(filePath, 'utf-8');
  const data = JSON.parse(content);
  
  if ('tools' in data && Array.isArray(data.tools)) {
    return loadFromToolsManifest(data as ToolsManifest);
  } else if ('mcpServers' in data) {
    return loadFromConfigJson(data as ConfigJson);
  }
  
  throw new Error(`Unknown configuration format in ${filePath}`);
}

/**
 * Validate a tool definition
 */
export function validateTool(tool: unknown): tool is ToolDef {
  if (typeof tool !== 'object' || tool === null) {
    return false;
  }
  
  const t = tool as Record<string, unknown>;
  
  if (typeof t.name !== 'string' || t.name.length === 0) {
    return false;
  }
  
  if (typeof t.description !== 'string') {
    return false;
  }
  
  if (typeof t.inputSchema !== 'object' || t.inputSchema === null) {
    return false;
  }
  
  const schema = t.inputSchema as Record<string, unknown>;
  if (schema.type !== 'object') {
    return false;
  }
  
  return true;
}

/**
 * Validate an array of tools
 */
export function validateTools(tools: unknown[]): { valid: ToolDef[]; invalid: unknown[] } {
  const valid: ToolDef[] = [];
  const invalid: unknown[] = [];
  
  for (const tool of tools) {
    if (validateTool(tool)) {
      valid.push(tool);
    } else {
      invalid.push(tool);
    }
  }
  
  return { valid, invalid };
}

/**
 * Create a tool definition
 */
export function createTool(
  name: string,
  description: string,
  inputSchema: ToolDef['inputSchema'],
  serverKey?: string
): ToolDef {
  return {
    name,
    description,
    inputSchema,
    serverKey,
  };
}
