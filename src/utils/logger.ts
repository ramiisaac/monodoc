import chalk from 'chalk';
import { LogLevel } from '../types';

// Default log level if not specified by environment variable
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

// Mapping of log level names to numerical values for comparison
const logLevels: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
  silent: 6, // Silent means no output at all
};

// Console prefixes for different log levels, using chalk for colors
const prefixes: Record<LogLevel, string> = {
  trace: chalk.magenta('🟣 TRACE'),
  debug: chalk.gray('🐛 DEBUG'),
  info: chalk.blue('ℹ️  INFO'),
  warn: chalk.yellow('⚠️  WARN'),
  error: chalk.red('❌ ERROR'),
  fatal: chalk.bgRed.white('💀 FATAL'),
  silent: '', // No prefix for silent level
};

// The current log level, initialized from environment or default
let currentLogLevel: LogLevel =
  (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || DEFAULT_LOG_LEVEL;

// Check if DEBUG_JSDOC_GEN environment variable is set to 'true'
const IS_DEBUG_ENV = process.env.DEBUG_JSDOC_GEN === 'true';

/**
 * Sets the global log level. Messages with a lower priority than the current level will not be displayed.
 * @param level The desired log level.
 */
export function setLogLevel(level: LogLevel): void {
  if (logLevels[level] !== undefined) {
    currentLogLevel = level;
    // Direct console.log here as logger.debug might be disabled by the new level
    console.log(chalk.gray(`[DEBUG] Log level set to: ${currentLogLevel}`));
  } else {
    console.warn(
      chalk.yellow(
        `[WARN] Invalid log level '${level}'. Keeping current level: ${currentLogLevel}`,
      ),
    );
  }
}

/**
 * Checks if a specific log level is currently enabled.
 * If DEBUG_JSDOC_GEN is true, debug and trace messages are always enabled regardless of currentLogLevel,
 * effectively promoting currentLogLevel to at least 'debug'.
 * @param level The log level to check.
 * @returns True if the level is enabled, false otherwise.
 */
function isLogLevelEnabled(level: LogLevel): boolean {
  // If in debug environment, all levels up to debug are effectively enabled.
  // This means if currentLogLevel is INFO, and DEBUG_JSDOC_GEN is true,
  // debug messages will still show.
  if (IS_DEBUG_ENV && logLevels[level] >= logLevels['debug']) {
    return true;
  }
  return logLevels[level] >= logLevels[currentLogLevel];
}

/**
 * Global logger object with methods for different log levels.
 * Each method checks if its level is enabled before printing.
 */
export const logger = {
  trace: (message: string, ...args: unknown[]) => {
    if (isLogLevelEnabled('trace')) {
      console.log(`${prefixes.trace} ${chalk.dim(message)}`, ...args);
    }
  },
  debug: (message: string, ...args: unknown[]) => {
    if (isLogLevelEnabled('debug')) {
      console.log(`${prefixes.debug} ${chalk.gray(message)}`, ...args);
    }
  },
  info: (message: string, ...args: unknown[]) => {
    if (isLogLevelEnabled('info')) {
      console.log(`${prefixes.info} ${message}`, ...args);
    }
  },
  /**
   * Custom success log method, typically for important positive feedback.
   */
  success: (message: string, ...args: unknown[]) => {
    if (isLogLevelEnabled('info')) {
      console.log(`${chalk.green('✅ SUCCESS')} ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: unknown[]) => {
    if (isLogLevelEnabled('warn')) {
      console.warn(`${prefixes.warn} ${message}`, ...args);
    }
  },
  error: (message: string, ...args: unknown[]) => {
    if (isLogLevelEnabled('error')) {
      console.error(`${prefixes.error} ${message}`, ...args);
    }
  },
  fatal: (message: string, ...args: unknown[]) => {
    if (isLogLevelEnabled('fatal')) {
      console.error(`${prefixes.fatal} ${message}`, ...args);
    }
  },
  /**
   * Direct passthrough to console.log, useful for unformatted output or specific cases.
   */
  log: console.log,
};
