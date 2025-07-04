import { logger } from './logger';
import { LLMError } from './errorHandling';

/**
 * A generic rate limiter for controlling concurrent asynchronous tasks.
 * This class now primarily handles generic task concurrency and delay,
 * with LLM-specific rate limiting and retries being handled by the AI SDK's client.
 */
export class RateLimiter {
  private queue: Array<() => Promise<unknown>> = []; // Queue of tasks to execute
  private running = 0; // Number of currently running tasks
  private timer: NodeJS.Timeout | null = null; // Timer for scheduling next task
  private lastExecutionTime: number = 0; // Timestamp of the last task execution start

  /**
   * Creates a new RateLimiter instance.
   * @param maxConcurrent The maximum number of tasks to run concurrently.
   * @param delayMs The minimum delay in milliseconds between starting new tasks.
   */
  constructor(
    private maxConcurrent: number,
    private delayMs: number,
  ) {
    if (maxConcurrent <= 0) throw new Error('maxConcurrent must be a positive number');
    if (delayMs < 0) throw new Error('delayMs must be a non-negative number');
  }

  /**
   * Executes an asynchronous function, respecting concurrency and delay limits.
   * This version is simplified, removing retry logic as that's externalized to AI SDK clients
   * or a dedicated retry mechanism wrapper.
   * @param fn The asynchronous function to execute.
   * @param operationName A descriptive name for the operation, for logging.
   * @returns A Promise that resolves with the result of `fn`.
   */
  async execute<T>(fn: () => Promise<T>, operationName: string = 'Unnamed Operation'): Promise<T> {
    return new Promise((resolve, reject) => {
      const taskWrapper = async () => {
        try {
          this.running++;
          this.lastExecutionTime = Date.now(); // Record start time of this execution
          const result = await fn();
          resolve(result);
        } catch (error) {
          logger.error(
            `❌ Task '${operationName}' failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Directly reject without retry. Retries should be handled upstream (e.g., in AIClient).
          reject(new LLMError(`Task '${operationName}' failed.`, undefined, 'TASK_FAILURE', error));
        } finally {
          this.running--;
          this.scheduleNext(); // Schedule the next task in the queue
        }
      };

      this.queue.push(taskWrapper); // Add the task to the queue
      this.scheduleNext(); // Attempt to schedule immediately
    });
  }

  /**
   * Schedules the next task in the queue, if limits allow.
   * Ensures the delay between tasks is respected.
   */
  private scheduleNext(): void {
    // If already at max concurrency, or no tasks in queue, do nothing
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const timeSinceLastExecution = Date.now() - this.lastExecutionTime;
    const delayNeeded = Math.max(0, this.delayMs - timeSinceLastExecution);

    // Clear any existing timer to reschedule efficiently
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      // Check again, as state might have changed during the timeout
      if (this.queue.length > 0 && this.running < this.maxConcurrent) {
        const nextTask: (() => Promise<unknown>) | undefined = this.queue.shift();
        if (nextTask) {
          nextTask(); // Execute the next task
        }
      }
    }, delayNeeded);
  }

  /**
   * Gets the current number of tasks waiting in the queue.
   * @returns The queue size.
   */
  public getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Gets the current number of tasks actively running.
   * @returns The count of running tasks.
   */
  public getRunningCount(): number {
    return this.running;
  }
}
