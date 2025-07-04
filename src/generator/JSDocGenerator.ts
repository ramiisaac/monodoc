import { Project, SourceFile } from 'ts-morph';
import path from 'path';
import { logger } from '../utils/logger';
import pLimit from 'p-limit'; // For concurrency control

import {
  GeneratorConfig,
  FileBatch,
  ProcessingStats,
  WorkspacePackage,
  DetailedSymbolInfo,
  NodeContext,
  JSDocableNode,
  AIClient,
} from '../types';
import { NodeContextExtractor } from './NodeContextExtractor';
import { JSDocManipulator } from './JSDocManipulator';
import { RelationshipAnalyzer } from '../embeddings/RelationshipAnalyzer';
import { CacheManager } from '../utils/CacheManager';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';
import { DynamicTemplateSystem } from '../features/DynamicTemplateSystem';
import { SmartDocumentationEngine } from '../features/SmartDocumentationEngine';
import { DocumentationGenerator } from './DocumentationGenerator'; // New component
import { FileProcessor } from './FileProcessor'; // New component
import { ProgressBar } from '../utils/progressBar';

/**
 * `MonorepoJSDocGenerator` now acts as a high-level orchestrator or facade for the generation process.
 * It sets up the core components and manages the overall flow, but delegates
 * the actual file-level and node-level processing to smaller, specialized classes.
 *
 * This class is primarily responsible for:
 * 1. Initializing all dependent components (AIClient, extractors, manipulators, analyzers).
 * 2. Managing overall processing stats.
 * 3. Orchestrating the processing of files and batches.
 * 4. Preparing for relationship analysis (embeddings).
 * 5. Providing an API for performance metrics.
 */
export class MonorepoJSDocGenerator {
  private config: GeneratorConfig;
  private stats: ProcessingStats;
  private project: Project;
  private packages: WorkspacePackage[];
  private aiClient!: AIClient; // Initialized in setup
  private nodeContextExtractor!: NodeContextExtractor; // Initialized in setup
  private jsdocManipulator!: JSDocManipulator; // Initialized in setup
  private documentationGenerator!: DocumentationGenerator; // New component
  private fileProcessor!: FileProcessor; // New component
  private relationshipAnalyzer!: RelationshipAnalyzer; // Initialized in setup
  private baseDir: string;
  private performanceMonitor: PerformanceMonitor;
  private symbolMap: Map<string, DetailedSymbolInfo>;
  private dynamicTemplateSystem!: DynamicTemplateSystem;
  private smartDocumentationEngine!: SmartDocumentationEngine;
  private cacheManager: CacheManager;
  private concurrencyLimiter: pLimit.Limit; // Concurrency limiter for file processing

  constructor(
    project: Project,
    packages: WorkspacePackage[],
    config: GeneratorConfig,
    baseDir: string,
    symbolMap: Map<string, DetailedSymbolInfo>,
    cacheManager: CacheManager,
  ) {
    this.project = project;
    this.config = config;
    this.packages = packages;
    this.baseDir = baseDir;
    this.symbolMap = symbolMap;
    this.cacheManager = cacheManager;
    this.performanceMonitor = new PerformanceMonitor();

    // Initialize core stats. Some fields will be updated during execution.
    this.stats = {
      totalPackages: packages.length,
      totalBatches: 0,
      processedBatches: 0,
      totalFiles: 0,
      processedFiles: 0,
      modifiedFiles: 0,
      totalNodesConsidered: 0,
      successfulJsdocs: 0,
      failedJsdocs: 0,
      skippedJsdocs: 0,
      embeddingSuccesses: 0,
      embeddingFailures: 0,
      totalRelationshipsDiscovered: 0,
      startTime: performance.now(),
      errors: [],
      dryRun: config.dryRun,
      configurationUsed: this.sanitizeConfigForReport(config), // Capture config snapshot
    };

    // Initialize shared dependencies
    this.aiClient = new AIClient(this.config, this.cacheManager);
    this.dynamicTemplateSystem = new DynamicTemplateSystem();
    this.smartDocumentationEngine = new SmartDocumentationEngine();
    this.documentationGenerator = new DocumentationGenerator(
      this.aiClient,
      this.smartDocumentationEngine,
    );
    this.jsdocManipulator = new JSDocManipulator(this.config);

    // NodeContextExtractor needs the symbolMap
    this.nodeContextExtractor = new NodeContextExtractor(
      this.config,
      this.packages,
      this.baseDir,
      this.symbolMap,
    );

    // RelationshipAnalyzer needs NodeContextExtractor and AIClient
    this.relationshipAnalyzer = new RelationshipAnalyzer(
      project,
      config,
      packages,
      baseDir,
      this.nodeContextExtractor,
      this.aiClient,
    );

    // FileProcessor needs multiple components
    this.fileProcessor = new FileProcessor(
      this.project,
      this.config,
      this.baseDir,
      this.nodeContextExtractor,
      this.jsdocManipulator,
      this.documentationGenerator,
      this.relationshipAnalyzer,
    );

    this.concurrencyLimiter = pLimit(this.config.performance?.maxConcurrentFiles || 4); // Default to 4 concurrent files
    logger.success(`🎯 MonorepoJSDocGenerator initialized with ${packages.length} packages.`);
  }

