import { MonorepoJSDocGenerator } from '../../src/generator/JSDocGenerator';
import { WorkspaceAnalyzer } from '../../src/analyzer/WorkspaceAnalyzer';
import { DynamicTemplateSystem } from '../../src/features/DynamicTemplateSystem';
import { SmartDocumentationEngine } from '../../src/features/SmartDocumentationEngine';
import { CacheManager } from '../../src/utils/CacheManager';
import { PerformanceMonitor } from '../../src/utils/PerformanceMonitor';
import { logger } from '../../src/utils/logger';
import { Project } from 'ts-morph';
import { TelemetryCollector } from '../../src/analytics/TelemetryCollector';
import { PluginManager } from '../../src/plugins/PluginManager';
import { ReportGenerator } from '../../src/reporting/ReportGenerator';
import path from 'path';

// This file demonstrates a complete workflow of JSDoc generation,
// including initial setup, incremental updates, and quality checks.

export class CompleteWorkflowExample {
  private generator: MonorepoJSDocGenerator;
  private analyzer: WorkspaceAnalyzer;
  private project: Project;
  private cacheManager: CacheManager;
  private telemetry: TelemetryCollector;
  private pluginManager: PluginManager;
  private reportGenerator: ReportGenerator;

  constructor(baseDir: string, config: any) { // config is simplified for example, real config is full GeneratorConfig
    this.project = new Project({
      tsConfigFilePath: path.join(baseDir, 'tsconfig.json'),
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      useInMemoryFileSystem: false,
    });
    this.analyzer = new WorkspaceAnalyzer(this.project);
    this.cacheManager = new CacheManager(path.join(baseDir, '.jsdoc-cache-example'));
    this.telemetry = TelemetryCollector.getInstance(config); // Pass basic config
    this.pluginManager = new PluginManager(config);
    this.reportGenerator = new ReportGenerator(baseDir);

    // Initial dummy packages and symbolMap, these will be filled by analyzer
    const initialPackages = [];
    const initialSymbolMap = new Map();

    this.generator = new MonorepoJSDocGenerator(
      this.project,
      initialPackages, // Will be updated internally after analysis
      config,
      baseDir,
      initialSymbolMap, // Will be updated internally after analysis
      this.cacheManager,
      this.reportGenerator // Pass report generator
    );

    // Register some example plugins for this workflow (if they exist)
    this.pluginManager.loadPlugin(path.resolve(baseDir, 'examples/plugins/react-component.ts')).catch(logger.error);
    this.pluginManager.loadPlugin(path.resolve(baseDir, 'examples/plugins/api-documentation.ts')).catch(logger.error);
    this.pluginManager.enablePlugin('react-component-plugin');
    this.pluginManager.enablePlugin('api-documentation-plugin');
  }

  async runCompleteWorkflow(config: any): Promise<void> {
    try {
      logger.info('Starting complete workflow example...');
      await this.cacheManager.initialize();

      // Ensure config's baseDir is set for analyzer
      const currentConfig = { ...config, baseDir: process.cwd() };

      const { packages, batches, symbolMap } = await this.analyzer.analyze(currentConfig, currentConfig.baseDir);

      // Update generator's internal state with actual packages and symbol map
      this.generator['packages'] = packages;
      this.generator['symbolMap'] = symbolMap;
      this.generator['nodeContextExtractor'].updateSymbolMap(symbolMap);
      this.generator['nodeContextExtractor'].updatePackages(packages);
      this.generator['relationshipAnalyzer'].updatePackages(packages);

      this.generator.initializeProgressBar(batches.reduce((sum, b) => sum + b.files.length, 0));
      await this.generator.setupRelationshipAnalysis();

      for (let i = 0; i < batches.length; i++) {
        await this.generator.processBatch(batches[i], i);
      }

      const stats = this.generator.getStats();
      logger.info('Complete workflow example finished. Stats:', stats);

      // Manual report generation for example purposes
      await this.reportGenerator.generateMarkdownSummary(stats, 'complete-workflow-summary.md', './reports/examples');
      await this.reportGenerator.generateJsonReport(stats, 'complete-workflow-report.json', './reports/examples');

    } catch (error) {
      console.error('Complete workflow failed:', error);
      throw error;
    }
  }

