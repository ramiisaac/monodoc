import pLimit from "p-limit";
import { logger } from "./logger";

/**
 * A shared concurrency controller that provides a standardized way to handle
 * concurrent task execution across the codebase. This replaces duplicated
 * busy-wait loops and p-limit usage patterns.
 * 
 * Previously, both GenerateDocumentationOperation and JSDocGenerator
 * had identical concurrency control patterns using p-limit directly.
 * This consolidates that pattern into a reusable utility to avoid duplication
 * and potential synchronization issues.
 * 
 * Note: This is different from RateLimiter which handles rate limiting with delays
 * for API calls. ConcurrencyController focuses solely on limiting concurrent
 * execution without adding delays between tasks.
 */
export class ConcurrencyController {
  private limiter: ReturnType<typeof pLimit>;
  private readonly maxConcurrent: number;
  private readonly description: string;

  /**
   * Creates a new ConcurrencyController instance.
   * @param maxConcurrent The maximum number of tasks to run concurrently.
   * @param description A description of what this controller is managing (for logging).
   */
  constructor(maxConcurrent: number, description: string = "tasks") {
    if (maxConcurrent <= 0) {
      throw new Error("maxConcurrent must be a positive number");
    }

    this.maxConcurrent = maxConcurrent;
    this.description = description;
    this.limiter = pLimit(maxConcurrent);

    logger.debug(
      `ConcurrencyController initialized for ${description} with max concurrent: ${maxConcurrent}`,
    );
  }

  /**
   * Executes a task with concurrency control.
   * @param task The task to execute.
   * @returns A promise that resolves when the task completes.
   */
  async execute<T>(task: () => Promise<T>): Promise<T> {
    return this.limiter(task);
  }

  /**
   * Executes multiple tasks with concurrency control.
   * @param tasks An array of tasks to execute.
   * @returns A promise that resolves when all tasks complete.
   */
  async executeAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    const limitedTasks = tasks.map((task) => this.limiter(task));
    return Promise.all(limitedTasks);
  }

  /**
   * Gets the current queue size (number of pending tasks).
   * @returns The number of tasks waiting to be executed.
   */
  getQueueSize(): number {
    return this.limiter.pendingCount;
  }

  /**
   * Gets the number of currently running tasks.
   * @returns The number of tasks currently being executed.
   */
  getRunningCount(): number {
    return this.limiter.activeCount;
  }

  /**
   * Gets the maximum concurrent limit.
   * @returns The maximum number of concurrent tasks.
   */
  getMaxConcurrent(): number {
    return this.maxConcurrent;
  }

  /**
   * Gets a description of what this controller manages.
   * @returns The description string.
   */
  getDescription(): string {
    return this.description;
  }

  /**
   * Gets stats about the current state of the controller.
   * @returns An object containing current stats.
   */
  getStats(): {
    maxConcurrent: number;
    running: number;
    pending: number;
    description: string;
  } {
    return {
      maxConcurrent: this.maxConcurrent,
      running: this.getRunningCount(),
      pending: this.getQueueSize(),
      description: this.description,
    };
  }
}

/**
 * Factory function to create a file processing concurrency controller
 * with standard defaults and logging.
 * @param maxConcurrentFiles The maximum number of files to process concurrently.
 * @returns A configured ConcurrencyController instance.
 */
export function createFileProcessingController(
  maxConcurrentFiles: number,
): ConcurrencyController {
  return new ConcurrencyController(maxConcurrentFiles, "file processing");
}

/**
 * Factory function to create a generic concurrency controller.
 * @param maxConcurrent The maximum number of tasks to run concurrently.
 * @param description A description of what this controller manages.
 * @returns A configured ConcurrencyController instance.
 */
export function createConcurrencyController(
  maxConcurrent: number,
  description: string = "tasks",
): ConcurrencyController {
  return new ConcurrencyController(maxConcurrent, description);
}