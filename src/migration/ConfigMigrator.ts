import { GeneratorConfig } from '../types';
import { logger } from '../utils/logger';
import { deepMerge } from '../config'; // Using the deepMerge utility

/**
 * Type alias for a configuration object whose structure is not yet fully known.
 */
type UnknownConfig = Record<string, unknown>;

/**
 * Defines a migration rule, specifying the version it migrates from/to and the migration logic.
 */
interface MigrationRule {
  fromVersion: string; // The minimum version from which this migration should apply
  toVersion: string; // The version after this migration is applied
  description: string; // A brief description of what this migration does
  migrate: (config: UnknownConfig) => UnknownConfig; // The function that transforms the config
}

/**
 * Manages the migration of configuration files between different versions.
 * This ensures backward compatibility for user configurations as the tool evolves.
 */
export class ConfigMigrator {
  // Ordered list of migration rules.
  // Each rule specifies a transformation from one conceptual version to the next.
  private migrations: MigrationRule[] = [
    {
      fromVersion: '1.0.0', // Original version with basic LLM and JSDoc config
      toVersion: '1.1.0',
      description:
        'Introduce `aiModels` and `aiClientConfig` for Vercel AI SDK integration, and remove `llmProviders`.',
      migrate: (config: UnknownConfig) => {
        const oldConfig = config as any; // Corrected `any` usage
        const newConfig: any = { ...config };

        // New AI SDK related fields
        newConfig.aiModels = [];
        newConfig.aiClientConfig = {
          defaultGenerationModelId: 'openai-gpt4o', // Set default from common model
          defaultEmbeddingModelId: 'openai-embedding', // Set default embedding model
          maxConcurrentRequests: oldConfig.aiConfig?.maxConcurrentRequests || 3,
          requestDelayMs: oldConfig.aiConfig?.requestDelayMs || 500,
          maxRetries: oldConfig.aiConfig?.maxRetries || 5,
          retryDelayMs: oldConfig.aiConfig?.retryDelayMs || 1000,
          maxTokensPerBatch: oldConfig.aiConfig?.maxTokensPerBatch || 8000,
        };

        // Migrate old llmProviders to new aiModels structure
        if (Array.isArray(oldConfig.llmProviders)) {
          oldConfig.llmProviders.forEach((provider: any) => {
            // Corrected `any` usage
            const newModel: any = {
              // Corrected `any` usage
              id: provider.id,
              provider: this.mapOldProviderType(provider.type),
              model: provider.modelName,
              apiKeyEnvVar: provider.apiKeyEnvVar,
            };

            if (provider.isEmbeddingModel) {
              newModel.type = 'embedding';
              newModel.dimensions = provider.embeddingConfig?.dimensions;
            } else {
              newModel.type = 'generation';
              newModel.temperature = provider.generationConfig?.temperature;
              newModel.maxOutputTokens =
                provider.generationConfig?.max_tokens || provider.generationConfig?.maxOutputTokens;
              newModel.topP = provider.generationConfig?.top_p || provider.generationConfig?.topP;
              newModel.topK = provider.generationConfig?.topK;
              newModel.responseFormat = provider.generationConfig?.response_format;
              newModel.stopSequences = provider.generationConfig?.stopSequences;
              newModel.enableSafetyFeatures = provider.enableSafetyFeatures;
            }
            (newConfig.aiModels as any[]).push(newModel); // Corrected `any` usage
          });
          // Update default model IDs if old default existed
          if (oldConfig.defaultLLMProviderId) {
            (newConfig.aiClientConfig as any).defaultGenerationModelId =
              oldConfig.defaultLLMProviderId; // Corrected `any` usage
            if (oldConfig.embeddingConfig?.enabled && oldConfig.embeddingConfig?.providerId) {
              (newConfig.aiClientConfig as any).defaultEmbeddingModelId =
                oldConfig.embeddingConfig.providerId; // Corrected `any` usage
            }
          }
        }

        // Remove old fields
        delete newConfig.llmProviders;
        delete newConfig.defaultLLMProviderId;
        delete newConfig.aiConfig;
        if (newConfig.embeddingConfig && typeof newConfig.embeddingConfig === 'object') {
          delete (newConfig.embeddingConfig as any).providerId; // Now uses modelId // Corrected `any` usage
        }

        return newConfig;
      },
    },
    {
      fromVersion: '1.1.0',
      toVersion: '1.2.0',
      description:
        'Refine embedding configuration to use `modelId` and ensure default performance/telemetry settings.',
      migrate: (config: UnknownConfig) => {
        const oldConfig = config as any; // Corrected `any` usage
        const newConfig: any = { ...config };

        // Ensure embeddingConfig uses `modelId` and is consistent
        if (oldConfig.embeddingConfig && typeof oldConfig.embeddingConfig === 'object') {
          if (oldConfig.embeddingConfig.providerId && !oldConfig.embeddingConfig.modelId) {
            (newConfig.embeddingConfig as any).modelId = oldConfig.embeddingConfig.providerId; // Corrected `any` usage
          }
          delete (newConfig.embeddingConfig as any).providerId; // Corrected `any` usage
        }

        // Ensure default performance settings are present if missing
        if (!newConfig.performance) {
          newConfig.performance = {
            enableCaching: true,
            maxConcurrentFiles: 4,
            batchSize: 20,
            timeoutMs: 30000,
          };
        }

        // Ensure default telemetry settings are present if missing
        if (!newConfig.telemetry) {
          newConfig.telemetry = {
            enabled: false,
            anonymize: true,
            collectPerformance: true,
            collectErrors: true,
          };
        }

        // Ensure productionMode is explicitly defined
        if (typeof newConfig.productionMode === 'undefined') {
          newConfig.productionMode = false;
        }

        return newConfig;
      },
    },
    // Add more migration rules for future versions here
    // Example: { fromVersion: '1.2.0', toVersion: '1.3.0', description: '...', migrate: (config) => {...} }
  ];

