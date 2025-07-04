import * as chokidar from 'chokidar';
import path from 'path';
import { logger } from './logger';
import { GeneratorConfig } from '../types';

/**
 * Debounces a function call, ensuring it's only executed after a specified delay
 * without further calls.
 * @param func The function to debounce.
 * @param wait The debounce time in milliseconds.
 * @returns The debounced function.
 */
function debounce<F extends (...args: any[]) => void>(
  func: F,
  wait: number,
): (...args: Parameters<F>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<F>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Manages file watching operations for continuous documentation updates.
 * It uses `chokidar` to monitor file system changes and triggers a callback
 * function with the list of changed files after a debounce period.
 */
export class WatchMode {
  private watcher: chokidar.FSWatcher | null = null;
  private config: GeneratorConfig;
  private baseDir: string;
  private onFileChange: (filePaths: string[]) => Promise<void>; // Callback for file changes
  private debouncedHandler: (changedFiles: Set<string>) => void;
  private changedFilesBuffer: Set<string> = new Set(); // Buffer for collecting changes

  /**
   * Creates a new WatchMode instance.
   * @param config The generator configuration, used for watch patterns and debounce settings.
   * @param baseDir The base directory to watch from.
   * @param onFileChange The async callback function to execute when files change.
   */
  constructor(
    config: GeneratorConfig,
    baseDir: string,
    onFileChange: (filePaths: string[]) => Promise<void>,
  ) {
    this.config = config;
    this.baseDir = baseDir;
    this.onFileChange = onFileChange;
    // Debounce the actual file change handling to prevent too frequent runs
    this.debouncedHandler = debounce(
      this.flushChanges.bind(this),
      this.config.watchMode?.debounceMs || 1000,
    ) as any; // Use type assertion to avoid type issues
  }

  /**
   * Starts the file watcher.
   * It configures `chokidar` with include/ignore patterns from the config
   * and sets up listeners for 'add', 'change', and 'unlink' events.
   */
  start(): void {
    // Determine the paths to watch. Default to workspace directories if no specific patterns.
    const watchPaths =
      this.config.watchMode?.includePatterns && this.config.watchMode.includePatterns.length > 0
        ? this.config.watchMode.includePatterns.map((pattern) => path.join(this.baseDir, pattern))
        : this.config.workspaceDirs.map((dir) => path.join(this.baseDir, dir, '**')); // Watch all files in workspace dirs by default

    // Combine global ignore patterns with watch-specific ignore patterns
    const ignorePatterns = [
      ...(this.config.ignorePatterns || []),
      ...(this.config.watchMode?.ignorePatterns || []),
      '**/node_modules/**', // Always ignore node_modules
      '**/dist/**', // Always ignore build output
      '**/.git/**', // Always ignore .git
      '**/.jsdoc-cache/**', // Ignore our own cache
      '**/.jsdoc-telemetry/**', // Ignore telemetry logs
    ];

    logger.debug(`Watch paths: ${watchPaths.join(', ')}`);
    logger.debug(`Watch ignore patterns: ${ignorePatterns.join(', ')}`);

    this.watcher = chokidar.watch(watchPaths, {
      ignored: ignorePatterns,
      persistent: true, // Keep the process running
      ignoreInitial: true, // Don't trigger 'add' events for existing files on startup
      awaitWriteFinish: {
        // Wait for files to finish writing before processing
        stabilityThreshold: 50, // default is 2000
        pollInterval: 10, // default is 100
      },
    });

    this.watcher
      .on('add', (filePath: string) => {
        logger.trace(`File added: ${path.relative(this.baseDir, filePath)}`);
        this.changedFilesBuffer.add(filePath);
        this.debouncedHandler(this.changedFilesBuffer);
      })
      .on('change', (filePath: string) => {
        logger.trace(`File changed: ${path.relative(this.baseDir, filePath)}`);
        this.changedFilesBuffer.add(filePath);
        this.debouncedHandler(this.changedFilesBuffer);
      })
      .on('unlink', (filePath: string) => {
        logger.info(`File deleted: ${path.relative(this.baseDir, filePath)}`);
        // We typically don't regenerate docs for deleted files, but log for awareness.
        // If necessary, a cleanup operation could be triggered for deleted files.
      })
      .on('error', (error) => {
        logger.error(`Watcher error: ${error.message}`);
      })
      .on('ready', () => {
        logger.info('🔍 Watch mode started. Monitoring for file changes...');
        logger.info('Press Ctrl+C to stop.');
      });
  }

  /**
   * Processes the buffered changed files by invoking the `onFileChange` callback.
   * This method is debounced to avoid triggering too many regeneration runs.
   * @param changedFiles The set of file paths that have changed.
   */
  private async flushChanges(changedFiles: Set<string>): Promise<void> {
    const filePaths = Array.from(changedFiles);
    this.changedFilesBuffer.clear(); // Clear buffer immediately to collect new changes

    if (filePaths.length === 0) {
      logger.debug('No files to process in this debounce cycle.');
      return;
    }

    try {
      await this.onFileChange(filePaths);
      // Success/error messages are typically handled by the `onFileChange` callback
    } catch (error) {
      logger.error(
        `Failed to process changes in watch mode: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Stops the file watcher.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      logger.info('👋 Watch mode stopped.');
    }
  }
}
