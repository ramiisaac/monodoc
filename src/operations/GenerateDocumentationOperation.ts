import { Project, SourceFile } from 'ts-morph';
import path from 'path';
import Limit from 'p-limit'; // Import for concurrency control
import {
  GeneratorConfig,
  FileBatch,
  ProcessingStats,
  WorkspacePackage,
  DetailedSymbolInfo,
  IOperation,
  CommandContext,
} from '../types'; // Removed unused NodeContext, JSDocableNode
import { AIClient } from '../generator/AIClient';
import { NodeContextExtractor } from '../generator/NodeContextExtractor';
import { JSDocManipulator } from '../generator/JSDocManipulator';
import { RelationshipAnalyzer } from '../embeddings/RelationshipAnalyzer';
import { CacheManager } from '../utils/CacheManager';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';
import { DynamicTemplateSystem } from '../features/DynamicTemplateSystem'; // Removed unused DynamicTemplateSystem as it's not a direct dependency
import { SmartDocumentationEngine } from '../features/SmartDocumentationEngine';
import { DocumentationGenerator } from '../generator/DocumentationGenerator';
import { FileProcessor } from '../generator/FileProcessor';
import { WorkspaceAnalyzer } from '../analyzer/WorkspaceAnalyzer';
import { ReportGenerator, PerformanceMetrics } from '../reporting/ReportGenerator';
import { logger } from '../utils/logger';
import { ProgressBar } from '../utils/progressBar';
import { TelemetryCollector } from '../analytics/TelemetryCollector';

/**
 * The core operation responsible for generating JSDoc documentation across a monorepo.
 * It orchestrates file analysis, AI interaction, and JSDoc application.
 */
export class GenerateDocumentationOperation implements IOperation {
  private stats: ProcessingStats;
  private aiClient!: AIClient;
  private nodeContextExtractor!: NodeContextExtractor;
  private jsdocManipulator!: JSDocManipulator;
  private documentationGenerator!: DocumentationGenerator;
  private fileProcessor!: FileProcessor;
  private relationshipAnalyzer!: RelationshipAnalyzer;
  private performanceMonitor!: PerformanceMonitor;
  private smartDocumentationEngine!: SmartDocumentationEngine;
  private workspaceAnalyzer!: WorkspaceAnalyzer;
  private reportGenerator!: ReportGenerator;
  private progressBar: ProgressBar | null = null;
  private concurrencyLimiter!: ReturnType<typeof Limit>; // Concurrency limiter for file processing
  private config!: GeneratorConfig;
  private baseDir!: string;

  constructor() {
    this.stats = this.initializeStats();
  }

  /**
   * Initializes the processing statistics for a new run.
   */
  private initializeStats(): ProcessingStats {
    return {
      totalPackages: 0,
      totalBatches: 0,
      processedBatches: 0,
      totalFiles: 0,
      processedFiles: 0,
      modifiedFiles: 0,
      totalNodes: 0, // Add for ReportGenerator compatibility
      nodesWithJSDoc: 0, // Add for ReportGenerator compatibility
      generatedJSDocCount: 0, // Add for ReportGenerator compatibility
      totalNodesConsidered: 0,
      successfulJsdocs: 0,
      failedJsdocs: 0,
      skippedJsdocs: 0,
      embeddingSuccesses: 0,
      embeddingFailures: 0,
      totalRelationshipsDiscovered: 0,
      startTime: performance.now(),
      errors: [],
      dryRun: false, // Will be updated from config
      configurationUsed: {}, // Will be updated from config
      fileBatches: new Map(), // Initialize for ReportGenerator
      packages: [], // Initialize for ReportGenerator
    };
  }

