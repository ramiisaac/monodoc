import path from 'path';
import { GeneratorConfig, LogLevel, AIModelConfig } from './types';
import { logger, setLogLevel } from './utils/logger';
import { readJsonFile, readYamlFile } from './utils/fileUtils';
import { ConfigurationError } from './utils/errorHandling';
import fs from 'fs/promises';
import * as yaml from 'js-yaml';

export const DEFAULT_CONFIG: GeneratorConfig = {
  workspaceDirs: ['apps', 'tools', 'packages', 'services'],
  includePatterns: [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js', // Include JS for broader applicability
    '**/*.jsx',
  ],
  ignorePatterns: [
    '**/*.d.ts', // Type declaration files
    '**/*.spec.{ts,tsx,js,jsx}', // Test files
    '**/*.test.{ts,tsx,js,jsx}', // Test files
    '**/node_modules/**', // Node modules
    '**/dist/**', // Build output
    '**/build/**', // Build output
    '**/coverage/**', // Test coverage reports
    '**/.next/**', // Next.js build artifacts
    '**/.cache/**', // Cache directories
    '**/tmp/**', // Temporary directories
    '**/temp/**', // Temporary directories
    '**/lib/**', // Often generated or less relevant for JSDoc, can be customized
    '**/types/generated/**', // Auto-generated types
    '**/__mocks__/**', // Jest mocks
    '**/__tests__/**', // Jest test directories
    '**/*.min.js', // Minified JS files
  ],
  targetPaths: [], // To be populated by CLI arguments
  aiModels: [
    {
      id: 'openai-gpt4o',
      provider: 'openai',
      model: 'gpt-4o',
      type: 'generation',
      apiKeyEnvVar: 'OPENAI_API_KEY',
      temperature: 0.2,
      maxOutputTokens: 4096,
      topP: 0.8,
    },
    {
      id: 'google-gemini-pro',
      provider: 'google',
      model: 'gemini-1.5-pro',
      type: 'generation',
      apiKeyEnvVar: 'GOOGLE_API_KEY',
      temperature: 0.2,
      maxOutputTokens: 4096,
      topP: 0.8,
      topK: 40,
      enableSafetyFeatures: true,
    },
    {
      id: 'ollama-codellama',
      provider: 'ollama',
      model: 'codellama',
      type: 'generation',
      apiKeyEnvVar: 'OLLAMA_HOST', // Or 'OLLAMA_API_KEY' if your setup uses it
      baseUrl: process.env.OLLAMA_HOST || 'http://localhost:11434',
      temperature: 0.2,
      maxOutputTokens: 4096,
      topP: 0.8,
    },
    {
      id: 'openai-embedding',
      provider: 'openai',
      model: 'text-embedding-3-large',
      type: 'embedding',
      apiKeyEnvVar: 'OPENAI_API_KEY',
      dimensions: 1536,
    },
    {
      id: 'google-embedding',
      provider: 'google',
      model: 'embedding-001',
      type: 'embedding',
      apiKeyEnvVar: 'GOOGLE_API_KEY',
    },
    {
      id: 'ollama-embedding',
      provider: 'ollama',
      model: 'nomic-embed-text', // A common local embedding model for Ollama
      type: 'embedding',
      apiKeyEnvVar: 'OLLAMA_HOST',
      baseUrl: process.env.OLLAMA_HOST || 'http://localhost:11434',
    },
  ],
  aiClientConfig: {
    defaultGenerationModelId: 'openai-gpt4o', // Default to GPT-4o
    defaultEmbeddingModelId: 'openai-embedding', // Default to OpenAI embedding
    maxConcurrentRequests: 3, // Global concurrency limit for AI calls
    requestDelayMs: 500, // Delay between AI requests
    maxRetries: 5,
    retryDelayMs: 1000,
    maxTokensPerBatch: 8000, // Max tokens for a single prompt batch
  },
  embeddingConfig: {
    enabled: true,
    modelId: 'openai-embedding',
    minRelationshipScore: 0.75,
    maxRelatedSymbols: 5,
    embeddingBatchSize: 10, // How many texts to send for embedding at once
  },
  jsdocConfig: {
    prioritizeExports: true,
    includePrivate: false,
    includeNodeKinds: [
      'ClassDeclaration',
      'FunctionDeclaration',
      'MethodDeclaration',
      'InterfaceDeclaration',
      'TypeAliasDeclaration',
      'EnumDeclaration',
      'VariableDeclaration',
    ],
    excludeNodeKinds: [
      'ConstructorDeclaration',
      'GetAccessor',
      'SetAccessor',
    ],
    maxSnippetLength: 3500, // Max code snippet length sent to LLM
    generateExamples: true,
    overwriteExisting: false,
    mergeExisting: true,
    minJsdocLength: 100, // Minimum generated JSDoc length to be considered valid
    includeSymbolReferences: true,
    includeRelatedSymbols: true,
  },
  outputConfig: {
    reportFileName: 'jsdoc-generation-report.json',
    reportDir: './docs/generated',
    logLevel: 'info',
  },
  dryRun: false,
  forceOverwrite: false,
  noMergeExisting: false,
  disableEmbeddings: false,
  plugins: [],
  telemetry: {
    enabled: false, // Opt-in by default
    anonymize: true,
    collectPerformance: true,
    collectErrors: true,
  },
  qualityThresholds: {
    minimumScore: 70,
    requireDescriptions: true,
    requireExamples: false,
    requireParams: true,
    requireReturns: true,
  },
  performance: {
    enableCaching: true,
    maxConcurrentFiles: 4, // Concurrent files processed in parallel
    batchSize: 20, // Internal batch size for processing nodes within a file
    timeoutMs: 30000, // General timeout for operations
  },
  migration: {
    enableAutoMigration: true,
    backupConfigs: true,
    migrationLogLevel: 'normal',
  },
  watchMode: {
    enabled: false,
    debounceMs: 1000,
    ignorePatterns: [],
    includePatterns: [],
  },
  productionMode: false, // Default to false
};

