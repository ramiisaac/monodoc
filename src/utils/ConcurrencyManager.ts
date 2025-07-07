import pLimit from 'p-limit';

/**
 * A shared utility for managing concurrency limits across the application.
 * This class provides a consistent interface for controlling the number of concurrent operations
 * using the well-tested p-limit library.
 */
export class ConcurrencyManager {
  private limiter: ReturnType<typeof pLimit>;
  private maxConcurrency: number;

  /**
   * Creates a new ConcurrencyManager instance.
   * @param maxConcurrency The maximum number of concurrent operations (default: 4)
   */
  constructor(maxConcurrency: number = 4) {
    if (maxConcurrency <= 0) {
      throw new Error('maxConcurrency must be a positive number');
    }
    this.maxConcurrency = maxConcurrency;
    this.limiter = pLimit(maxConcurrency);
  }

  /**
   * Executes a function with concurrency control.
   * @param fn The function to execute
   * @returns A promise that resolves with the result of the function
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return this.limiter(fn);
  }

  /**
   * Gets the current concurrency limit.
   * @returns The maximum number of concurrent operations
   */
  getMaxConcurrency(): number {
    return this.maxConcurrency;
  }

  /**
   * Gets the number of pending operations in the queue.
   * @returns The number of pending operations
   */
  getPendingCount(): number {
    return this.limiter.pendingCount;
  }

  /**
   * Gets the number of currently active operations.
   * @returns The number of active operations
   */
  getActiveCount(): number {
    return this.limiter.activeCount;
  }

  /**
   * Creates a new limiter function for direct use (for backward compatibility).
   * @returns A p-limit function
   */
  getLimiter(): ReturnType<typeof pLimit> {
    return this.limiter;
  }
}

/**
 * Factory function to create a ConcurrencyManager instance.
 * @param maxConcurrency The maximum number of concurrent operations
 * @returns A new ConcurrencyManager instance
 */
export function createConcurrencyManager(maxConcurrency: number = 4): ConcurrencyManager {
  return new ConcurrencyManager(maxConcurrency);
}