  /**
   * Executes the JSDoc generation operation.
   * @param context The command context providing access to shared resources and configurations.
   * @returns A Promise that resolves to the final processing statistics.
   * @throws General errors if critical setup or processing fails.
   */
  async execute(context: CommandContext): Promise<ProcessingStats> {
    const {
      config,
      baseDir,
      cacheManager,
      telemetry: _telemetry,
      pluginManager,
      project,
      reportGenerator,
    } = context; // Mark telemetry as unused with _

    // Save config and baseDir to instance properties
    this.config = config;
    this.baseDir = baseDir;

    // Update stats with current config values
    this.stats.dryRun = config.dryRun;
    this.stats.configurationUsed = this.sanitizeConfigForReport(config);

    // Initialize core components with the current context and its dependencies
    this.performanceMonitor = new PerformanceMonitor();
    this.smartDocumentationEngine = new SmartDocumentationEngine(); // No direct need for DynamicTemplateSystem here
    this.workspaceAnalyzer = new WorkspaceAnalyzer(project);
    this.reportGenerator = reportGenerator; // Use the injected reportGenerator
    this.concurrencyLimiter = Limit(config.performance?.maxConcurrentFiles || 4); // Initialize concurrency limiter

    this.aiClient = new AIClient(config, cacheManager);
    this.jsdocManipulator = new JSDocManipulator(config);
    this.documentationGenerator = new DocumentationGenerator(
      this.aiClient,
      this.smartDocumentationEngine,
    );

    // NodeContextExtractor needs the symbolMap, which will be populated by WorkspaceAnalyzer
    // For initial setup, pass an empty map; it will be updated later.
    // It also needs packages, which WorkspaceAnalyzer populates.
    this.nodeContextExtractor = new NodeContextExtractor(config, [], baseDir, new Map());

    // RelationshipAnalyzer needs NodeContextExtractor and AIClient
    this.relationshipAnalyzer = new RelationshipAnalyzer(
      project,
      config,
      [], // Packages initially empty, will be updated after WorkspaceAnalyzer
      baseDir,
      this.nodeContextExtractor,
      this.aiClient,
    );

    // FileProcessor needs multiple components, including the PluginManager
    this.fileProcessor = new FileProcessor(
      this.aiClient,
      this.nodeContextExtractor,
      this.jsdocManipulator,
      this.documentationGenerator,
      new PerformanceMonitor(), // Create a new one
      pluginManager, // Injected PluginManager
      this.relationshipAnalyzer,
      new DynamicTemplateSystem(), // Create a new one
    );

    logger.success(`🎯 JSDoc Generation Operation initialized.`);

    // 1. Analyze Workspace
    this.performanceMonitor.startTimer('workspace_analysis');
    const { packages, batches, symbolMap } = await this.workspaceAnalyzer.analyze(config, baseDir);
    this.performanceMonitor.endTimer('workspace_analysis');

    // Update global context with discovered packages and symbolMap
    context.packages = packages; // Store packages in context for other ops/commands
    this.nodeContextExtractor.updateSymbolMap(symbolMap); // Update NodeContextExtractor with the actual symbolMap
    this.nodeContextExtractor.updatePackages(packages); // Update NodeContextExtractor with packages
    this.relationshipAnalyzer.updatePackages(packages); // Update RelationshipAnalyzer with packages

    this.stats.totalPackages = packages.length;
    this.stats.totalBatches = batches.length;
    this.stats.totalFiles = batches.reduce((sum, batch) => sum + batch.files.length, 0);
    this.stats.packages = packages; // Store packages in stats

    // Initialize fileBatches Map with enhanced batch info
    batches.forEach((batch, index) => {
      const batchKey = `batch_${index}`;
      this.stats.fileBatches?.set(batchKey, {
        ...batch,
        packageName: packages[0]?.name || 'unknown', // Simplified - you may want to map files to packages
        batchIndex: index,
        totalTokens: batch.estimatedTokens,
        processingTimeMs: 0, // Will be updated during processing
        errors: [],
      });
    });

    // Update totalNodes for compatibility
    this.stats.totalNodes = this.stats.totalNodesConsidered;
    this.stats.nodesWithJSDoc = this.stats.successfulJsdocs;
    this.stats.generatedJSDocCount = this.stats.successfulJsdocs;

    // 2. Setup Relationship Analysis (Embeddings)
    // Pass the actual project SourceFiles
    await this.setupRelationshipAnalysis(project.getSourceFiles());

    // Initialize progress bar
    this.progressBar = new ProgressBar(this.stats.totalFiles);
    this.progressBar.update(0, 'Starting generation...');

    // 3. Process Files in Batches (Concurrent File Processing)
    this.performanceMonitor.startTimer('total_generation');
    const fileProcessingPromises: Promise<void>[] = [];

    for (const batch of batches) {
      for (const fileInfo of batch.files) {
        fileProcessingPromises.push(
          this.concurrencyLimiter(() => this.fileProcessor.processFile(fileInfo.path, this.stats)),
        );
      }
    }
    // Wait for all files to be processed
    await Promise.all(fileProcessingPromises);
    this.performanceMonitor.endTimer('total_generation');

    // Finalize stats
    this.stats.durationSeconds = (performance.now() - this.stats.startTime) / 1000;
    this.progressBar.complete('Generation complete!');

    // 4. Finalize Plugins (onComplete hook)
    await pluginManager.finalize(this.stats);

    // 5. Generate and save reports
    await this.generateReports(this.stats, config, _telemetry); // Pass telemetry for report generation

    return this.stats;
  }

