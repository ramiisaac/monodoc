#!/usr/bin/env node
// This file is NOT the CLI entry point anymore.
// It contains the 'main' function which orchestrates the core JSDoc generation logic,
// and is called by the `src/cli.ts` (or specific command handlers).

import { performance } from 'perf_hooks';
import * as dotenv from 'dotenv';
import path from 'path';
import { Project } from 'ts-morph';

import { loadAndMergeConfig } from './config';
import { GenerateDocumentationOperation } from './operations/GenerateDocumentationOperation';
import { logger, setLogLevel } from './utils/logger';
import { ReportGenerator } from './reporting/ReportGenerator';
import { GeneratorConfig, CliOptions, ProcessingStats, CommandContext } from './types';
import { CacheManager } from './utils/CacheManager';
import { TelemetryCollector } from './analytics/TelemetryCollector';
import { PluginManager } from './plugins/PluginManager';
import { ProductionOptimizer } from './utils/ProductionOptimizer';
import { AuthManager } from './config/AuthManager'; // Although not directly used in main, good to keep in case.
import { handleCriticalError } from './utils/errorHandling';

dotenv.config(); // Load environment variables from .env file

/**
 * The main orchestration function for the JSDoc generation process.
 * This function is called by various CLI commands (e.g., 'generate', 'watch', 'incremental').
 * It sets up the shared command context and executes the core `GenerateDocumentationOperation`.
 * @param cliOptions - Options parsed from the command line.
 * @returns A Promise that resolves when the generation process is complete.
 */
