import { TelemetryData, ProcessingStats, GeneratorConfig, AIModelConfig } from '../types';
import { logger } from '../utils/logger';
import crypto from 'crypto';

/**
 * Collects various telemetry data points about the application's usage,
 * performance, and configuration.
 */
class TelemetryCollector {
  private static instance: TelemetryCollector; // Singleton instance
  private sessionId: string; // Unique session ID for each run
  private cacheHits = 0;
  private cacheMisses = 0;
  private config: GeneratorConfig; // Store the initial configuration

  /**
   * Private constructor to enforce singleton pattern.
   * @param config The GeneratorConfig at the time of initialization.
   */
  private constructor(config: GeneratorConfig) {
    this.sessionId = crypto.randomBytes(16).toString('hex');
    this.config = config;
  }

  /**
   * Returns the singleton instance of TelemetryCollector.
   * Initializes it if it doesn't exist.
   * @param config The GeneratorConfig required for initialization if it's the first call.
   * @returns The TelemetryCollector instance.
   */
  public static getInstance(config: GeneratorConfig): TelemetryCollector {
    if (!TelemetryCollector.instance) {
      TelemetryCollector.instance = new TelemetryCollector(config);
    }
    // Update config on subsequent getInstance calls if telemetry is reused across config changes
    TelemetryCollector.instance.config = config;
    return TelemetryCollector.instance;
  }

  /**
   * Records a cache hit.
   */
  recordCacheHit(): void {
    this.cacheHits++;
  }

  /**
   * Records a cache miss.
   */
  recordCacheMiss(): void {
    this.cacheMisses++;
  }

  /**
   * Calculates the cache hit rate.
   * @returns The cache hit rate (0 to 1).
   */
  getCacheHitRate(): number {
    const totalRequests = this.cacheHits + this.cacheMisses;
    return totalRequests > 0 ? this.cacheHits / totalRequests : 0;
  }

