import { GeneratorConfig, AIModelConfig } from "../types";
import { logger } from "../utils/logger";

/**
 * Interface for the result of a configuration validation.
 */
interface ValidationResult {
  value: GeneratorConfig;
  error?: string; // Contains a concatenated string of error messages if validation fails
  warnings?: string[]; // Contains a list of warning messages
}

/**
 * Validates the structure and content of the GeneratorConfig object.
 * This class ensures that the configuration is well-formed and meets essential requirements.
 */
export class ConfigValidator {
  /**
   * Validates the provided configuration object against predefined rules.
   * @param config The configuration object to validate. Cast as Record<string, unknown> for flexible input.
   * @returns A ValidationResult object, indicating success or failure with errors/warnings.
   */
  static validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const typedConfig = config as Partial<GeneratorConfig>; // Cast for easier property access

    // --- Critical top-level properties ---
    this.checkNonEmptyArray(typedConfig, "workspaceDirs", errors);
    this.checkNonEmptyArray(typedConfig, "aiModels", errors);

    // --- AI Client Configuration validation ---
    if (!typedConfig.aiClientConfig) {
      errors.push("aiClientConfig is required.");
    } else {
      const aiClientConfig = typedConfig.aiClientConfig as unknown as Record<
        string,
        unknown
      >;
      this.checkRequiredProperty(
        aiClientConfig,
        "defaultGenerationModelId",
        errors,
      );
      this.checkRequiredProperty(
        aiClientConfig,
        "defaultEmbeddingModelId",
        errors,
      );
      this.checkPositiveNumber(aiClientConfig, "maxConcurrentRequests", errors);
      this.checkNonNegativeNumber(aiClientConfig, "requestDelayMs", warnings); // Warn if too low
      this.checkPositiveNumber(aiClientConfig, "maxRetries", errors);
      this.checkNonNegativeNumber(aiClientConfig, "retryDelayMs", warnings);
      this.checkPositiveNumber(aiClientConfig, "maxTokensPerBatch", errors);
    }

    // --- AI Models validation ---
    if (typedConfig.aiModels && Array.isArray(typedConfig.aiModels)) {
      this.validateAiModels(typedConfig.aiModels, errors, warnings);
    } else {
      errors.push("aiModels must be a non-empty array.");
    }

    // --- Default Model ID consistency check ---
    if (
      typedConfig.aiModels &&
      typedConfig.aiClientConfig &&
      typedConfig.aiClientConfig.defaultGenerationModelId
    ) {
      const defaultGenModel = typedConfig.aiModels.find(
        (m) => m.id === typedConfig.aiClientConfig!.defaultGenerationModelId,
      );
      if (!defaultGenModel) {
        errors.push(
          `Default generation model ID '${typedConfig.aiClientConfig.defaultGenerationModelId}' not found in 'aiModels'.`,
        );
      } else if (defaultGenModel.type !== "generation") {
        errors.push(
          `Default generation model ID '${defaultGenModel.id}' must be of type 'generation'. Found '${defaultGenModel.type}'.`,
        );
      }
    }

    // --- Embedding Configuration validation ---
    if (typedConfig.embeddingConfig) {
      if (typedConfig.embeddingConfig.enabled) {
        const embeddingConfig =
          typedConfig.embeddingConfig as unknown as Record<string, unknown>;
        this.checkRequiredProperty(embeddingConfig, "modelId", errors);
        if (typedConfig.embeddingConfig.modelId && typedConfig.aiModels) {
          const embeddingModel = typedConfig.aiModels.find(
            (m) => m.id === typedConfig.embeddingConfig?.modelId,
          );
          if (!embeddingModel) {
            errors.push(
              `Embedding model ID '${typedConfig.embeddingConfig.modelId}' not found in 'aiModels'.`,
            );
          } else if (embeddingModel.type !== "embedding") {
            errors.push(
              `Embedding model ID '${embeddingModel.id}' must be of type 'embedding'. Found '${embeddingModel.type}'.`,
            );
          }
        }
        this.checkPositiveNumber(
          embeddingConfig,
          "minRelationshipScore",
          errors,
          0,
          1,
        );
        this.checkPositiveNumber(embeddingConfig, "maxRelatedSymbols", errors);
        this.checkPositiveNumber(embeddingConfig, "embeddingBatchSize", errors);
      }
    } else {
      errors.push("embeddingConfig is required.");
    }