export async function main(cliOptions: CliOptions): Promise<void> {
  const baseDir = process.cwd();
  const startTime = performance.now();

  logger.info('🚀 Starting AI-powered JSDoc generation for TypeScript monorepos');
  logger.info(
    `🚀 Running Monorepo JSDoc AI Generator v${process.env.npm_package_version || '2.0.1'}`,
  );
  logger.info(`📁 Base directory: ${baseDir}`);

  let config: GeneratorConfig;
  let cacheManager: CacheManager;
  let telemetry: TelemetryCollector;
  let pluginManager: PluginManager;
  let project: Project;
  let reportGenerator: ReportGenerator;

  try {
    // 1. Load and merge configuration
    config = await loadAndMergeConfig(cliOptions.configPath);

    // Apply CLI overrides that affect config logic (like dryRun, noEmbed)
    // Note: Model and API key overrides are handled in `src/cli.ts` before this `main` is called.
    config = applyCliOverridesToConfig(config, cliOptions);

    // Set global log level based on resolved config (can be overridden by --verbose)
    if (cliOptions.verbose) {
      config.outputConfig.logLevel = 'debug';
    }
    setLogLevel(config.outputConfig.logLevel);

    // Apply production optimizations if enabled in config and NODE_ENV is production
    if (process.env.NODE_ENV === 'production' && config.productionMode) {
      const issues = ProductionOptimizer.validateProductionReadiness(config);
      if (issues.length > 0) {
        logger.warn('⚠️ Production readiness issues found:');
        issues.forEach((issue) => logger.warn(`  • ${issue}`));
      }
      config = ProductionOptimizer.optimizeForProduction(config);
    }

    // 2. Initialize CacheManager
    cacheManager = new CacheManager(path.join(baseDir, '.jsdoc-cache'));
    await cacheManager.initialize();
    if (cliOptions.cacheClear) {
      await cacheManager.clear();
      logger.info('🗑️ Cache cleared as requested.');
    }

    // 3. Initialize TelemetryCollector
    telemetry = TelemetryCollector.getInstance(config);

    // 4. Initialize PluginManager and load/enable plugins
    pluginManager = new PluginManager(config);
    if (config.plugins) {
      for (const pluginConfig of config.plugins) {
        if (pluginConfig.enabled) {
          try {
            await pluginManager.loadPlugin(pluginConfig.name);
            pluginManager.enablePlugin(pluginConfig.name);
          } catch (error) {
            logger.warn(`Failed to load/enable plugin ${pluginConfig.name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }

    // 5. Initialize ts-morph Project (used by WorkspaceAnalyzer and others)
    project = new Project({
      tsConfigFilePath: path.join(baseDir, 'tsconfig.json'),
      skipAddingFilesFromTsConfig: true, // Files will be added explicitly by WorkspaceAnalyzer
      skipFileDependencyResolution: true, // Resolution will be done after all files added
      useInMemoryFileSystem: false,
    });

    // 6. Initialize ReportGenerator
    reportGenerator = new ReportGenerator(baseDir);

    // Construct the CommandContext that will be passed to operations
    const commandContext: CommandContext = {
      baseDir,
      config,
      cacheManager,
      telemetry,
      pluginManager,
      project,
      reportGenerator,
      cliOptions, // Pass original CLI options for mode-specific behavior
    };

    // --- Execute the core documentation generation operation ---
    const generateOperation = new GenerateDocumentationOperation();
    const stats = await generateOperation.execute(commandContext);

    // Finalize telemetry data collection and sending
    const telemetryData = await telemetry.collectTelemetry(stats);
    await telemetry.sendTelemetry(telemetryData);

    logger.success(`✅ JSDoc generation completed in ${stats.durationSeconds!.toFixed(2)}s`);
    logger.info(
      `📈 Stats: ${stats.successfulJsdocs} successful, ${stats.failedJsdocs} failed, ${stats.skippedJsdocs} skipped`,
    );
    logger.info(
      `🧠 Embeddings: ${stats.embeddingSuccesses} successful, ${stats.embeddingFailures} failed`,
    );
    logger.info(`🔗 Relationships: ${stats.totalRelationshipsDiscovered} discovered`);

    if (telemetryData.performance.cacheHitRate > 0) {
      logger.info(
        `💾 Cache efficiency: ${(telemetryData.performance.cacheHitRate * 100).toFixed(1)}% hit rate`,
      );
    }

    if (config.dryRun) {
      logger.info('🔍 Dry run completed - no files were modified');
    } else {
      logger.info(`📝 Modified ${stats.modifiedFiles} files`);
    }

    if (process.env.NODE_ENV === 'production' && config.productionMode) {
      logger.info('\n🎯 Production Deployment Checklist:');
      logger.info('  ✅ Configuration optimized');
      logger.info('  ✅ Performance monitoring enabled');
      logger.info('  ✅ Error handling configured');
      logger.info('  ✅ Reports generated');
      if (config.telemetry?.enabled) {
        logger.info('  ✅ Analytics dashboard available');
      }
    }

  } catch (error) {
    // Top-level error handling for `main` function
    handleCriticalError(error, 'main JSDoc generation process');
  }
}

/**
 * Applies CLI overrides to the loaded configuration.
 * This is necessary because CLI flags take precedence over config file settings.
 * This function should only apply overrides relevant to the core generation logic
 * and not those that trigger separate commands (like `setup`, `validate-config`).
 * @param config The base configuration.
 * @param cliOptions The CLI options.
 * @returns The modified configuration.
 */
function applyCliOverridesToConfig(config: GeneratorConfig, cliOptions: CliOptions): GeneratorConfig {
  const newConfig = { ...config }; // Create a shallow copy

  if (cliOptions.dryRun || cliOptions.noWrite) {
    newConfig.dryRun = true;
  }
  if (cliOptions.forceOverwrite) {
    newConfig.forceOverwrite = true;
    newConfig.jsdocConfig.overwriteExisting = true;
  }
  if (cliOptions.noMergeExisting) {
    newConfig.noMergeExisting = true;
    newConfig.jsdocConfig.mergeExisting = false;
  }
  if (cliOptions.targetPaths && cliOptions.targetPaths.length > 0) {
    // Merge target paths from CLI with any existing in config
    newConfig.targetPaths = [...(newConfig.targetPaths || []), ...cliOptions.targetPaths];
  }
  if (cliOptions.noEmbed) {
    newConfig.disableEmbeddings = true;
    newConfig.embeddingConfig.enabled = false;
  }
  // Verbose is handled at the log level setting.
  // Model and API key overrides are applied in src/cli.ts before this function is called.
  // `template` option might be passed through `cliOptions` for `SmartDocumentationEngine`.

  return newConfig;
}

// Global error handlers for robustness
process.on('unhandledRejection', (reason) => {
  handleCriticalError(reason, 'unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  handleCriticalError(error, 'uncaught exception');
});

