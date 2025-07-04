import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "./logger";

export interface GitignoreConfig {
  enabled: boolean;
  respectGitignore: boolean;
  respectGitignoreGlobal: boolean;
  customIgnorePatterns: string[];
  allowOverride: boolean;
}

/**
 * Utility for reading and processing .gitignore files to honor ignore patterns.
 * By default, respects .gitignore patterns to avoid processing files that shouldn't be documented.
 */
export class GitignoreManager {
  private patterns: string[] = [];
  private config: GitignoreConfig;
  private basePath: string;

  constructor(basePath: string, config?: Partial<GitignoreConfig>) {
    this.basePath = basePath;
    this.config = {
      enabled: true,
      respectGitignore: true,
      respectGitignoreGlobal: false,
      customIgnorePatterns: [],
      allowOverride: true,
      ...config,
    };
  }

  /**
   * Initializes the gitignore manager by reading ignore patterns.
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.debug("Gitignore integration disabled");
      return;
    }

    this.patterns = [];

    // Load local .gitignore
    if (this.config.respectGitignore) {
      await this.loadGitignoreFile(path.join(this.basePath, ".gitignore"));
    }

    // Load global .gitignore
    if (this.config.respectGitignoreGlobal) {
      const globalGitignore = await this.getGlobalGitignorePath();
      if (globalGitignore) {
        await this.loadGitignoreFile(globalGitignore);
      }
    }

    // Add custom patterns
    this.patterns.push(...this.config.customIgnorePatterns);

    // Add common patterns that should always be ignored for documentation
    this.addDefaultIgnorePatterns();

    logger.debug(`Loaded ${this.patterns.length} ignore patterns`);
  }

  /**
   * Loads patterns from a .gitignore file.
   */
  private async loadGitignoreFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const lines = content
        .split("\n")
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#")) // Remove empty lines and comments
        .map(line => this.normalizePattern(line));

