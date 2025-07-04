import chalk from 'chalk';
import { logger } from './logger';

/**
 * A command-line progress bar for visualizing long-running operations.
 */
export class ProgressBar {
  private total: number;
  private current: number;
  private barLength: number;
  private message: string;
  private isCompleted: boolean;
  private startTime: number;
  private lastRenderTime: number;
  private renderInterval: number; // Minimum interval between renders in milliseconds

  /**
   * Creates a new ProgressBar instance.
   * @param total The total number of units for the progress bar.
   * @param barLength The visual length of the progress bar in characters (default: 40).
   * @param renderInterval The minimum time between updates to prevent excessive rendering (default: 100ms).
   */
  constructor(total: number, barLength: number = 40, renderInterval: number = 100) {
    if (total <= 0) {
      logger.warn('ProgressBar total set to non-positive value. Disabling progress bar.');
      this.isCompleted = true; // Mark as completed to prevent rendering
      this.total = 0; // Ensure total is 0 if invalid input
      this.current = 0;
      this.barLength = barLength;
      this.message = '';
      this.startTime = performance.now();
      this.lastRenderTime = 0;
      this.renderInterval = renderInterval;
      return;
    }

    this.total = total;
    this.current = 0;
    this.barLength = barLength;
    this.message = '';
    this.isCompleted = false;
    this.startTime = performance.now();
    this.lastRenderTime = 0;
    this.renderInterval = renderInterval;
  }

  /**
   * Updates the progress bar to a specific current value and message.
   * Renders only if enough time has passed since the last render.
   * @param current The current progress value.
   * @param message An optional message to display next to the progress bar.
   */
  update(current: number, message: string = '') {
    if (this.isCompleted) return; // Do nothing if already completed

    // Ensure current is within valid bounds
    this.current = Math.min(Math.max(current, 0), this.total);
    this.message = message;
    this.tryRender();
  }

  /**
   * Increments the progress bar by one unit.
   * @param message An optional message to display next to the progress bar.
   */
  tick(message: string = '') {
    if (this.isCompleted) return;
    this.current = Math.min(this.current + 1, this.total);
    this.message = message;
    this.tryRender();
  }

  /**
   * Attempts to render the progress bar, but only if enough time has passed
   * since the last render or if the bar is complete.
   */
  private tryRender() {
    if (this.total === 0) return; // No rendering if total is 0

    const now = performance.now();
    // Render if interval passed OR if it's the final update (100% complete)
    if (now - this.lastRenderTime > this.renderInterval || this.current === this.total) {
      this.render();
      this.lastRenderTime = now;
    }
  }

  /**
   * Renders the progress bar to the console.
   */
  private render() {
    if (this.total === 0) return;

    const percent = this.current / this.total;
    const filledLength = Math.round(this.barLength * percent);
    const emptyLength = this.barLength - filledLength;

    const filledBar = chalk.bgGreen(' ').repeat(filledLength);
    const emptyBar = chalk.bgGray(' ').repeat(emptyLength);

    const percentageText = (percent * 100).toFixed(1);

    const elapsedMs = performance.now() - this.startTime;
    const elapsedSeconds = elapsedMs / 1000;

    let eta = 'N/A';
    if (this.current > 0 && percent < 1) {
      const estimatedTotalSeconds = elapsedSeconds / percent;
      const remainingSeconds = estimatedTotalSeconds - elapsedSeconds;
      eta = this.formatDuration(remainingSeconds);
    } else if (percent === 1) {
      eta = 'Done'; // When 100% complete, ETA is "Done"
    }

    // Clear the current line and then write the new progress bar
    process.stdout.write('\r' + ' '.repeat(process.stdout.columns || 80)); // Clear line
    process.stdout.write(
      `\r${chalk.bold('[')}${filledBar}${emptyBar}${chalk.bold(']')} ` +
        `${percentageText}% ` +
        `${this.current}/${this.total} ${this.message} ` +
        `(ETA: ${eta})`,
    );
  }

  /**
   * Formats a duration in seconds into a human-readable string (e.g., "1m 30s", "45s").
   * @param seconds The duration in seconds.
   * @returns Formatted duration string.
   */
  private formatDuration(seconds: number): string {
    if (seconds < 0) return '0s'; // Handle negative remaining time gracefully
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  }

  /**
   * Completes the progress bar, showing 100% and a final message, then moves to the next line.
   * @param finalMessage The message to display when the bar is complete (default: 'Done!').
   */
  complete(finalMessage: string = 'Done!') {
    if (this.isCompleted) return; // Do nothing if already completed

    this.current = this.total; // Ensure it's 100%
    this.message = finalMessage;
    this.render(); // Render one last time
    process.stdout.write('\n'); // Move cursor to the next line
    this.isCompleted = true;
  }
}
