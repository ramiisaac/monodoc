import fs from "fs/promises";
import path from "path";
import os from "os";
import { logger } from "../utils/logger";
import { pathExists } from "../utils/fileUtils";

/**
 * Represents saved API credentials for an AI provider.
 */
interface Credentials {
  [providerId: string]: {
    apiKey: string;
    modelName?: string;
    lastUsed: string;
  };
}

/**
 * Represents a key-value pair in a local `.env` file.
 */
interface LocalEnvEntry {
  key: string;
  value: string;
}

/**
 * Manages saving, loading, and listing API keys for AI providers
 * in either a global configuration file or a local `.env` file.
 */
export class AuthManager {
  private static readonly GLOBAL_CONFIG_DIR = path.join(
    os.homedir(),
    ".monodoc",
  );
  private static readonly GLOBAL_CREDENTIALS_FILE = path.join(
    AuthManager.GLOBAL_CONFIG_DIR,
    "credentials.json",
  );
  private static readonly LOCAL_ENV_FILE = ".env";

  /**
   * Saves an API key for a given provider.
   * @param provider The provider type (e.g., 'openai', 'google', 'anthropic', 'ollama').
   * @param apiKey The API key string.
   * @param location Where to save the key ('global' or 'local').
   * @param modelName Optional. The model name associated with the key.
   */
  static async saveApiKey(
    provider: string,
    apiKey: string,
    location: "global" | "local",
    modelName?: string,
  ): Promise<void> {
    if (location === "global") {
      await this.saveGlobalCredentials(provider, apiKey, modelName);
    } else {
      await this.saveLocalCredentials(provider, apiKey);
    }
  }

  /**
   * Loads an API key for a given provider, prioritizing local over global.
   * @param provider The provider type.
   * @returns The API key string, or null if not found.
   */
  static async loadApiKey(provider: string): Promise<string | null> {
    const localKey = await this.loadLocalCredentials(provider);
    if (localKey) {
      logger.debug(`🔑 Using local API key for ${provider}`);
      return localKey;
    }

    const globalKey = await this.loadGlobalCredentials(provider);
    if (globalKey) {
      logger.debug(`🔑 Using global API key for ${provider}`);
      return globalKey;
    }

    return null;
  }