/**
 * Deeply merges two objects. Arrays are replaced, except for specific pattern/directory arrays
 * which are merged and deduplicated.
 * @param target The target object to merge into.
 * @param source The source object to merge from.
 * @returns The merged object.
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Record<string, any>): T {
  const output = { ...target } as T;

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];

      if (sourceValue !== undefined) {
        if (Array.isArray(sourceValue)) {
          // Special handling for patterns and directories: merge and deduplicate
          // For other arrays (like `aiModels`, `plugins`), replace them to simplify updates.
          if (
            key === 'includeNodeKinds' ||
            key === 'excludeNodeKinds' ||
            key === 'workspaceDirs' ||
            key === 'includePatterns' ||
            key === 'ignorePatterns' ||
            key === 'targetPaths'
          ) {
            const merged = [...((output[key] as any[]) || []), ...sourceValue];
            (output as any)[key] = [...new Set(merged)]; // Deduplicate
          } else {
            (output as any)[key] = sourceValue; // For other arrays (e.g., aiModels, plugins), overwrite
          }
        } else if (
          typeof sourceValue === 'object' &&
          sourceValue !== null &&
          typeof output[key] === 'object' &&
          output[key] !== null &&
          !Array.isArray(output[key]) // Ensure we don't treat arrays as objects for deep merge
        ) {
          (output as any)[key] = deepMerge(
            output[key] as Record<string, any>,
            sourceValue as Record<string, any>,
          );
        } else {
          (output as any)[key] = sourceValue;
        }
      }
    }
  }
  return output;
}

/**
 * Loads a custom configuration file (JSON or YAML) and merges it with the default configuration.
 * Performs basic validation to ensure critical parts of the configuration are present.
 * @param configPath Optional path to a custom configuration file.
 * @returns The merged and validated GeneratorConfig.
 * @throws ConfigurationError if the file cannot be loaded/parsed or is invalid.
 */
export async function loadAndMergeConfig(configPath?: string): Promise<GeneratorConfig> {
  let customConfig: Partial<GeneratorConfig> = {};
  if (configPath) {
    const resolvedPath = path.resolve(process.cwd(), configPath);
    try {
      let fileContent: string;
      if (configPath.endsWith('.json')) {
        fileContent = await fs.readFile(resolvedPath, 'utf-8');
        customConfig = JSON.parse(fileContent);
      } else if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
        fileContent = await fs.readFile(resolvedPath, 'utf-8');
        customConfig = yaml.load(fileContent) as Partial<GeneratorConfig>;
      } else {
        throw new ConfigurationError(
          `Unsupported configuration file format: ${path.extname(configPath)}. Use .json or .yaml/.yml.`,
        );
      }
      logger.info(`Loaded custom configuration from: ${resolvedPath}`);
    } catch (e) {
      throw new ConfigurationError(
        `Failed to load or parse custom config from ${resolvedPath}: ${e instanceof Error ? e.message : String(e)}`,
        e,
      );
    }
  }

  const mergedConfig = deepMerge(DEFAULT_CONFIG, customConfig);

  // --- Core Configuration Validation ---
  if (!mergedConfig.aiModels || mergedConfig.aiModels.length === 0) {
    throw new ConfigurationError(
      "No AI models are configured. Please define at least one model in 'aiModels'.",
    );
  }

  const defaultGenerationModelExists = mergedConfig.aiModels.some(
    (m) => m.id === mergedConfig.aiClientConfig.defaultGenerationModelId && m.type === 'generation',
  );
  if (!defaultGenerationModelExists) {
    throw new ConfigurationError(
      `Default generation model ID '${mergedConfig.aiClientConfig.defaultGenerationModelId}' not found in 'aiModels' list or is not of type 'generation'. Please ensure it's defined and correctly typed.`,
    );
  }

  if (mergedConfig.embeddingConfig.enabled) {
    const embeddingModelExists = mergedConfig.aiModels.some(
      (m) => m.id === mergedConfig.embeddingConfig.modelId && m.type === 'embedding',
    );
    if (!embeddingModelExists) {
      throw new ConfigurationError(
        `Embedding model ID '${mergedConfig.embeddingConfig.modelId}' not found in 'aiModels' list or is not of type 'embedding', but embeddingConfig is enabled.`,
      );
    }
  }

  // Set the global logger level based on the configuration (can be overridden by CLI verbose flag)
  const validLogLevels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];
  if (
    mergedConfig.outputConfig.logLevel &&
    !validLogLevels.includes(mergedConfig.outputConfig.logLevel.toLowerCase() as LogLevel)
  ) {
    logger.warn(
      `Invalid log level '${mergedConfig.outputConfig.logLevel}' specified in config. Defaulting to '${DEFAULT_CONFIG.outputConfig.logLevel}'.`,
    );
    mergedConfig.outputConfig.logLevel = DEFAULT_CONFIG.outputConfig.logLevel;
  }
  setLogLevel(mergedConfig.outputConfig.logLevel);

  return mergedConfig;
}

export { deepMerge };