      this.patterns.push(...lines);
      logger.debug(`Loaded ${lines.length} patterns from ${filePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.debug(`Could not read .gitignore file: ${filePath}`);
      }
    }
  }

  /**
   * Gets the path to the global .gitignore file.
   */
  private async getGlobalGitignorePath(): Promise<string | null> {
    try {
      const { execSync } = require("child_process");
      const globalGitignore = execSync("git config --get core.excludesfile", { encoding: "utf8" }).trim();
      
      if (globalGitignore && await this.fileExists(globalGitignore)) {
        return globalGitignore;
      }
    } catch {
      // Ignore errors - global gitignore is optional
    }

    // Try common default locations
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      const commonPaths = [
        path.join(homeDir, ".gitignore_global"),
        path.join(homeDir, ".config", "git", "ignore"),
      ];

      for (const gitignorePath of commonPaths) {
        if (await this.fileExists(gitignorePath)) {
          return gitignorePath;
        }
      }
    }

    return null;
  }

  /**
   * Checks if a file exists.
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Normalizes a gitignore pattern for use.
   */
  private normalizePattern(pattern: string): string {
    // Remove trailing whitespace
    pattern = pattern.trim();

    // Handle negation patterns (!) - not implemented in this simple version
    if (pattern.startsWith("!")) {
      logger.debug(`Negation patterns not yet supported: ${pattern}`);
      return "";
    }

    // Convert gitignore patterns to minimatch-compatible patterns
    if (pattern.endsWith("/")) {
      // Directory patterns
      return pattern + "**";
    }

    return pattern;
  }

  /**
   * Adds default ignore patterns that should always be ignored for documentation.
   */
  private addDefaultIgnorePatterns(): void {
    const defaultPatterns = [
      // Build outputs
      "dist/**",
      "build/**",
      "out/**",
      ".next/**",
      
      // Dependencies
      "node_modules/**",
      "vendor/**",
      
      // IDE and OS files
      ".vscode/**",
      ".idea/**",
      ".DS_Store",
      "Thumbs.db",
      
      // Test files (unless specifically included)
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.test.js",
      "**/*.test.jsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/*.spec.js",
      "**/*.spec.jsx",
      "__tests__/**",
      "**/__mocks__/**",
      
      // Type definitions (usually don't need additional docs)
      "**/*.d.ts",
      
      // Config files that typically don't need JSDoc
      "*.config.js",
      "*.config.ts",
      ".eslintrc.*",
      "tsconfig.json",
      "package.json",
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      
      // Documentation and assets
      "**/*.md",
      "**/*.mdx",
      "docs/**",
      "README*",
      "CHANGELOG*",
      "LICENSE*",
      
      // Cache and temporary files
      ".cache/**",
      ".tmp/**",
      "tmp/**",
      "temp/**",
      "coverage/**",
      
      // Logs
      "**/*.log",
      "logs/**",
    ];

    this.patterns.push(...defaultPatterns);
  }

  /**
   * Checks if a file should be ignored based on loaded patterns.
   * @param filePath Path to check (relative to base path)
   * @returns True if the file should be ignored
   */
  shouldIgnore(filePath: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    // Normalize the file path
    const normalizedPath = path.relative(this.basePath, filePath).replace(/\\/g, "/");

    // Check against each pattern
    for (const pattern of this.patterns) {
      if (this.matchesPattern(normalizedPath, pattern)) {
        logger.trace(`File ignored by pattern "${pattern}": ${normalizedPath}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Simple pattern matching (subset of minimatch functionality).
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    if (!pattern) return false;

    // Exact match
    if (filePath === pattern) {
      return true;
    }

    // Simple wildcard patterns
    if (pattern.includes("*")) {
      const regexPattern = pattern
        .replace(/\*\*\//g, "(.*/)?") // **/ matches any number of directories
        .replace(/\*\*/g, ".*") // ** matches anything
        .replace(/\*/g, "[^/]*") // * matches anything except path separator
        .replace(/\?/g, "."); // ? matches single character

      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(filePath);
    }

    // Directory patterns
    if (pattern.endsWith("/")) {
      const dirPattern = pattern.slice(0, -1);
      return filePath.startsWith(dirPattern + "/") || filePath === dirPattern;
    }

    // Check if file is in ignored directory
    const pathParts = filePath.split("/");
    
    // Check if any part of the path matches the pattern
    if (pathParts.includes(pattern)) {
      return true;
    }
    
    // Check if pattern is a file extension pattern
    if (pattern.startsWith("*.")) {
      const extension = pattern.slice(1); // Remove the *
      return filePath.endsWith(extension);
    }

    return false;
  }

  /**
   * Filters a list of files to exclude ignored ones.
   * @param files Array of file paths to filter
   * @returns Array of non-ignored file paths
   */
  filterFiles(files: string[]): string[] {
    if (!this.config.enabled) {
      return files;
    }

    const filtered = files.filter(file => !this.shouldIgnore(file));
    
    const ignoredCount = files.length - filtered.length;
    if (ignoredCount > 0) {
      logger.debug(`Filtered out ${ignoredCount} ignored files`);
    }

    return filtered;
  }

  /**
   * Gets the current ignore patterns.
   */
  getPatterns(): string[] {
    return [...this.patterns];
  }

  /**
   * Updates the configuration and reinitializes if needed.
   */
  async updateConfig(newConfig: Partial<GitignoreConfig>): Promise<void> {
    const oldEnabled = this.config.enabled;
    this.config = { ...this.config, ...newConfig };

    // Reinitialize if gitignore was enabled
    if (!oldEnabled && this.config.enabled) {
      await this.initialize();
    }

    logger.debug("Gitignore configuration updated");
  }

  /**
   * Adds custom ignore patterns.
   */
  addCustomPatterns(patterns: string[]): void {
    this.patterns.push(...patterns.map(p => this.normalizePattern(p)));
    logger.debug(`Added ${patterns.length} custom ignore patterns`);
  }

  /**
   * Checks if gitignore integration is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Gets configuration summary for logging/debugging.
   */
  getConfigSummary(): {
    enabled: boolean;
    patternsCount: number;
    respectsGitignore: boolean;
    allowsOverride: boolean;
  } {
    return {
      enabled: this.config.enabled,
      patternsCount: this.patterns.length,
      respectsGitignore: this.config.respectGitignore,
      allowsOverride: this.config.allowOverride,
    };
  }
}