  /**
   * Saves credentials to a global JSON file in the user's home directory.
   * @param provider The provider type.
   * @param apiKey The API key.
   * @param modelName Optional. The model name.
   */
  private static async saveGlobalCredentials(
    provider: string,
    apiKey: string,
    modelName?: string,
  ): Promise<void> {
    try {
      await fs.mkdir(AuthManager.GLOBAL_CONFIG_DIR, { recursive: true });
      let credentials: Credentials = {};

      if (await pathExists(AuthManager.GLOBAL_CREDENTIALS_FILE)) {
        const data = await fs.readFile(
          AuthManager.GLOBAL_CREDENTIALS_FILE,
          "utf-8",
        );
        credentials = JSON.parse(data);
      }

      credentials[provider] = {
        apiKey,
        modelName,
        lastUsed: new Date().toISOString(),
      };

      // Write with restrictive permissions (owner read/write only)
      await fs.writeFile(
        AuthManager.GLOBAL_CREDENTIALS_FILE,
        JSON.stringify(credentials, null, 2),
        { mode: 0o600 },
      );
      logger.success(
        `🔑 API key for ${provider} saved globally to ${AuthManager.GLOBAL_CREDENTIALS_FILE}`,
      );
    } catch (error) {
      logger.error(
        `❌ Failed to save global credentials: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Loads credentials from the global JSON file.
   * @param provider The provider type.
   * @returns The API key string, or null if not found.
   */
  private static async loadGlobalCredentials(
    provider: string,
  ): Promise<string | null> {
    try {
      if (!(await pathExists(AuthManager.GLOBAL_CREDENTIALS_FILE))) {
        return null;
      }
      const data = await fs.readFile(
        AuthManager.GLOBAL_CREDENTIALS_FILE,
        "utf-8",
      );
      const credentials: Credentials = JSON.parse(data);
      return credentials[provider]?.apiKey || null;
    } catch (error) {
      logger.debug(
        `Could not load global credentials: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Saves credentials to a local `.env` file in the current working directory.
   * @param provider The provider type.
   * @param apiKey The API key.
   */
  private static async saveLocalCredentials(
    provider: string,
    apiKey: string,
  ): Promise<void> {
    try {
      const envVarName = this.getEnvVarNameForProvider(provider);
      const envPath = path.resolve(process.cwd(), AuthManager.LOCAL_ENV_FILE);
      let envEntries: LocalEnvEntry[] = [];

      if (await pathExists(envPath)) {
        const data = await fs.readFile(envPath, "utf-8");
        envEntries = this.parseEnvFile(data);
      }

      const existingIndex = envEntries.findIndex(
        (entry) => entry.key === envVarName,
      );
      if (existingIndex >= 0) {
        envEntries[existingIndex].value = apiKey; // Update existing entry
      } else {
        envEntries.push({ key: envVarName, value: apiKey }); // Add new entry
      }

      const envContent =
        envEntries.map((entry) => `${entry.key}=${entry.value}`).join("\n") +
        "\n";
      await fs.writeFile(envPath, envContent, { mode: 0o600 }); // Write with restrictive permissions
      logger.success(`🔑 API key for ${provider} saved locally to ${envPath}`);
    } catch (error) {
      logger.error(
        `❌ Failed to save local credentials: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Loads credentials from a local `.env` file.
   * @param provider The provider type.
   * @returns The API key string, or null if not found.
   */
  private static async loadLocalCredentials(
    provider: string,
  ): Promise<string | null> {
    try {
      const envVarName = this.getEnvVarNameForProvider(provider);
      const envPath = path.resolve(process.cwd(), AuthManager.LOCAL_ENV_FILE);
      if (!(await pathExists(envPath))) {
        return null;
      }
      const data = await fs.readFile(envPath, "utf-8");
      const envEntries = this.parseEnvFile(data);
      const entry = envEntries.find((e) => e.key === envVarName);
      return entry?.value || null;
    } catch (error) {
      logger.debug(
        `Could not load local credentials: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Maps a provider type string to its corresponding environment variable name.
   * This is crucial for consistency.
   * @param provider The provider type (e.g., 'openai', 'google', 'anthropic', 'ollama').
   * @returns The environment variable name (e.g., 'OPENAI_API_KEY').
   */
  private static getEnvVarNameForProvider(provider: string): string {
    const providerMap: Record<string, string> = {
      openai: "OPENAI_API_KEY",
      google: "GOOGLE_API_KEY", // Simplified from 'google-gemini'
      anthropic: "ANTHROPIC_API_KEY", // Simplified from 'anthropic-claude'
      ollama: "OLLAMA_HOST", // Ollama typically uses OLLAMA_HOST for base URL
    };
    return (
      providerMap[provider] ||
      `${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`
    );
  }

  /**
   * Parses the content of an `.env` file into an array of key-value pairs.
   * Ignores comments and empty lines.
   * @param content The string content of the `.env` file.
   * @returns An array of `LocalEnvEntry` objects.
   */
  private static parseEnvFile(content: string): LocalEnvEntry[] {
    return content
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("#"))
      .map((line) => {
        const [key, ...valueParts] = line.split("=");
        return { key: key.trim(), value: valueParts.join("=").trim() };
      });
  }

  /**
   * Lists all saved API credentials (both global and local).
   * @returns A Promise that resolves to an array of objects, each detailing a credential.
   */
  static async listCredentials(): Promise<
    { provider: string; location: string; lastUsed?: string }[]
  > {
    const result: { provider: string; location: string; lastUsed?: string }[] =
      [];

    // List global credentials
    try {
      if (await pathExists(AuthManager.GLOBAL_CREDENTIALS_FILE)) {
        const data = await fs.readFile(
          AuthManager.GLOBAL_CREDENTIALS_FILE,
          "utf-8",
        );
        const credentials: Credentials = JSON.parse(data);
        for (const [provider, cred] of Object.entries(credentials)) {
          result.push({
            provider,
            location: "global",
            lastUsed: cred.lastUsed,
          });
        }
      }
    } catch {
      logger.debug("Could not read global credentials"); // Fail silently for debug
    }

    // List local credentials from .env file
    try {
      const envPath = path.resolve(process.cwd(), AuthManager.LOCAL_ENV_FILE);
      if (await pathExists(envPath)) {
        const data = await fs.readFile(envPath, "utf-8");
        const envEntries = this.parseEnvFile(data);
        // Filter for common API key patterns
        const apiKeyEntries = envEntries.filter(
          (entry) =>
            entry.key.endsWith("_API_KEY") || entry.key.includes("OLLAMA_HOST"),
        );

        for (const entry of apiKeyEntries) {
          // Attempt to map env var name back to a common provider name
          const providerName =
            Object.entries({
              OPENAI_API_KEY: "openai",
              GOOGLE_API_KEY: "google",
              ANTHROPIC_API_KEY: "anthropic",
              OLLAMA_HOST: "ollama",
            }).find(([envVar]) => envVar === entry.key)?.[1] ||
            entry.key.toLowerCase().replace(/_api_key$/, ""); // Fallback for custom
          result.push({
            provider: providerName,
            location: "local",
          });
        }
      }
    } catch {
      logger.debug("Could not read local .env file"); // Fail silently for debug
    }
    return result;
  }

  /**
   * Removes saved credentials for a specific provider from specified locations.
   * @param provider The provider type.
   * @param location 'global', 'local', or 'both'.
   */
  static async removeCredentials(
    provider: string,
    location: "global" | "local" | "both",
  ): Promise<void> {
    if (location === "global" || location === "both") {
      await this.removeGlobalCredentials(provider);
    }
    if (location === "local" || location === "both") {
      await this.removeLocalCredentials(provider);
    }
  }

  /**
   * Removes credentials from the global JSON file.
   * @param provider The provider type.
   */
  private static async removeGlobalCredentials(
    provider: string,
  ): Promise<void> {
    try {
      if (!(await pathExists(AuthManager.GLOBAL_CREDENTIALS_FILE))) {
        return;
      }
      const data = await fs.readFile(
        AuthManager.GLOBAL_CREDENTIALS_FILE,
        "utf-8",
      );
      const credentials: Credentials = JSON.parse(data);
      if (credentials[provider]) {
        delete credentials[provider];
        await fs.writeFile(
          AuthManager.GLOBAL_CREDENTIALS_FILE,
          JSON.stringify(credentials, null, 2),
          { mode: 0o600 },
        );
        logger.success(`🗑️ Removed global credentials for ${provider}`);
      }
    } catch (error) {
      logger.error(
        `❌ Failed to remove global credentials: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Removes credentials from the local `.env` file.
   * @param provider The provider type.
   */
  private static async removeLocalCredentials(provider: string): Promise<void> {
    try {
      const envVarName = this.getEnvVarNameForProvider(provider);
      const envPath = path.resolve(process.cwd(), AuthManager.LOCAL_ENV_FILE);
      if (!(await pathExists(envPath))) {
        return;
      }
      const data = await fs.readFile(envPath, "utf-8");
      const envEntries = this.parseEnvFile(data);
      const filteredEntries = envEntries.filter(
        (entry) => entry.key !== envVarName,
      );

      if (filteredEntries.length !== envEntries.length) {
        // Only write if a change was actually made
        const envContent =
          filteredEntries
            .map((entry) => `${entry.key}=${entry.value}`)
            .join("\n") + "\n";
        await fs.writeFile(envPath, envContent, { mode: 0o600 });
        logger.success(`🗑️ Removed local credentials for ${provider}`);
      }
    } catch (error) {
      logger.error(
        `❌ Failed to remove local credentials: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
