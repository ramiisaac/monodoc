import { Node, JSDoc, JSDocTagStructure } from 'ts-morph';
import { ToolDefinition } from 'ai'; // Vercel AI SDK types
import { ModelProvider } from 'ai'; // Ensure ModelProvider is imported for type inference if needed later

// --- Core Utility Types ---
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

// --- Workspace & Processing Types ---
export interface WorkspacePackage {
  name: string;
  path: string;
  type: string;
  tsConfigPath: string;
  packageJsonPath: string;
  priority: number;
}

export interface FileBatch {
  files: string[];
  estimatedTokens: number;
  priority: number;
}

export interface ProcessingStats {
  totalPackages: number;
  totalBatches: number;
  processedBatches: number;
  totalFiles: number;
  processedFiles: number;
  modifiedFiles: number;
  totalNodesConsidered: number;
  successfulJsdocs: number;
  failedJsdocs: number;
  skippedJsdocs: number;
  embeddingSuccesses: number;
  embeddingFailures: number;
  totalRelationshipsDiscovered: number;
  startTime: number;
  durationSeconds?: number;
  errors: Array<{ file: string; nodeName?: string; error: string; stack?: string; timestamp?: number }>;
  dryRun: boolean;
  configurationUsed: Record<string, unknown>;
}

// --- CLI Types ---
export interface CliOptions {
  configPath?: string;
  dryRun?: boolean;
  noWrite?: boolean; // Alias for dryRun
  targetPaths?: string[];
  forceOverwrite?: boolean;
  noMergeExisting?: boolean;
  verbose?: boolean;
  noEmbed?: boolean; // Disable embeddings for a run
  model?: string; // Specific model override
  apiKey?: string; // API key override (for saving)
  saveApiKey?: 'global' | 'local'; // Save API key location
  watch?: boolean;
  incremental?: boolean;
  qualityCheck?: boolean;
  setup?: boolean; // Now handled by subcommand
  validateConfig?: boolean; // Now handled by subcommand
  cacheClear?: boolean;
  performance?: boolean; // Generate performance reports
  benchmark?: boolean;
  analyzeOnly?: boolean; // Analyze code structure without generating docs
  template?: string; // Specific JSDoc template
  help?: boolean;
  version?: boolean;
  quickStart?: boolean;
  troubleshoot?: boolean;
}

// --- Symbol & Node Context Types ---
export interface SymbolUsage {
  filePath: string;
  line: number;
  column: number;
  snippet?: string;
}

export interface DetailedSymbolInfo {
  id: string;
  name: string;
  kind: string;
  definitionLocation: {
    filePath: string;
    line: number;
    column: number;
  };
  usages: SymbolUsage[];
}

export interface NodeContext {
  id: string;
  codeSnippet: string;
  nodeKind: string;
  nodeName: string;
  signatureDetails: string;
  fileContext: string;
  packageContext: string;
  fullFileContent?: string;
  relevantImports?: string[];
  surroundingContext?: string;
  symbolUsages?: SymbolUsage[];
  relatedSymbols?: RelatedSymbol[];
  embedding?: number[]; // The embedding vector for this node
  nodeType?: string; // e.g., 'Class', 'Function', 'Interface'
  parameters?: Array<{
    name: string;
    type: string;
    optional: boolean;
  }>;
  returnType?: string;
  isExported?: boolean;
  isAsync?: boolean;
  accessModifier?: 'public' | 'private' | 'protected';
  customData?: Record<string, unknown>; // For plugins to add custom data
}

export interface EmbeddedNode {
  id: string;
  embedding: number[];
  textContent: string;
  nodeName: string;
  nodeKind: string;
  filePath: string;
  relativeFilePath: string;
}

export interface RelatedSymbol {
  id: string;
  name: string;
  kind: string;
  filePath: string;
  relativeFilePath: string;
  relationshipScore: number;
}

export interface JSDocableNode extends Node {
  getJsDocs(): JSDoc[];
  addJsDoc(text: string | { description: string; tags?: JSDocTagStructure[] }): JSDoc;
  removeJsDoc(jsDoc: JSDoc): void;
}

