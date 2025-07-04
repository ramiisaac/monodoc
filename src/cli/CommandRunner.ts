import { CommandContext, CliOptions, ICommand, ProcessingStats, GeneratorConfig } from '../types';
import { logger } from '../utils/logger';
import { loadAndMergeConfig } from '../config';
import { CacheManager } from '../utils/CacheManager';
import { TelemetryCollector } from '../analytics/TelemetryCollector';
import { PluginManager } from '../plugins/PluginManager';
import { ReportGenerator } from '../reporting/ReportGenerator';
import { Project } from 'ts-morph';
import path from 'path';
import { setLogLevel } from '../utils/logger';
import { AIClient } from '../generator/AIClient';

/**
 * Manages the execution context and lifecycle of CLI commands.
 * It's responsible for initializing shared resources, loading configuration,
 * and passing a consistent `CommandContext` to command handlers.
 */
export class CommandRunner {
  private baseDir: string;
  private cliOptions: CliOptions;
  private config?: GeneratorConfig; // Loaded configuration
  private cacheManager?: CacheManager;
  private telemetry?: TelemetryCollector;
  private pluginManager?: PluginManager;
  private project?: Project; // ts-morph project instance
  private reportGenerator?: ReportGenerator;

  constructor(baseDir: string, cliOptions: CliOptions) {
    this.baseDir = baseDir;
    this.cliOptions = cliOptions;
  }

  /**
   * Executes a given command. It handles the initial setup of the environment
   * and provides the command with a comprehensive context.
   * @param command The ICommand instance to execute.
   */
  async run(command: ICommand): Promise<void> {
    try {
      await this.initializeContext();
      if (
        !this.config ||
        !this.cacheManager ||
        !this.telemetry ||
        !this.pluginManager ||
        !this.project ||
        !this.reportGenerator
      ) {
        throw new Error('CommandRunner context not fully initialized.');
      }

      // Create AIClient if not already present
      const aiClient = new AIClient(this.config, this.cacheManager);

      const context: CommandContext = {
        baseDir: this.baseDir,
        config: this.config,
        cacheManager: this.cacheManager,
        telemetry: this.telemetry,
        pluginManager: this.pluginManager,
        cliOptions: this.cliOptions,
        project: this.project, // Pass the project instance
        reportGenerator: this.reportGenerator, // Pass the report generator
        aiClient, // Add aiClient
      };

      // Execute the command, passing the full context
      await command.execute(context);

      logger.info('Command execution completed.');
    } catch (error) {
      logger.error(
        `Command execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Re-throw or handle critical error externally if needed,
      // as `CommandRunner` itself doesn't decide on process exit.
      throw error;
    } finally {
      // Ensure resources are cleaned up if necessary
      this.telemetry
        ?.sendTelemetry(await this.telemetry.collectTelemetry({} as ProcessingStats))
        .catch((err) => {
          logger.warn(`Failed to send final telemetry: ${err.message}`);
        });
      // Any other global teardown
    }
  }

  /**
   * Initializes all necessary shared resources and loads the configuration.
   * This method ensures that all commands have access to a consistent set of tools and data.
   */
  private async initializeContext(): Promise<void> {
    logger.debug('Initializing command context...');

    // 1. Load and merge configuration
    this.config = await loadAndMergeConfig(this.cliOptions.configPath);

    // Apply CLI overrides that affect config logic (like dryRun, noEmbed)
    this.config = this.applyCliOverridesToConfig(this.config, this.cliOptions);

    // Set global log level based on resolved config (can be overridden by --verbose)
    if (this.cliOptions.verbose) {
      this.config.outputConfig.logLevel = 'debug';
    }
    setLogLevel(this.config.outputConfig.logLevel);

    // 2. Initialize CacheManager
    this.cacheManager = new CacheManager(path.join(this.baseDir, '.jsdoc-cache'));
    await this.cacheManager.initialize();
    if (this.cliOptions.cacheClear) {
      await this.cacheManager.clear();
      logger.info('🗑️ Cache cleared as requested.');
    }

    // 3. Initialize TelemetryCollector
    this.telemetry = TelemetryCollector.getInstance(this.config);

    // 4. Initialize PluginManager and load/enable plugins
    this.pluginManager = new PluginManager(this.config);
    if (this.config.plugins) {
      for (const pluginConfig of this.config.plugins) {
        if (pluginConfig.enabled) {
          try {
            await this.pluginManager.loadPlugin(pluginConfig.name);
            this.pluginManager.enablePlugin(pluginConfig.name);
          } catch (error) {
            logger.warn(
              `Failed to load/enable plugin ${pluginConfig.name}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    }

    // 5. Initialize ts-morph Project
    this.project = new Project({
      tsConfigFilePath: path.join(this.baseDir, 'tsconfig.json'),
      skipAddingFilesFromTsConfig: true, // Files will be added explicitly by WorkspaceAnalyzer
      skipFileDependencyResolution: true, // Resolution will be done after all files added
      useInMemoryFileSystem: false,
    });

    // 6. Initialize ReportGenerator
    this.reportGenerator = new ReportGenerator(this.baseDir);

    logger.debug('Command context initialized successfully.');
  }

  /**
   * Applies CLI overrides to the loaded configuration.
   * This is necessary because CLI flags take precedence over config file settings.
   * @param config The base configuration.
   * @param cliOptions The CLI options.
   * @returns The modified configuration.
   */
  private applyCliOverridesToConfig(
    config: GeneratorConfig,
    cliOptions: CliOptions,
  ): GeneratorConfig {
    const newConfig = { ...config };

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
      newConfig.targetPaths = [...(newConfig.targetPaths || []), ...cliOptions.targetPaths];
    }
    if (cliOptions.noEmbed) {
      newConfig.disableEmbeddings = true;
      newConfig.embeddingConfig.enabled = false;
    }
    // `model` and `apiKey` overrides are handled in `main.ts` before `loadAndMergeConfig`
    // `verbose` is handled in initializeContext to set the log level.

    // Commands like watch, incremental, qualityCheck, benchmark, setup, validateConfig, analyzeOnly
    // are mutually exclusive modes that are handled by specific ICommand implementations,
    // so they don't directly modify the config here.

    return newConfig;
  }
}