  // Add these properties
  private latestVersion = '2.0.1';

  /**
   * Migrates a configuration object from its current version to the latest supported version.
   * It applies relevant migration rules sequentially.
   * @param config The configuration object to migrate.
   * @param fromVersion Optional. The explicit version of the input config. If not provided,
   *                    it attempts to read from `config.version` or defaults to '1.0.0'.
   * @returns A Promise resolving to the migrated `GeneratorConfig`.
   */
  async migrateConfig(config: UnknownConfig, fromVersion?: string): Promise<GeneratorConfig> {
    const initialConfigVersion = fromVersion || (config.version as string) || '1.0.0';
    let migratedConfig = deepMerge({}, config) as any; // Start with a deep copy to avoid modifying original
    let currentConfigVersion = initialConfigVersion;

    logger.info(`🔄 Starting configuration migration from version ${initialConfigVersion}`);

    for (const migration of this.migrations) {
      // Check if this migration rule should be applied
      if (this.shouldApplyMigration(currentConfigVersion, migration.fromVersion)) {
        logger.info(`  📝 Applying migration to v${migration.toVersion}: ${migration.description}`);
        try {
          if (!migratedConfig.version) {
            migratedConfig.version = ''; // Initialize version if it doesn't exist
          }
          migratedConfig = migration.migrate(migratedConfig);
          // Update the version of the config after successful migration step
          migratedConfig.version = migration.toVersion;
          currentConfigVersion = migration.toVersion;
        } catch (error) {
          logger.error(
            `❌ Failed to apply migration to v${migration.toVersion}: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Decide whether to throw or continue with warnings. For critical config, throwing is safer.
          throw new Error(`Configuration migration failed at version ${migration.toVersion}.`);
        }
      }
    }

    // Ensure the config object has the latest internal version marker
    migratedConfig.version = process.env.npm_package_version || '2.0.1'; // Update to the actual latest app version

    logger.success('✅ Configuration migration completed.');
    return migratedConfig as GeneratorConfig;
  }

  /**
   * Recursively migrates a configuration object by applying all necessary migrations
   * from its current version to the latest version.
   * @param config The configuration object to migrate.
   * @returns The migrated configuration object.
   */
  migrate(config: UnknownConfig): UnknownConfig {
    let currentVersion = this.detectVersion(config);
    let migratedConfig = { ...config } as any;

    // Keep migrating until we reach the latest version
    while (currentVersion !== this.latestVersion) {
      const migration = this.getMigrationForVersion(currentVersion);
      if (!migration) {
        logger.warn(
          `No migration path found from version ${currentVersion} to ${this.latestVersion}`,
        );
        break;
      }

      logger.info(`Migrating configuration from v${currentVersion} to v${migration.toVersion}`);
      try {
        migratedConfig = migration.migrate(migratedConfig);
        migratedConfig.version = migration.toVersion;
        currentVersion = migration.toVersion;
      } catch (error) {
        logger.error(`Migration from v${currentVersion} to v${migration.toVersion} failed:`, error);
        throw error;
      }
    }

    // Ensure the version is set to the latest
    migratedConfig.version = process.env.npm_package_version || '2.0.1'; // Update to the actual latest app version

    return migratedConfig;
  }

  /**
   * Detects the version of a configuration object.
   * @param config The configuration object.
   * @returns The detected version string.
   */
  private detectVersion(config: UnknownConfig): string {
    if (config.version && typeof config.version === 'string') {
      return config.version;
    }

    // Legacy detection logic
    if ('llmProviders' in config) {
      return '1.0.0';
    }
    if (
      'aiModels' in config &&
      !('embeddingConfig' in config && (config.embeddingConfig as any)?.modelId)
    ) {
      return '1.1.0';
    }

    return '1.0.0'; // Default to oldest version
  }

  /**
   * Gets the migration rule for a specific version.
   * @param fromVersion The version to migrate from.
   * @returns The migration rule or undefined if not found.
   */
  private getMigrationForVersion(fromVersion: string): MigrationRule | undefined {
    return this.migrations.find((m) => m.fromVersion === fromVersion);
  }

  /**
   * Determines if a migration rule should be applied based on version comparison.
   * A rule applies if the `currentConfigVersion` is less than the rule's `toVersion`
   * and greater than or equal to its `fromVersion`.
   * @param currentConfigVersion The current version of the configuration.
   * @param migrationFromVersion The `fromVersion` of the migration rule.
   * @returns True if the migration should be applied, false otherwise.
   */
  private shouldApplyMigration(
    currentConfigVersion: string,
    migrationFromVersion: string,
  ): boolean {
    return this.compareVersions(currentConfigVersion, migrationFromVersion) >= 0;
  }

  /**
   * Compares two semantic version strings.
   * @param v1 The first version string.
   * @param v2 The second version string.
   * @returns -1 if v1 < v2, 0 if v1 == v2, 1 if v1 > v2.
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 === p2) continue;
      return p1 > p2 ? 1 : -1;
    }
    return 0;
  }

  /**
   * Helper to map old LLM provider types to new simplified types for Vercel AI SDK.
   * @param oldType The old provider type string.
   * @returns The new simplified provider type.
   */
  private mapOldProviderType(oldType: string): string {
    switch (oldType) {
      case 'openai':
        return 'openai';
      case 'google-gemini':
        return 'google';
      case 'anthropic-claude':
        return 'anthropic';
      case 'ollama-local':
        return 'ollama';
      default:
        return oldType; // Keep as is if unknown, might be a custom provider
    }
  }
}