export interface AIResponse {
  jsdocContent: string | null;
  status: 'success' | 'skip' | 'error';
  reason?: string;
}

// --- AI SDK Configuration (Revised) ---
/**
 * Configuration for a specific AI model instance.
 */
export interface AIModelConfig {
  id: string; // Unique ID for this model configuration (e.g., 'openai-gpt4-primary', 'google-embedding')
  provider: 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom' | string; // Maps to AI SDK provider packages. 'custom' for future extensibility.
  model: string; // Model identifier (e.g., 'gpt-4o', 'gemini-1.5-pro', 'codellama', 'text-embedding-3-small')
  type: 'generation' | 'embedding'; // Purpose of the model
  apiKeyEnvVar?: string; // Environment variable name for the API key (e.g., 'OPENAI_API_KEY')
  baseUrl?: string; // Optional: custom base URL for the API (e.g., for local Ollama, custom endpoints)
  // Generation specific parameters (optional, allow model defaults)
  temperature?: number;
  maxOutputTokens?: number; // Equivalent to max_tokens for OpenAI
  topP?: number; // Equivalent to top_p for OpenAI
  topK?: number; // For models that support it (e.g., Google Gemini)
  responseFormat?: { type: 'json_object' | 'text' }; // For JSON mode
  stopSequences?: string[];
  seed?: number; // For deterministic outputs
  // Embedding specific parameters (optional)
  dimensions?: number; // For embedding models that support it
  // Safety features (e.g., Google Gemini)
  enableSafetyFeatures?: boolean;
}

/**
 * Configuration for the AI Client's interaction with models.
 */
export interface AIClientConfig {
  defaultGenerationModelId: string; // References AIModelConfig.id for default generation model
  defaultEmbeddingModelId: string; // References AIModelConfig.id for default embedding model
  maxConcurrentRequests: number; // Max concurrent LLM API requests using p-limit
  requestDelayMs: number; // Delay between requests to avoid rate limits (applied by p-limit)
  maxRetries: number; // Max retry attempts for failed LLM requests (applied by AI SDK or retry wrapper)
  retryDelayMs: number; // Initial delay for retries (exponential backoff applied)
  maxTokensPerBatch: number; // Max tokens for a batch of code sent to LLM for JSDoc generation
}

export interface EmbeddingConfig {
  enabled: boolean;
  modelId: string; // References AIModelConfig.id for the embedding model
  minRelationshipScore: number; // Minimum cosine similarity score for a related symbol
  maxRelatedSymbols: number; // Maximum number of related symbols to include
  embeddingBatchSize: number; // Number of texts to send in a single embedding API request
}

// --- Main Configuration Interface ---
export interface GeneratorConfig {
  workspaceDirs: string[];
  includePatterns: string[];
  ignorePatterns: string[];
  targetPaths: string[]; // Files specifically targeted via CLI
  aiModels: AIModelConfig[]; // New simplified array of AI models
  embeddingConfig: EmbeddingConfig;
  aiClientConfig: AIClientConfig;
  jsdocConfig: {
    prioritizeExports: boolean;
    includePrivate: boolean;
    includeNodeKinds: string[]; // Specific TS node kinds to include
    excludeNodeKinds: string[]; // Specific TS node kinds to exclude
    maxSnippetLength: number; // Max length of code snippet sent to LLM
    generateExamples: boolean; // Whether AI should generate JSDoc examples
    overwriteExisting: boolean; // Force overwrite existing JSDoc comments
    mergeExisting: boolean; // Merge new JSDoc with existing (if not overwriting)
    minJsdocLength: number; // Minimum length for a generated JSDoc to be considered valid
    includeSymbolReferences: boolean; // Include direct symbol usages in context/output
    includeRelatedSymbols: boolean; // Include semantically related symbols (from embeddings)
  };
  outputConfig: {
    reportFileName: string;
    reportDir: string;
    logLevel: LogLevel;
  };
  dryRun: boolean; // CLI flag: simulate changes
  forceOverwrite: boolean; // CLI flag: force overwrite all existing JSDoc
  noMergeExisting: boolean; // CLI flag: disable merging, implies overwrite behavior
  disableEmbeddings: boolean; // CLI flag: disable embedding-based features
  plugins?: PluginConfig[];
  telemetry?: TelemetryConfig;
  qualityThresholds?: {
    minimumScore: number;
    requireDescriptions: boolean;
    requireExamples: boolean;
    requireParams: boolean;
    requireReturns: boolean;
  };
  performance?: {
    enableCaching: boolean;
    maxConcurrentFiles: number; // Maximum number of files to process concurrently
    batchSize: number; // Batch size for internal processing (different from embeddingBatchSize)
    timeoutMs: number;
  };
  migration?: {
    enableAutoMigration: boolean;
    backupConfigs: boolean;
    migrationLogLevel: 'silent' | 'normal' | 'verbose';
  };
  watchMode?: {
    enabled: boolean;
    debounceMs: number;
    ignorePatterns: string[];
    includePatterns: string[];
  };
  productionMode?: boolean; // Indicates if the configuration is optimized for production
}

