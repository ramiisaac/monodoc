import path from "path";
import fs from "fs/promises";
import { logger } from "./logger";
import { AnalysisError } from "./errorHandling"; // Assuming AnalysisError is the most fitting for file ops
import * as yaml from "js-yaml";

/**
 * Reads a JSON file and parses its content.
 * @param filePath The path to the JSON file.
 * @returns A Promise that resolves to the parsed JSON object, or null if the file is not found or parsing fails.
 */
export async function readJsonFile<T = unknown>(
  filePath: string,
): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      logger.trace(`File not found: ${filePath}`);
    } else {
      logger.warn(
        `Failed to read or parse JSON file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  }
}

/**
 * Reads a YAML file and parses its content.
 * @param filePath The path to the YAML file.
 * @returns A Promise that resolves to the parsed YAML object, or null if the file is not found or parsing fails.
 */
export async function readYamlFile<T = unknown>(
  filePath: string,
): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return yaml.load(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      logger.trace(`File not found: ${filePath}`);
    } else {
      logger.warn(
        `Failed to read or parse YAML file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  }
}

/**
 * Writes content to a file, creating parent directories if they don't exist.
 * @param filePath The path to the file to write.
 * @param content The string content to write.
 * @returns A Promise that resolves when the file is written.
 * @throws AnalysisError if writing fails.
 */
export async function writeFile(
  filePath: string,
  content: string,
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  } catch (error) {
    throw new AnalysisError(
      `Failed to write file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}

/**
 * Checks if a path exists.
 * @param pathToCheck The path to check.
 * @returns A Promise that resolves to true if the path exists, false otherwise.
 */
export async function pathExists(pathToCheck: string): Promise<boolean> {
  try {
    await fs.access(pathToCheck);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the entire content of a file.
 * @param filePath The path to the file.
 * @returns A Promise that resolves to the file content as a string, or null if reading fails.
 */
export async function readFileContent(
  filePath: string,
): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    logger.warn(
      `Failed to read file content for ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Reads a file asynchronously.
 * @param filePath The path to the file.
 * @returns A Promise that resolves to the file content as a string.
 */
export async function readFileAsync(filePath: string): Promise<string> {
  return await fs.readFile(filePath, "utf8");
}

/**
 * Writes content to a file asynchronously.
 * @param filePath The path to the file.
 * @param content The content to write.
 * @returns A Promise that resolves when the file is written.
 */
export async function writeFileAsync(
  filePath: string,
  content: string,
): Promise<void> {
  return await fs.writeFile(filePath, content, "utf8");
}

/**
 * Ensures that a directory exists, creating it if necessary.
 * @param dirPath The path to the directory.
 * @returns A Promise that resolves when the directory exists.
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "EEXIST") {
      throw error;
    }
  }
}