  /**
   * Collects all relevant telemetry data for a completed processing run.
   * @param stats The ProcessingStats object from the completed run.
   * @returns A Promise that resolves to the collected TelemetryData.
   */
  async collectTelemetry(stats: ProcessingStats): Promise<TelemetryData> {
    const telemetryData: TelemetryData = {
      sessionId: this.sessionId, // Use the instance's session ID
      timestamp: new Date(),
      version: process.env.npm_package_version || '2.0.1', // Current app version
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
      },
      configuration: this.getConfigurationData(),
      performance: this.getPerformanceData(stats),
      quality: this.getQualityData(stats),
      usage: this.getUsageData(stats),
    };
    return telemetryData;
  }

  /**
   * Extracts relevant configuration data for telemetry.
   * Anonymizes sensitive details like API keys.
   */
  private getConfigurationData() {
    const aiModelsCount = this.config.aiModels?.length || 0;
    const pluginsEnabledCount = this.config.plugins?.filter((p) => p.enabled).length || 0;

    return {
      aiModelsCount: aiModelsCount,
      embeddingsEnabled: this.config.embeddingConfig?.enabled || false,
      pluginsEnabled: pluginsEnabledCount,
      workspaceDirs: this.config.workspaceDirs?.length || 0,
      // You could also add anonymized hash of specific config settings like
      // `jsdocConfig.generateExamples` or `qualityThresholds.minimumScore`
    };
  }

  /**
   * Extracts performance data for telemetry.
   * @param stats The ProcessingStats object.
   */
  private getPerformanceData(stats: ProcessingStats) {
    const duration = stats.durationSeconds || 0;
    const processedFiles = stats.processedFiles || 0;
    const totalNodesConsidered = stats.totalNodesConsidered || 0;

    return {
      totalDuration: duration,
      averageProcessingTime: processedFiles > 0 ? duration / processedFiles : 0,
      cacheHitRate: this.getCacheHitRate(),
      // Memory and CPU usage can be sampled throughout execution and passed here
      // For simplicity, we get current usage at collection time.
      memoryUsage: [process.memoryUsage().heapUsed],
      cpuUsage: [process.cpuUsage().user],
      apiCalls: stats.successfulJsdocs + stats.failedJsdocs, // Approximation of LLM API calls
      errorsEncountered: stats.errors.length,
    };
  }

  /**
   * Extracts quality data for telemetry.
   * @param stats The ProcessingStats object.
   */
  private getQualityData(stats: ProcessingStats) {
    const safeDivide = (a: number, b: number) => (b > 0 ? a / b : 0);
    const successRate = safeDivide(stats.successfulJsdocs, Math.max(stats.totalNodesConsidered, 1));

    // A simplified quality score calculation for telemetry
    const baseScore = successRate * 100;
    const errorPenalty =
      safeDivide(stats.errors.length, Math.max(stats.totalNodesConsidered, 1)) * 10;
    const embeddingBonus = this.config.embeddingConfig?.enabled ? 5 : 0;

    return {
      averageScore: Math.max(0, Math.min(100, baseScore - errorPenalty + embeddingBonus)),
      improvementSuggestions: stats.errors.length, // Number of errors can hint at needed improvements
      coveragePercentage: successRate * 100,
    };
  }

  /**
   * Extracts usage data for telemetry.
   * @param stats The ProcessingStats object.
   */
  private getUsageData(stats: ProcessingStats) {
    return {
      filesProcessed: stats.processedFiles,
      nodesAnalyzed: stats.totalNodesConsidered,
      jsdocsGenerated: stats.successfulJsdocs,
      embeddings: stats.embeddingSuccesses,
      features: this.getFeatureUsage(),
    };
  }

  /**
   * Determines which features were used based on the configuration.
   */
  private getFeatureUsage(): Record<string, boolean> {
    return {
      embeddings: this.config.embeddingConfig?.enabled || false,
      plugins: (this.config.plugins?.length || 0) > 0,
      watchMode: this.config.watchMode?.enabled || false,
      incremental: this.config.incremental || false, // Assuming incremental is driven by CLI flag/config
      dryRun: this.config.dryRun || false,
      // Add other feature flags as needed
    };
  }

  /**
   * Sends collected telemetry data to a configured endpoint (or saves locally in dev mode).
   * @param data The TelemetryData to send.
   */
  async sendTelemetry(data: TelemetryData): Promise<void> {
    if (!this.config.telemetry?.enabled || process.env.JSDOC_TELEMETRY_ENABLED !== 'true') {
      logger.trace('Telemetry collection disabled - respecting user privacy');
      return;
    }

    try {
      logger.trace('Telemetry data collected and ready for transmission');

      if (process.env.NODE_ENV === 'development') {
        await this.saveTelemetryLocally(data);
      } else if (this.config.telemetry.endpoint) {
        // Implement actual HTTP POST to this.config.telemetry.endpoint
        logger.debug(`Sending telemetry to: ${this.config.telemetry.endpoint}`);
        // Example (using fetch API - ensure it's available or polyfilled for Node)
        // await fetch(this.config.telemetry.endpoint, {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(data),
        // });
        logger.info('📊 Telemetry data sent (mocked/development mode)'); // Change to success if actually sent
      } else {
        logger.warn('Telemetry is enabled but no endpoint is configured for production.');
      }
    } catch (error) {
      logger.warn(
        `Failed to handle telemetry: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Saves telemetry data to a local file in development mode.
   * @param data The TelemetryData to save.
   */
  private async saveTelemetryLocally(data: TelemetryData) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const telemetryDir = path.join(process.cwd(), '.jsdoc-telemetry');
    await fs.mkdir(telemetryDir, { recursive: true });
    const filename = `telemetry-${data.sessionId}-${Date.now()}.json`;
    await fs.writeFile(path.join(telemetryDir, filename), JSON.stringify(data, null, 2));
    logger.debug(`📊 Telemetry data saved locally: ${filename}`);
  }
}
