import { IOperation, CommandContext, ProcessingStats, GeneratorConfig } from '../types';
import { WorkspaceAnalyzer } from '../analyzer/WorkspaceAnalyzer';
import { logger } from '../utils/logger';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';
import path from 'path';

/**
 * Operation to perform a comprehensive analysis of the monorepo workspace.
 * It identifies packages, collects files, and analyzes symbol references.
 * This operation does not generate or modify any files.
 */
export class AnalyzeWorkspaceOperation implements IOperation {
  private performanceMonitor: PerformanceMonitor;

  constructor() {
    this.performanceMonitor = new PerformanceMonitor();
  }

  /**
   * Executes the workspace analysis.
   * @param context The command context providing access to shared resources and configurations.
   * @returns A Promise that resolves to an initialized ProcessingStats object with analysis details.
   */
  async execute(context: CommandContext): Promise<ProcessingStats> {
    const { config, baseDir, project } = context;

    const stats: ProcessingStats = this.initializeStats(config);
    this.performanceMonitor.startTimer('total_analysis');

    try {
      const workspaceAnalyzer = new WorkspaceAnalyzer(project);
      const { packages, batches, symbolMap } = await workspaceAnalyzer.analyze(config, baseDir);

      stats.totalPackages = packages.length;
      stats.totalFiles = batches.reduce((sum, batch) => sum + batch.files.length, 0);
      stats.totalNodesConsidered = symbolMap.size; // Approximation: count defined symbols

      logger.info(`🔍 Found ${packages.length} packages in ${stats.totalFiles} files.`);
      logger.info(`✨ Collected ${symbolMap.size} unique symbols across the workspace.`);

      if (packages.length === 0) {
        logger.warn(
          'No packages found to analyze in the configured workspace directories. Please check your `workspaceDirs` configuration.',
        );
      }

      logger.info('\n📦 Discovered Packages:');
      packages.forEach((pkg) => {
        logger.info(`  - ${pkg.name} (${pkg.type}) at ${pkg.path.replace(baseDir, '.')}`);
      });

      logger.info('\n📊 File Batches for Processing (based on token estimates):');
      batches.forEach((batch, index) => {
        logger.info(
          `  - Batch ${index + 1}: ${batch.files.length} files, ~${batch.estimatedTokens} tokens`,
        );
      });

      // Optionally, dump symbol map to a debug file if verbose
      if (config.outputConfig.logLevel === 'debug' || config.outputConfig.logLevel === 'trace') {
        const symbolMapPath = path.join(config.outputConfig.reportDir, 'debug-symbol-map.json');
        await context.reportGenerator.writeFile(
          symbolMapPath,
          JSON.stringify(Array.from(symbolMap.entries()), null, 2),
        );
        logger.debug(`Detailed symbol map saved to: ${symbolMapPath}`);
      }
    } catch (error) {
      logger.error(
        `Error during workspace analysis: ${error instanceof Error ? error.message : String(error)}`,
      );
      stats.errors.push({
        file: 'N/A',
        error: `Workspace analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: Date.now(),
      });
      throw error; // Re-throw to propagate error
    } finally {
      stats.durationSeconds = (performance.now() - stats.startTime) / 1000;
      this.performanceMonitor.endTimer('total_analysis');
    }

    return stats;
  }

  /**
   * Initializes processing stats for the analysis operation.
   * @param config The generator configuration.
   * @returns An initialized ProcessingStats object.
   */
  private initializeStats(config: GeneratorConfig): ProcessingStats {
    return {
      totalPackages: 0,
      totalBatches: 0,
      processedBatches: 0,
      totalFiles: 0,
      processedFiles: 0, // No files are "processed" for JSDoc in analyze-only mode
      modifiedFiles: 0, // No files are modified
      totalNodesConsidered: 0,
      successfulJsdocs: 0,
      failedJsdocs: 0,
      skippedJsdocs: 0,
      embeddingSuccesses: 0,
      embeddingFailures: 0,
      totalRelationshipsDiscovered: 0,
      startTime: performance.now(),
      errors: [],
      dryRun: true, // Analyze-only is always a dry run
      configurationUsed: {}, // Will be sanitized and populated by CommandRunner
    };
  }
}