    // --- JSDoc Configuration validation ---
    if (!typedConfig.jsdocConfig) {
      errors.push("jsdocConfig is required.");
    } else {
      this.checkPositiveNumber(
        typedConfig.jsdocConfig,
        "maxSnippetLength",
        errors,
        100,
      );
      this.checkPositiveNumber(
        typedConfig.jsdocConfig,
        "minJsdocLength",
        warnings,
        10,
      ); // Often a warning
      this.checkBooleanProperty(
        typedConfig.jsdocConfig,
        "prioritizeExports",
        warnings,
      );
    }

    // --- Output Configuration validation ---
    if (!typedConfig.outputConfig) {
      errors.push("outputConfig is required.");
    } else {
      this.checkRequiredProperty(
        typedConfig.outputConfig,
        "reportFileName",
        errors,
      );
      this.checkRequiredProperty(typedConfig.outputConfig, "reportDir", errors);
      this.checkLogLevel(typedConfig.outputConfig.logLevel, warnings);
    }

    // --- Performance configuration validation ---
    if (typedConfig.performance) {
      this.checkPositiveNumber(
        typedConfig.performance,
        "maxConcurrentFiles",
        warnings,
      );
      this.checkPositiveNumber(typedConfig.performance, "batchSize", warnings);
    }

    // --- Environment variable checks for models (now warnings) ---
    this.checkEnvVarsForModels(typedConfig.aiModels || [], warnings); // Changed to warnings