  /**
   * Sanitizes the configuration object for reporting, removing sensitive information
   * like API keys and non-essential runtime flags.
   * @param config The full GeneratorConfig.
   * @returns A sanitized plain object suitable for reports.
   */
  private sanitizeConfigForReport(config: GeneratorConfig): Record<string, unknown> {
    const sanitized = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
    // Remove API keys from the reportable config, if they somehow made it in
    if (sanitized.aiModels && Array.isArray(sanitized.aiModels)) {
      sanitized.aiModels.forEach((model: any) => {
        if (model.apiKeyEnvVar && process.env[model.apiKeyEnvVar]) {
          model.apiKey = `***${(process.env[model.apiKeyEnvVar] || '').slice(-4)}`; // Mask most of the key
        }
        delete model.apiKeyEnvVar; // Remove reference to env var name
        delete model.baseUrl; // Base URL might be sensitive in some setups
      });
    }
    // Remove transient CLI flags or internal state
    delete sanitized.targetPaths;
    delete sanitized.dryRun;
    delete sanitized.forceOverwrite;
    delete sanitized.noMergeExisting;
    delete sanitized.disableEmbeddings;
    // Potentially remove full raw code snippets, etc. from sub-configs if they are too large for report
    return sanitized;
  }

  /**
   * Returns the current processing statistics.
   * @returns The ProcessingStats object.
   */
  public getStats(): ProcessingStats {
    return this.stats;
  }

  /**
   * Initializes the progress bar for visual feedback during generation.
   * @param totalFiles The total number of files to process.
   */
  public initializeProgressBar(totalFiles: number): void {
    this.progressBar = new ProgressBar(totalFiles);
  }

  /**
   * Prepares the embedding-based relationship analysis component.
   * This includes generating embeddings for all relevant nodes.
   */
  async setupRelationshipAnalysis(): Promise<void> {
    // Only set up embeddings if enabled in config and not disabled by CLI flag.
    // Also, skip if it's a dry run, as embeddings are costly.
    if (
      !this.config.dryRun &&
      this.config.embeddingConfig.enabled &&
      !this.config.disableEmbeddings
    ) {
      logger.info('Preparing for embedding-based relationship analysis...');
      try {
        // Pass all source files from the project for embedding
        await this.relationshipAnalyzer.initialize(this.project.getSourceFiles(), this.stats);
      } catch (e) {
        logger.error(
          `Failed to initialize embedding-based relationship analysis: ${
            e instanceof Error ? e.message : String(e)
          }. This feature will be skipped for this run.`,
        );
        // On critical failure, disable embeddings for the rest of the run and update stats.
        this.config.embeddingConfig.enabled = false;
        this.config.disableEmbeddings = true;
        this.stats.errors.push({
          file: 'N/A', // Context is global
          error: `Embedding initialization failed: ${e instanceof Error ? e.message : String(e)}`,
          stack: e instanceof Error ? e.stack : undefined,
          timestamp: Date.now(),
        });
      }
    } else {
      logger.info('Skipping embedding setup as disabled by configuration, CLI flag, or dry run.');
      // Ensure config flags reflect actual state if skipping
      this.config.embeddingConfig.enabled = false;
      this.config.disableEmbeddings = true;
    }
  }

  /**
   * Processes a single batch of files concurrently.
   * Each file is processed by the `FileProcessor`.
   * @param batch The FileBatch object containing file paths.
   * @param batchIndex The index of the current batch.
   */
  async processBatch(batch: FileBatch, batchIndex: number): Promise<void> {
    this.performanceMonitor.startTimer(`batch_processing_batch_${batchIndex}`);
    logger.debug(
      `📦 Processing batch ${batchIndex + 1} with ${batch.files.length} files (~${batch.estimatedTokens} tokens)`,
    );

    const fileProcessingPromises: Promise<void>[] = [];
    for (const filePath of batch.files) {
      // Use the concurrency limiter to process files within the batch in parallel
      fileProcessingPromises.push(
        this.concurrencyLimiter(() => this.fileProcessor.processFile(filePath, this.stats)),
      );
    }

    await Promise.all(fileProcessingPromises); // Wait for all files in the batch to complete

    this.stats.processedBatches++;
    const batchDuration = this.performanceMonitor.endTimer(`batch_processing_batch_${batchIndex}`);
    logger.debug(`⏱️ Batch ${batchIndex + 1} completed in ${(batchDuration / 1000).toFixed(2)}s`);

    // Update the overall progress bar
    this.progressBar?.update(this.stats.processedFiles, `Processing files...`);
  }

  /**
   * Generates a quality report summary based on the overall processing statistics.
   * This is a simplified report for the main generation run; a detailed quality
   * analysis would be performed by the `QualityCheckCommand`.
   * @returns A promise resolving to an object containing quality summary data.
   */
  async generateQualityReport(): Promise<any> {
    logger.info('📊 Generating quality analysis report summary...');

    const completeness =
      this.stats.totalNodesConsidered > 0
        ? (this.stats.successfulJsdocs / this.stats.totalNodesConsidered) * 100
        : 0;

    return {
      overallScore: parseFloat(completeness.toFixed(1)), // Simplified score
      totalNodesAnalyzed: this.stats.totalNodesConsidered,
      successfulJsdocs: this.stats.successfulJsdocs,
      qualityMetrics: {
        completeness: parseFloat(completeness.toFixed(1)),
        consistency: 85, // Placeholder if no deep analysis was performed
        exampleQuality: 78, // Placeholder
      },
      recommendations: [
        'For a more detailed quality analysis, run `ai-jsdoc quality-check`.',
        ...(this.stats.failedJsdocs > 0
          ? [`Address ${this.stats.failedJsdocs} failed JSDoc generations.`]
          : []),
        ...(this.stats.skippedJsdocs > 0
          ? [
              `Review ${this.stats.skippedJsdocs} skipped JSDoc generations (already existing, too short, or AI skipped).`,
            ]
          : []),
      ],
    };
  }

  /**
   * Retrieves performance metrics collected during the generation process.
   * @returns An object containing performance metrics.
   */
  getPerformanceMetrics(): any {
    return this.performanceMonitor.getMetrics();
  }
}
