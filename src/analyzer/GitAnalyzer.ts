import { execSync } from 'child_process';
import path from 'path';
import { logger } from '../utils/logger';

/**
 * Represents a file change detected by Git.
 */
export interface GitFileChange {
  path: string;
  status: 'A' | 'M' | 'D' | 'R' | 'C'; // Added, Modified, Deleted, Renamed, Copied
  oldPath?: string; // For renamed/copied files
}

/**
 * Analyzes Git repository status to identify changed files.
 * Used for incremental processing mode.
 */
export class GitAnalyzer {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Executes a Git command and returns its trimmed output.
   * @param command The Git command string to execute.
   * @returns The trimmed stdout of the command, or null if an error occurs.
   */
  private executeGitCommand(command: string): string | null {
    try {
      return execSync(command, {
        cwd: this.baseDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'], // Suppress stderr output to console
      }).trim();
    } catch (error) {
      // Log as debug, as many Git errors (e.g., not a repo) are expected in certain contexts
      logger.debug(
        `Failed to execute git command "${command}": ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Parses the output of `git diff --name-status` into a structured array of file changes.
   * @param output The raw string output from the Git command.
   * @returns An array of GitFileChange objects.
   */
  private parseChangedFilesOutput(output: string): GitFileChange[] {
    if (!output) return [];

    return output.split('\n').map((line) => {
      const parts = line.split('\t');
      const status = parts[0] as GitFileChange['status'];
      const filePath = parts[1];
      const oldPath = parts[2]; // Present for 'R' (renamed) or 'C' (copied) status

      return {
        path: path.resolve(this.baseDir, filePath), // Resolve to absolute path
        status,
        oldPath: oldPath ? path.resolve(this.baseDir, oldPath) : undefined,
      };
    });
  }

  /**
   * Retrieves a list of files that have changed in the Git repository.
   * By default, it checks changes since the last commit (`HEAD~1..HEAD`).
   * Can specify a `since` commit hash to check changes from that point to HEAD.
   * Filters results to include only common source code files (TS/JS).
   * @param since Optional. The commit hash or reference to check changes from.
   * @returns A Promise resolving to an array of GitFileChange objects.
   */
  async getChangedFiles(since?: string): Promise<GitFileChange[]> {
    // Default range is from the previous commit to HEAD
    const range = since ? `${since}..HEAD` : 'HEAD~1..HEAD';
    const command = `git diff --name-status ${range}`;
    const output = this.executeGitCommand(command);

    if (output === null) {
      logger.warn(
        `Could not determine changed files. Is '${this.baseDir}' a Git repository or does it have history?`,
      );
      return [];
    }

    // Filter to common source code file extensions
    return this.parseChangedFilesOutput(output).filter(
      (change) =>
        change.path.endsWith('.ts') ||
        change.path.endsWith('.tsx') ||
        change.path.endsWith('.js') ||
        change.path.endsWith('.jsx'),
    );
  }

  /**
   * Retrieves the hash of the current HEAD commit.
   * @returns A Promise resolving to the commit hash string, or null if not found.
   */
  async getLastCommitHash(): Promise<string | null> {
    const hash = this.executeGitCommand('git rev-parse HEAD');
    return hash;
  }

  /**
   * Checks if the current base directory is a Git repository.
   * @returns A Promise resolving to true if it's a Git repository, false otherwise.
   */
  async isGitRepository(): Promise<boolean> {
    try {
      // `git rev-parse --is-inside-work-tree` is more robust for checking repo status
      const output = this.executeGitCommand('git rev-parse --is-inside-work-tree');
      return output === 'true';
    } catch {
      return false;
    }
  }
}