    if (errors.length > 0) {
      return {
        value: config as unknown as GeneratorConfig,
        error: errors.join("\n"),
      };
    }
    if (warnings.length > 0) {
      logger.warn("Configuration warnings detected:\n" + warnings.join("\n"));
    }
    return { value: config as unknown as GeneratorConfig, warnings: warnings };
  }

  /**
   * Helper to check if a property is a non-empty array.
   * @param parent The object containing the property.
   * @param property The name of the array property.
   * @param errorList The list to add error messages to.
   */
  private static checkNonEmptyArray(
    parent: Record<string, unknown>,
    property: string,
    errorList: string[],
  ): void {
    if (
      !parent[property] ||
      !Array.isArray(parent[property]) ||
      (parent[property] as unknown[]).length === 0
    ) {
      errorList.push(`${property} must be a non-empty array.`);
    }
  }

  /**
   * Helper to check if a property is defined (not undefined or null).
   * @param parent The object containing the property.
   * @param property The name of the property.
   * @param errorList The list to add error messages to.
   */
  private static checkRequiredProperty(
    parent: Record<string, unknown>,
    property: string,
    errorList: string[],
  ): void {
    if (parent[property] === undefined || parent[property] === null) {
      errorList.push(`${property} is required.`);
    }
  }

  /**
   * Helper to check if a property is a positive number, optionally within a range.
   * @param parent The object containing the property.
   * @param property The name of the number property.
   * @param errorList The list to add error messages to.
   * @param min Optional minimum value (exclusive).
   * @param max Optional maximum value (inclusive).
   */
  private static checkPositiveNumber(
    parent: Record<string, unknown>,
    property: string,
    errorList: string[],
    min: number = 0,
    max?: number,
  ): void {
    const value = parent[property];
    if (
      typeof value !== "number" ||
      value <= min ||
      (max !== undefined && value > max)
    ) {
      const rangeMsg =
        max !== undefined
          ? ` (between ${min} and ${max})`
          : ` (greater than ${min})`;
      errorList.push(`${property} must be a number${rangeMsg}.`);
    }
  }

  /**
   * Helper to check if a property is a non-negative number.
   * @param parent The object containing the property.
   * @param property The name of the number property.
   * @param warningList The list to add warning messages to.
   */
  private static checkNonNegativeNumber(
    parent: Record<string, unknown>,
    property: string,
    warningList: string[],
  ): void {
    const value = parent[property];
    if (typeof value !== "number" || value < 0) {
      warningList.push(`${property} should be a non-negative number.`);
    }
  }

  /**
   * Helper to check if a property is a boolean.
   * @param parent The object containing the property.
   * @param property The name of the boolean property.
   * @param warningList The list to add warning messages to.
   */
  private static checkBooleanProperty(
    parent: Record<string, unknown>,
    property: string,
    warningList: string[],
  ): void {
    const value = parent[property];
    if (typeof value !== "boolean") {
      warningList.push(`${property} should be a boolean.`);
    }
  }

  /**
   * Helper to validate the log level string.
   * @param logLevel The log level string from the config.
   * @param warningList The list to add warning messages to.
   */
  private static checkLogLevel(logLevel: unknown, warningList: string[]): void {
    const validLevels = [
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
      "silent",
    ];
    if (
      typeof logLevel !== "string" ||
      !validLevels.includes(logLevel.toLowerCase())
    ) {
      warningList.push(
        `outputConfig.logLevel must be one of: ${validLevels.join(", ")}.`,
      );
    }
  }

  /**
   * Validates each AI model configuration within the `aiModels` array.
   * @param models The array of AIModelConfig objects.
   * @param errorList The list to add error messages to.
   * @param warningList The list to add warning messages to.
   */
  private static validateAiModels(
    models: AIModelConfig[],
    errorList: string[],
    warningList: string[],
  ): void {
    const modelIds = new Set<string>();
    for (const model of models) {
      if (!model.id || !model.provider || !model.model || !model.type) {
        errorList.push(
          `Each AI model must have 'id', 'provider', 'model', and 'type'. Invalid model: ${JSON.stringify(model)}`,
        );
        continue;
      }

      if (modelIds.has(model.id)) {
        errorList.push(
          `Duplicate AI model ID found: '${model.id}'. Model IDs must be unique.`,
        );
      }
      modelIds.add(model.id);

      const supportedProviders = ["openai", "anthropic", "google", "ollama"]; // Add 'custom' if you want to support arbitrary providers
      if (!supportedProviders.includes(model.provider.toLowerCase())) {
        errorList.push(
          `Unsupported AI model provider for ID '${model.id}': '${model.provider}'. Must be one of ${supportedProviders.join(", ")}.`,
        );
      }

      if (model.type !== "generation" && model.type !== "embedding") {
        errorList.push(
          `Invalid AI model type for ID '${model.id}': '${model.type}'. Must be 'generation' or 'embedding'.`,
        );
      }

      // Check specific generation/embedding configs if present
      if (model.type === "generation") {
        if (
          model.temperature !== undefined &&
          (typeof model.temperature !== "number" ||
            model.temperature < 0 ||
            model.temperature > 2)
        ) {
          warningList.push(
            `Temperature for model '${model.id}' should be between 0 and 2.`,
          );
        }
        if (
          model.maxOutputTokens !== undefined &&
          (typeof model.maxOutputTokens !== "number" ||
            model.maxOutputTokens < 1)
        ) {
          warningList.push(
            `maxOutputTokens for model '${model.id}' should be a positive number.`,
          );
        }
        if (
          model.responseFormat &&
          model.responseFormat.type !== "json_object" &&
          model.responseFormat.type !== "text"
        ) {
          errorList.push(
            `Invalid responseFormat type for model '${model.id}'. Must be 'json_object' or 'text'.`,
          );
        }
      } else if (model.type === "embedding") {
        if (
          model.dimensions !== undefined &&
          (typeof model.dimensions !== "number" || model.dimensions < 1)
        ) {
          warningList.push(
            `Dimensions for embedding model '${model.id}' should be a positive number.`,
          );
        }
      }
    }
  }

  /**
   * Checks if required environment variables for AI models are set.
   * Logs warnings if they are missing.
   * @param models The array of AIModelConfig objects.
   * @param warningList The list to add warning messages to.
   */
  private static checkEnvVarsForModels(
    models: AIModelConfig[],
    warningList: string[],
  ): void {
    for (const model of models) {
      if (
        model.apiKeyEnvVar &&
        typeof process.env[model.apiKeyEnvVar] === "undefined"
      ) {
        // This is now a warning, as a model might be a fallback or not always used.
        warningList.push(
          `Environment variable '${model.apiKeyEnvVar}' is not set for AI model '${model.id}'. This model might not function correctly.`,
        );
      }
    }
  }
}
