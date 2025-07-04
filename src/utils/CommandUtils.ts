import { logger } from "./logger";
import { CliOptions, GeneratorConfig } from "../types"; // Removed unused AuthManager type
import { AuthManager } from "../config/AuthManager"; // Import AuthManager explicitly
import chalk from "chalk";

// This file is intended for general utility functions that might be used across multiple commands.
// It contains functions for applying CLI overrides to config, and handling API key saving/model detection.

/**
 * Applies CLI-specified model and API key overrides to the configuration.
 * This function should be called early in the command execution lifecycle,
 * typically within the `CommandRunner` or before `loadAndMergeConfig` if needed.
 * It will set environment variables for API keys and adjust the default model in config.
 * @param config - The current generator configuration.
 * @param cliOptions - CLI options passed by the user.
 * @returns The updated generator configuration.
 */
export async function applyCliModelAndKeyOverrides(
  config: GeneratorConfig,
  cliOptions: CliOptions,
): Promise<GeneratorConfig> {
  const updatedConfig = { ...config };

  if (cliOptions.model) {
    const providerType = detectProviderTypeFromModel(cliOptions.model);
    if (providerType) {
      logger.info(
        `🤖 CLI overriding default model to: ${cliOptions.model} (Provider: ${providerType})`,
      );
      let modelConfig = updatedConfig.aiModels.find(
        (m) => m.id === `${providerType}-${cliOptions.model}`,
      );

      if (!modelConfig) {
        // If a model with this ID doesn't exist, create a new AIModelConfig
        modelConfig = {
          id: `${providerType}-${cliOptions.model.replace(/[^a-zA-Z0-9-]/g, "-")}`,
          provider: providerType,
          model: cliOptions.model,
          type: "generation", // Assume generation for CLI model override, can be refined
          apiKeyEnvVar: getDefaultApiKeyEnvVar(providerType),
        };
        updatedConfig.aiModels.push(modelConfig);
        logger.info(`Added new AI model config for '${modelConfig.id}'.`);
      } else {
        // Update existing model's parameters if necessary
        modelConfig.model = cliOptions.model;
        if (!modelConfig.apiKeyEnvVar) {
          modelConfig.apiKeyEnvVar = getDefaultApiKeyEnvVar(providerType);
        }
      }
      updatedConfig.aiClientConfig.defaultGenerationModelId = modelConfig.id; // Set this as the new default
    } else {
      logger.warn(
        `⚠️ Could not detect AI model provider type for '${cliOptions.model}'. Model override might not function as expected.`,
      );
    }
  }

  if (cliOptions.apiKey) {
    // Determine the provider type from the model (if specified) or use a default guess
    const providerTypeForApiKey = cliOptions.model
      ? detectProviderTypeFromModel(cliOptions.model)
      : updatedConfig.aiClientConfig.defaultGenerationModelId
        ? updatedConfig.aiModels.find(
            (m) =>
              m.id === updatedConfig.aiClientConfig.defaultGenerationModelId,
          )?.provider
        : "openai"; // Fallback to openai

    if (providerTypeForApiKey) {
      const envVarName = getDefaultApiKeyEnvVar(providerTypeForApiKey);
      process.env[envVarName] = cliOptions.apiKey; // Set environment variable for immediate use by AIClient

      if (cliOptions.saveApiKey) {
        logger.info(
          `🔑 Saving API key for ${providerTypeForApiKey} ${cliOptions.saveApiKey === "global" ? "globally" : "locally"}...`,
        );
        // Assuming AuthManager.saveApiKey handles the modelName if relevant
        await AuthManager.saveApiKey(
          providerTypeForApiKey,
          cliOptions.apiKey,
          cliOptions.saveApiKey,
          cliOptions.model, // Pass the model name for storage if AuthManager uses it
        );
        logger.success(`API key for ${providerTypeForApiKey} saved.`);
      }
    } else {
      logger.warn(
        "⚠️ Could not determine AI provider for API key. Please specify a --model or ensure a default model is configured.",
      );
    }
  }

  return updatedConfig;
}

/**
 * Detects the AI provider type based on the model name.
 * This is a helper for CLI overrides to associate models with providers.
 * @param model - The AI model name.
 * @returns The detected provider type (e.g., 'openai', 'google'), or null if not found.
 */
export function detectProviderTypeFromModel(
  model: string,
): "openai" | "google" | "anthropic" | "ollama" | null {
  const modelMap: Record<string, "openai" | "google" | "anthropic" | "ollama"> =
    {
      gpt: "openai",
      "text-embedding": "openai", // OpenAI embedding models
      gemini: "google",
      claude: "anthropic",
      llama: "ollama",
      mistral: "ollama",
      codellama: "ollama",
      phi: "ollama",
      qwen: "ollama",
      gemma: "ollama",
      nomic: "ollama", // For Ollama's nomic-embed-text
    };

  for (const [key, provider] of Object.entries(modelMap)) {
    if (model.toLowerCase().includes(key)) {
      return provider;
    }
  }
  return null;
}

/**
 * Gets the default environment variable name for an API key based on provider type.
 * @param provider - The AI provider type.
 * @returns The default environment variable name (e.g., 'OPENAI_API_KEY').
 */
export function getDefaultApiKeyEnvVar(provider: string): string {
  const envVarMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    google: "GOOGLE_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    ollama: "OLLAMA_HOST", // Ollama typically uses OLLAMA_HOST for base URL
  };
  return envVarMap[provider] || `${provider.toUpperCase()}_API_KEY`;
}

/**
 * Prints a formatted table of available AI models from the default configuration.
 * This function is used by the `InfoCommand`.
 * @param aiModels The array of AI models from the configuration.
 */
export function printAvailableModels(
  aiModels: GeneratorConfig["aiModels"],
): void {
  logger.log(chalk.bold.blue("\n🤖 Available AI Models\n"));

  const modelsByProvider: {
    [provider: string]: { generation: string[]; embedding: string[] };
  } = {};

  aiModels.forEach((model) => {
    if (!modelsByProvider[model.provider]) {
      modelsByProvider[model.provider] = { generation: [], embedding: [] };
    }
    if (model.type === "generation") {
      modelsByProvider[model.provider].generation.push(model.model);
    } else if (model.type === "embedding") {
      modelsByProvider[model.provider].embedding.push(model.model);
    }
  });

  for (const [provider, modelTypes] of Object.entries(modelsByProvider)) {
    logger.log(chalk.bold.yellow(`${provider.toUpperCase()}:`));
    if (modelTypes.generation.length > 0) {
      logger.log(chalk.cyan("  Text Generation:"));
      modelTypes.generation.forEach((model) => {
        logger.log(`    ${chalk.green("•")} ${model}`);
      });
    }
    if (modelTypes.embedding.length > 0) {
      logger.log(chalk.cyan("  Embeddings:"));
      modelTypes.embedding.forEach((model) => {
        logger.log(`    ${chalk.green("•")} ${model}`);
      });
    }
    logger.log();
  }
  logger.log(
    chalk.gray(
      "Use `monodoc generate --model <name>` to specify a model for generation.\n",
    ),
  );
}