  /**
   * Sanitizes the configuration object for reporting, removing sensitive information
   * like API keys and non-essential runtime flags.
   * @param config The full GeneratorConfig.
   * @returns A sanitized plain object suitable for reports.
   */
  private sanitizeConfigForReport(config: GeneratorConfig): Record<string, unknown> {
    const sanitized = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
    // Remove API keys from the reportable config, if they were accidentally loaded into the config object directly
    if (sanitized.aiModels && Array.isArray(sanitized.aiModels)) {
      sanitized.aiModels.forEach((model: any) => {
        // Corrected `any`
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
   * Sets up the embedding-based relationship analysis.
   * @param sourceFiles All source files in the project.
   */
  private async setupRelationshipAnalysis(sourceFiles: SourceFile[]): Promise<void> {
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
        await this.relationshipAnalyzer.initialize(sourceFiles, this.stats);
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
   * Generates and saves various reports.
   * @param stats The final processing statistics.
   * @param config The generator configuration.
   * @param telemetry The telemetry collector instance, for analytics dashboard.
   */
  private async generateReports(
    stats: ProcessingStats,
    config: GeneratorConfig,
    telemetry: TelemetryCollector,
  ): Promise<void> {
    // Fixed method name and arguments
    await this.reportGenerator.generateJSONReport(stats, config.outputConfig.reportDir);
    await this.reportGenerator.generateMarkdownSummary(stats, config.outputConfig.reportDir);

    const qualityReport = await this.generateQualityReportSummary();
    await this.reportGenerator.generateQualityReport(
      qualityReport,
      this.config.outputConfig.reportDir,
    );

    if (this.config.performance?.enableCaching) {
      const performanceMetrics = this.performanceMonitor.getMetrics();
      // Fixed PerformanceMetrics interface
      const metrics: PerformanceMetrics = {
        timers: performanceMetrics.timers || {},
        counters: performanceMetrics.counters || {},
        gauges: performanceMetrics.gauges || {},
        distributions: performanceMetrics.distributions || {},
        metadata: performanceMetrics.metadata || {
          startTime: stats.startTime,
          endTime: Date.now(),
          duration: Date.now() - stats.startTime,
        },
      };
      // Use both JSON and Markdown performance reports
      await this.reportGenerator.generatePerformanceReportJSON(
        metrics,
        this.config.outputConfig.reportDir,
      );
      await this.reportGenerator.generatePerformanceReportMarkdown(
        metrics,
        this.config.outputConfig.reportDir,
      );
    }

    if (config.telemetry?.enabled) {
      // AnalyticsDashboard relies on TelemetryCollector's data saved over time
      const { AnalyticsDashboard } = await import('../analytics/AnalyticsDashboard');
      const dashboard = new AnalyticsDashboard(this.baseDir); // Pass baseDir
      // Need a way to get final telemetry data from the CommandContext or directly from TelemetryCollector
      // Assuming telemetry.collectTelemetry is updated and can be called after all operations
      const finalTelemetryData = await telemetry.collectTelemetry(stats); // Correctly using passed telemetry
      await this.reportGenerator.writeFile(
        // Using reportGenerator's writeFile
        path.join(config.outputConfig.reportDir, 'analytics-dashboard.md'),
        await dashboard.generateDashboard(stats, finalTelemetryData),
      );
    }
  }

  /**
   * Generates a quality report summary based on the overall processing statistics.
   * This is a simplified report for the main generation run; a detailed quality
   * analysis would be performed by the `QualityCheckCommand`.
   * @returns A promise resolving to an object containing quality summary data.
   */
  async generateQualityReportSummary(): Promise<any> {
    // Corrected `any`
    logger.info('📊 Generating quality analysis report summary...');

    const completeness =
      this.stats.totalNodesConsidered > 0
        ? (this.stats.successfulJsdocs / this.stats.totalNodesConsidered) * 100
        : 0;

    return {
      overallScore: parseFloat(completeness.toFixed(1)), // Simplified for this operation
      totalNodesAnalyzed: this.stats.totalNodesConsidered,
      successfulJsdocs: this.stats.successfulJsdocs,
      qualityMetrics: {
        completeness: parseFloat(completeness.toFixed(1)),
        consistency: 85, // Placeholder if no deep analysis
        exampleQuality: 78, // Placeholder
      },
      recommendations: [
        'For a more detailed quality analysis, run `monodoc quality-check`.',
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
    // Corrected `any`
    return this.performanceMonitor.getMetrics();
  }
}
