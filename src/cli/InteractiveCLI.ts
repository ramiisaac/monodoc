import inquirer from "inquirer";
const { prompt } = inquirer;
import chalk from "chalk";
import { GeneratorConfig } from "../types";
import { DEFAULT_CONFIG } from "../config";

/**
 * A class providing interactive CLI functionality for the tool.
 * This allows users to configure the tool using guided prompts and interactive menus.
 */
export class InteractiveCLI {
  /**
   * Starts the interactive setup process
   * @returns A promise resolving to a configuration object
   */

  static async runSetup(_baseDir: string): Promise<Partial<GeneratorConfig>> {
    console.log(
      chalk.blue("\n🚀 Welcome to the JSDoc Generator interactive setup!\n"),
    );
    console.log(
      "This wizard will help you configure the tool for your project.",
    );

    const config: Partial<GeneratorConfig> = {};

    // Get workspace directories
    const { workspaceDirs } = await prompt([
      {
        type: "input",
        name: "workspaceDirs",
        message: "Enter directories to include (comma separated):",
        default: DEFAULT_CONFIG.workspaceDirs.join(", "),
        filter: (input: string) => input.split(",").map((dir) => dir.trim()),
      },
    ]);

    config.workspaceDirs = workspaceDirs;

    // Get patterns
    const { includePatterns, ignorePatterns } = await prompt([
      {
        type: "input",
        name: "includePatterns",
        message: "Enter file patterns to include (comma separated):",
        default: DEFAULT_CONFIG.includePatterns.join(", "),
        filter: (input: string) =>
          input.split(",").map((pattern) => pattern.trim()),
      },
      {
        type: "input",
        name: "ignorePatterns",
        message: "Enter file patterns to ignore (comma separated):",
        default: DEFAULT_CONFIG.ignorePatterns.join(", "),
        filter: (input: string) =>
          input.split(",").map((pattern) => pattern.trim()),
      },
    ]);

    config.includePatterns = includePatterns;
    config.ignorePatterns = ignorePatterns;

    // Configure AI models
    const { modelChoice } = await prompt({
      type: "list",
      name: "modelChoice",
      message: "Which AI model provider do you prefer?",
      choices: ["OpenAI", "Anthropic", "Google", "Custom"],
    });

    // Basic AI model configuration
    const aiModels = [
      {
        id: "default-gen-model",
        provider: modelChoice.toLowerCase(),
        model: this.getDefaultModelForProvider(modelChoice.toLowerCase()),
        type: "generation" as const,
      },
      {
        id: "default-embedding-model",
        provider: "openai",
        model: "text-embedding-3-small",
        type: "embedding" as const,
      },
    ];

    config.aiModels = aiModels;
    config.aiClientConfig = {
      defaultGenerationModelId: "default-gen-model",
      defaultEmbeddingModelId: "default-embedding-model",
      maxConcurrentRequests: 5,
      requestDelayMs: 100,
      maxRetries: 3,
      retryDelayMs: 1000,
      maxTokensPerBatch: 4000,
    };

    // Configure embeddings
    const { enableEmbeddings } = await prompt({
      type: "confirm",
      name: "enableEmbeddings",
      message: "Enable embedding-based features?",
      default: DEFAULT_CONFIG.embeddingConfig.enabled,
    });

    config.embeddingConfig = {
      enabled: enableEmbeddings,
      modelId: "default-embedding-model",
      minRelationshipScore: 0.7,
      maxRelatedSymbols: 5,
      embeddingBatchSize: 100,
    };

    console.log(chalk.green("\n✅ Basic configuration complete!"));
    return config;
  }

  /**
   * Gets the default model name for a provider
   * @param provider The provider name
   * @returns The default model name
   */
  private static getDefaultModelForProvider(provider: string): string {
    switch (provider) {
      case "openai":
        return "gpt-4o";
      case "anthropic":
        return "claude-3-opus-20240229";
      case "google":
        return "gemini-1.5-pro";
      default:
        return "custom-model";
    }
  }
}