  async runIncrementalUpdate(config: any): Promise<void> {
    logger.info('Running incremental update example...');
    const gitAnalyzer = new (await import('../../src/analyzer/GitAnalyzer')).GitAnalyzer(process.cwd()); // Directly import GitAnalyzer
    const changedFiles = await gitAnalyzer.getChangedFiles();

    if (changedFiles.length === 0) {
      logger.info('No changes detected, skipping documentation update');
      return;
    }

    const filesToProcess = changedFiles
        .filter(change => ['A', 'M'].includes(change.status) && (change.path.endsWith('.ts') || change.path.endsWith('.tsx')))
        .map(change => change.path);

    if (filesToProcess.length === 0) {
        logger.info('No relevant changes to process incrementally.');
        return;
    }

    const currentConfig = { ...config, baseDir: process.cwd(), targetPaths: filesToProcess, dryRun: false }; // Ensure targetPaths and dryRun are set
    const { packages, batches, symbolMap } = await this.analyzer.analyze(currentConfig, currentConfig.baseDir);

    this.generator['config'] = currentConfig; // Update generator with incremental config
    this.generator['packages'] = packages;
    this.generator['symbolMap'] = symbolMap;
    this.generator['nodeContextExtractor'].updateSymbolMap(symbolMap);
    this.generator['nodeContextExtractor'].updatePackages(packages);
    this.generator['relationshipAnalyzer'].updatePackages(packages);

    this.generator.initializeProgressBar(batches.reduce((sum, b) => sum + b.files.length, 0));
    await this.generator.setupRelationshipAnalysis();

    for (let i = 0; i < batches.length; i++) {
        await this.generator.processBatch(batches[i], i);
    }

    const stats = this.generator.getStats();
    logger.info(`Updated documentation for ${stats.modifiedFiles} files via incremental update`);
    await this.reportGenerator.generateMarkdownSummary(stats, 'incremental-update-summary.md', './reports/examples');
  }

  async runQualityCheck(config: any): Promise<void> {
    logger.info('Running quality check example...');
    const qualityAnalyzer = new (await import('../../src/analyzer/QualityAnalyzer')).DocumentationQualityAnalyzer(); // Directly import
    const { packages } = await this.analyzer.analyze(config, process.cwd());

    let totalNodes = 0;
    let qualityScores: number[] = [];
    // This is a simplified quality check for the example, a real one would be more detailed
    for (const pkg of packages) {
      const sourceFiles = this.project.addSourceFilesAtPaths(path.join(pkg.path, '**/*.{ts,tsx}'));
      for (const sourceFile of sourceFiles) {
        const nodes = sourceFile.getDescendants().filter((node): node is import('ts-morph').JSDocableNode => 'getJsDocs' in node); // Corrected Type
        for (const node of nodes) {
          totalNodes++;
          const metrics = qualityAnalyzer.analyzeNode(node);
          qualityScores.push(metrics.overallScore);
        }
      }
    }
    const averageQuality = qualityScores.length > 0 ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0;
    logger.info(`Quality check completed. Average Score: ${averageQuality.toFixed(1)}/100`);
    await this.reportGenerator.generateQualityReport({ overallScore: averageQuality, totalNodesAnalyzed: totalNodes, successfulJsdocs: qualityScores.filter(s => s > 0).length, qualityMetrics: { completeness: averageQuality, consistency: 80, exampleQuality: 70 }, recommendations: [] }, './reports/examples');
  }
}

async function main() {
  const baseDir = process.cwd();
  // Simplified config for example purposes. In real usage, load from jsdoc-config.yaml
  const exampleConfig = {
    workspaceDirs: ['examples', 'src'], // Ensure these exist in your project root for the example to work
    includePatterns: ['**/*.ts', '**/*.tsx'],
    ignorePatterns: ['**/node_modules/**', '**/dist/**', '**/*.test.ts'],
    aiModels: [
      { id: 'openai-example-gen', provider: 'openai', model: 'gpt-4o', type: 'generation', apiKeyEnvVar: 'OPENAI_API_KEY', temperature: 0.3, maxOutputTokens: 2000 },
      { id: 'openai-example-embed', provider: 'openai', model: 'text-embedding-3-small', type: 'embedding', apiKeyEnvVar: 'OPENAI_API_KEY', dimensions: 1536 }
    ],
    aiClientConfig: {
      defaultGenerationModelId: 'openai-example-gen',
      defaultEmbeddingModelId: 'openai-example-embed',
      maxConcurrentRequests: 2, // Keep low for example
      requestDelayMs: 500,
      maxRetries: 1,
      retryDelayMs: 1000,
      maxTokensPerBatch: 4000
    },
    embeddingConfig: { enabled: true, modelId: 'openai-example-embed', minRelationshipScore: 0.7, maxRelatedSymbols: 3, embeddingBatchSize: 5 },
    jsdocConfig: { prioritizeExports: true, includePrivate: false, includeNodeKinds: [], excludeNodeKinds: [], maxSnippetLength: 1000, generateExamples: true, overwriteExisting: false, mergeExisting: true, minJsdocLength: 50, includeSymbolReferences: true, includeRelatedSymbols: true },
    outputConfig: { reportFileName: 'example-report.json', reportDir: './reports/examples', logLevel: 'info' },
    dryRun: true, // Run examples in dry-run mode by default
    forceOverwrite: false,
    noMergeExisting: false,
    disableEmbeddings: false,
    plugins: [
        { name: 'react-component-plugin', enabled: true },
        { name: 'api-documentation-plugin', enabled: true }
    ]
  };

  const example = new CompleteWorkflowExample(baseDir, exampleConfig);
  try {
    // Requires OPENAI_API_KEY to be set in environment
    // For local testing, ensure 'examples' and 'src' dirs are valid for analysis
    await example.runCompleteWorkflow(exampleConfig);
    // await example.runIncrementalUpdate(exampleConfig); // Uncomment to test incremental
    // await example.runQualityCheck(exampleConfig); // Uncomment to test quality check
  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

