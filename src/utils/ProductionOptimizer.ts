import { GeneratorConfig } from '../types';
import { logger } from './logger';

/**
 * Provides utilities for optimizing the generator's configuration for production
 * environments and validating production readiness.
 */
export class ProductionOptimizer {
  /**
   * Optimizes a given `GeneratorConfig` for production use cases.
   * This typically involves setting more conservative resource limits,
   * enabling caching, and adjusting logging levels.
   * @param config The GeneratorConfig to optimize.
   * @returns A new GeneratorConfig object with production-optimized settings.
   */
  static optimizeForProduction(config: GeneratorConfig): GeneratorConfig {
    const optimized = { ...config };

    // --- AI Client Optimization ---
    // Reduce concurrent requests to be safer in shared/production environments
    optimized.aiClientConfig.maxConcurrentRequests = Math.min(
      optimized.aiClientConfig.maxConcurrentRequests,
      5, // Max 5 concurrent requests
    );
    // Increase delay between requests to avoid burst rate limits
    optimized.aiClientConfig.requestDelayMs = Math.max(
      optimized.aiClientConfig.requestDelayMs,
      200,
    );
    // Reduce retries if API errors are frequent (fail faster)
    optimized.aiClientConfig.maxRetries = Math.min(optimized.aiClientConfig.maxRetries, 3);

    // --- Embedding Optimization ---
    if (optimized.embeddingConfig.enabled) {
      // Limit batch size to reduce memory footprint and single request complexity
      optimized.embeddingConfig.embeddingBatchSize = Math.min(
        optimized.embeddingConfig.embeddingBatchSize || 10, // Default to 10 if not set
        50, // Max 50 texts per batch for embeddings
      );
    }

    // --- Output & JSDoc Generation Optimization ---
    optimized.outputConfig.logLevel = 'info'; // Default to 'info' for less noise in production logs
    optimized.jsdocConfig.generateExamples = false; // Disable complex example generation to save tokens/cost
    optimized.jsdocConfig.minJsdocLength = 50; // Ensure minimum useful JSDoc length

    // --- Performance Flags ---
    if (optimized.performance) {
      optimized.performance.enableCaching = true; // Crucial for production cost savings
      optimized.performance.maxConcurrentFiles = Math.min(
        optimized.performance.maxConcurrentFiles || 4,
        8, // Max 8 concurrent files, balance between CPU/IO and LLM calls
      );
      optimized.performance.timeoutMs = Math.max(
        optimized.performance.timeoutMs || 30000,
        60000, // Increase timeout for LLM calls in production
      );
    } else {
      // Ensure basic performance object exists and caching is enabled
      optimized.performance = {
        enableCaching: true,
        maxConcurrentFiles: 4,
        batchSize: 20,
        timeoutMs: 60000,
      };
    }

    // Ensure telemetry is enabled for production monitoring if desired, or explicitly disabled
    if (optimized.telemetry) {
      optimized.telemetry.enabled = true; // Strongly recommend enabling for prod
      optimized.telemetry.anonymize = true;
      optimized.telemetry.collectErrors = true;
      optimized.telemetry.collectPerformance = true;
    } else {
      optimized.telemetry = {
        enabled: true,
        anonymize: true,
        collectErrors: true,
        collectPerformance: true,
      };
    }

    logger.info('⚙️ Configuration optimized for production.');
    return optimized;
  }

  /**
   * Validates if the current `GeneratorConfig` is ready for production deployment.
   * It checks for critical omissions or potentially problematic settings.
   * @param config The GeneratorConfig to validate.
   * @returns An array of string issues. An empty array means it's production-ready.
   */
  static validateProductionReadiness(config: GeneratorConfig): string[] {
    const issues: string[] = [];

    // --- Basic Configuration Checks ---
    if (!config.aiModels || config.aiModels.length === 0) {
      issues.push('No AI models are configured. Production requires at least one.');
    }
    if (!config.workspaceDirs || config.workspaceDirs.length === 0) {
      issues.push('No workspace directories specified. Nothing to process.');
    }
    if (!config.outputConfig.reportDir) {
      issues.push('Report directory not configured. Important for production traceability.');
    }
    if (!config.outputConfig.reportFileName) {
      issues.push('Report file name not configured. Important for production traceability.');
    }

    // --- AI Client & LLM Specific Checks ---
    if (
      config.aiClientConfig.maxConcurrentRequests < 1 ||
      config.aiClientConfig.maxConcurrentRequests > 10
    ) {
      issues.push(
        '`aiClientConfig.maxConcurrentRequests` should be a reasonable number (e.g., 1-10) for production stability.',
      );
    }
    if (config.aiClientConfig.maxRetries < 2) {
      issues.push('`aiClientConfig.maxRetries` is too low for production (recommended >= 2).');
    }
    if (config.aiClientConfig.retryDelayMs < 500) {
      issues.push(
        '`aiClientConfig.retryDelayMs` is too low for production (recommended >= 500ms).',
      );
    }
    if (config.aiClientConfig.maxTokensPerBatch < 2000) {
      issues.push(
        '`aiClientConfig.maxTokensPerBatch` is very low for production, may lead to excessive API calls. (recommended >= 2000).',
      );
    }

    // Check if at least one AI model has an API key env var configured
    const hasApiKeyConfigured = config.aiModels.some(
      (model) => model.apiKeyEnvVar && process.env[model.apiKeyEnvVar],
    );
    if (!hasApiKeyConfigured) {
      issues.push(
        'No AI model has its `apiKeyEnvVar` set in the environment. Production deployment will fail without API access.',
      );
    }

    // --- Performance & Stability Checks ---
    if (config.performance?.timeoutMs && config.performance.timeoutMs < 30000) {
      issues.push(
        '`performance.timeoutMs` is too low for production use (recommended >= 30000ms).',
      );
    }
    if (!(config.performance?.enableCaching === true)) {
      issues.push(
        'Caching is not explicitly enabled. Highly recommended for production to reduce cost and improve speed.',
      );
    }
    if (config.performance?.maxConcurrentFiles && config.performance.maxConcurrentFiles < 1) {
      issues.push('`performance.maxConcurrentFiles` should be at least 1 for any processing.');
    }

    // --- Telemetry Check (Recommendation for Prod) ---
    if (!(config.telemetry?.enabled === true)) {
      issues.push('Telemetry is not enabled. Recommended for production monitoring and debugging.');
    } else if (!config.telemetry.endpoint && process.env.NODE_ENV !== 'development') {
      issues.push('Telemetry is enabled but no `endpoint` is configured. Data will not be sent.');
    }

    // --- JSDoc Config Checks ---
    if (!config.jsdocConfig.minJsdocLength || config.jsdocConfig.minJsdocLength < 30) {
      issues.push(
        '`jsdocConfig.minJsdocLength` is very low, may result in trivial or unhelpful JSDocs in production.',
      );
    }

    logger.info('Completed production readiness validation.');
    return issues;
  }
}
