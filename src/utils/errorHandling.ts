import { logger } from "./logger";

/**
 * Base class for all custom errors in the generator.
 * Provides a timestamp, context, and original error details.
 */
export class BaseGeneratorError extends Error {
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;
  public readonly originalError?: Error | unknown;

  constructor(
    message: string,
    originalError?: Error | unknown,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.originalError = originalError;
    this.context = context;

    // Capture stack trace for better debugging
    if (
      typeof (
        Error as {
          captureStackTrace?: (target: object, constructorOpt?: object) => void;
        }
      ).captureStackTrace === "function"
    ) {
      (
        Error as {
          captureStackTrace?: (target: object, constructorOpt?: object) => void;
        }
      ).captureStackTrace!(this, this.constructor);
    } else {
      this.stack = new Error(message).stack;
    }
  }

  /**
   * Logs the error details using the global logger.
   */
  log(): void {
    logger.error(`Error: ${this.message}`);
    if (this.context) {
      logger.error(`  Context: ${JSON.stringify(this.context)}`);
    }
    if (this.originalError instanceof Error) {
      logger.error(`  Original Error: ${this.originalError.message}`);
      logger.debug(`  Original Stack: ${this.originalError.stack}`);
    } else if (this.originalError) {
      logger.debug(`  Original Error Details: ${String(this.originalError)}`);
    }
    logger.debug(`  Stack Trace: ${this.stack}`);
  }

  /**
   * Converts the error to a serializable object.
   */
  toObject(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      context: this.context,
      originalError:
        this.originalError instanceof Error
          ? {
              name: this.originalError.name,
              message: this.originalError.message,
              stack: this.originalError.stack,
            }
          : String(this.originalError),
    };
  }
}

/**
 * Represents an error during the overall generation process.
 */
export class GeneratorError extends BaseGeneratorError {
  constructor(
    message: string,
    originalError?: Error | unknown,
    context?: Record<string, unknown>,
  ) {
    super(message, originalError, context);
    this.name = "GeneratorError";
  }
}

/**
 * Represents an error during workspace analysis (e.g., file system issues, TS project loading).
 */
export class AnalysisError extends BaseGeneratorError {
  constructor(
    message: string,
    originalError?: Error | unknown,
    context?: Record<string, unknown>,
  ) {
    super(`Analysis failed: ${message}`, originalError, context);
    this.name = "AnalysisError";
  }
}

/**
 * Represents an error during AI model interaction (e.g., API errors, invalid responses).
 */
export class LLMError extends BaseGeneratorError {
  public readonly statusCode?: number;
  public readonly errorCode?: string; // Custom error code like 'RATE_LIMIT', 'AUTH_ERROR'

  constructor(
    message: string,
    statusCode?: number,
    errorCode?: string,
    originalError?: Error | unknown,
    context?: Record<string, unknown>,
  ) {
    super(`AI interaction failed: ${message}`, originalError, context);
    this.name = "LLMError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }

  toObject(): Record<string, unknown> {
    return {
      ...super.toObject(),
      statusCode: this.statusCode,
      errorCode: this.errorCode,
    };
  }
}

/**
 * Represents an error during the embedding generation or similarity search process.
 */
export class EmbeddingError extends BaseGeneratorError {
  constructor(
    message: string,
    originalError?: Error | unknown,
    context?: Record<string, unknown>,
  ) {
    super(`Embedding process failed: ${message}`, originalError, context);
    this.name = "EmbeddingError";
  }
}

/**
 * Represents an error during AST manipulation or file writing/saving.
 */
export class TransformationError extends BaseGeneratorError {
  public readonly filePath: string;
  public readonly nodeName?: string;

  constructor(
    message: string,
    filePath: string,
    nodeName?: string,
    originalError?: Error | unknown,
    context?: Record<string, unknown>,
  ) {
    const fullMessage = `Transformation failed in ${filePath}${nodeName ? ` for node '${nodeName}'` : ""}: ${message}`;
    super(fullMessage, originalError, context);
    this.name = "TransformationError";
    this.filePath = filePath;
    this.nodeName = nodeName;
  }

  toObject(): Record<string, unknown> {
    return {
      ...super.toObject(),
      filePath: this.filePath,
      nodeName: this.nodeName,
    };
  }
}

/**
 * Represents an error related to configuration loading or validation.
 */
export class ConfigurationError extends BaseGeneratorError {
  constructor(
    message: string,
    originalError?: Error | unknown,
    context?: Record<string, unknown>,
  ) {
    super(`Configuration error: ${message}`, originalError, context);
    this.name = "ConfigurationError";
  }
}

/**
 * Handles critical, top-level errors that should lead to process exit.
 * Logs the error details and ensures a non-zero exit code.
 * @param error The error object or unknown reason.
 * @param context Additional context about where the error occurred.
 */
export function handleCriticalError(
  error: unknown,
  context: string | Record<string, unknown> = "unknown operation",
): void {
  const errorContext =
    typeof context === "string" ? { operation: context } : context;
  logger.fatal(
    `🚨 CRITICAL ERROR during ${errorContext.operation || "general operation"}:`,
  );

  if (error instanceof BaseGeneratorError) {
    error.log(); // Use custom log for BaseGeneratorErrors
  } else if (error instanceof Error) {
    logger.fatal(`  Name: ${error.name}`);
    logger.fatal(`  Message: ${error.message}`);
    logger.debug(`  Stack: ${error.stack}`);
    if (errorContext) {
      logger.error(`  Context: ${JSON.stringify(errorContext)}`);
    }
  } else {
    // Catch-all for non-Error objects
    logger.fatal(
      `  An unexpected non-Error object was thrown: ${String(error)}`,
    );
    if (errorContext) {
      logger.error(`  Context: ${JSON.stringify(errorContext)}`);
    }
  }
  process.exit(1);
}