// --- Plugin Types ---
export interface Plugin {
  name: string;
  version: string;
  description: string;
  initialize?(config: GeneratorConfig): Promise<void>;
  beforeProcessing?(context: NodeContext): Promise<NodeContext>;
  afterProcessing?(context: NodeContext, result: string): Promise<string>;
  onComplete?(stats: ProcessingStats): Promise<void>;
  onError?(error: Error, context?: NodeContext): Promise<void>;
  enable(): void;
  disable(): void;
  isEnabled(): boolean;
  getTools?(): VercelAITool[]; // New: Plugins can provide AI SDK tools
}

export interface PluginConfig {
  name: string;
  enabled: boolean;
  options?: Record<string, unknown>;
  version?: string;
  priority?: number;
}

// --- Telemetry Types ---
export interface TelemetryConfig {
  enabled: boolean;
  endpoint?: string;
  anonymize: boolean;
  collectPerformance: boolean;
  collectErrors: boolean;
}

export interface TelemetryData {
  sessionId: string;
  timestamp: Date;
  version: string;
  environment: {
    nodeVersion: string;
    platform: string;
    architecture: string;
  };
  configuration: {
    aiModelsCount: number; // Renamed from llmProviders
    embeddingsEnabled: boolean;
    pluginsEnabled: number;
    workspaceDirs: number;
  };
  performance: {
    totalDuration: number;
    averageProcessingTime: number;
    cacheHitRate: number;
    memoryUsage?: number[];
    cpuUsage?: number[];
    apiCalls: number; // Number of actual LLM API calls made
    errorsEncountered: number;
  };
  quality: {
    averageScore: number;
    improvementSuggestions: number;
    coveragePercentage: number;
  };
  usage: {
    filesProcessed: number;
    nodesAnalyzed: number;
    jsdocsGenerated: number;
    embeddings: number;
    features: Record<string, boolean>; // e.g., { incremental: true, watchMode: false }
  };
}

// --- Vercel AI SDK specific types for internal use ---
export interface VercelAITool {
  name: string;
  description: string;
  parameters: ToolDefinition['parameters'];
  execute: (...args: any[]) => Promise<any>; // Matches AI SDK tool execute signature
}

// --- Command Execution Context (Phase 2 & 3) ---
// This context will be passed down through the command runner and operations
export interface CommandContext {
  baseDir: string;
  config: GeneratorConfig; // The resolved configuration for the current run
  cacheManager: CacheManager;
  telemetry: TelemetryCollector;
  pluginManager: PluginManager;
  cliOptions: CliOptions;
  // Add other shared resources as needed like ReportGenerator, Project instance, etc.
}

// --- Operations & Command Interfaces (Phase 2) ---
export interface IOperation {
  execute(context: CommandContext): Promise<ProcessingStats | void>;
}

export interface ICommand {
  execute(context: CommandContext, ...args: any[]): Promise<void>;
}

