import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { logger } from "./logger";

/**
 * Represents a cached entry with data, timestamp, version, and a content hash.
 * @template T The type of the cached data.
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: string;
  hash: string; // Hash of the content that generated this cache entry
}

/**
 * Helper class to encapsulate common file operation patterns for caching.
 */
class CacheFileHelper {
  /**
   * Executes an async function and logs a warning if it fails.
   * @param fn The async function to execute.
   * @param warnMsg The warning message to log on failure.
   */
  static async runWithWarn(
    fn: () => Promise<void>,
    warnMsg: string,
  ): Promise<void> {
    try {
      await fn();
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.warn(`${warnMsg}: ${error.message}`);
      } else {
        logger.warn(`${warnMsg}: Unknown error`);
      }
    }
  }

  /**
   * Executes an async function to get data, providing a fallback if the file is not found.
   * Logs debug messages for cache misses due to file not found or other errors.
   * @param fn The async function to execute.
   * @param key The cache key, for logging purposes.
   * @param onMiss A function to return the fallback value on cache miss.
   * @template T The type of the data.
   * @returns The data from cache or the fallback value.
   */
  static async runWithGetFallback<T>(
    fn: () => Promise<T>,
    key: string,
    onMiss: () => T,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      if (
        !(
          error instanceof Error &&
          (error as NodeJS.ErrnoException).code === "ENOENT"
        )
      ) {
        // Log errors that are not just "file not found" as potential issues
        logger.debug(
          `Cache read error for key ${key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } else {
        logger.trace(`Cache miss for key: ${key} (file not found)`);
      }
      return onMiss();
    }
  }
}

/**
 * Manages caching of data to the file system.
 * Uses content-based hashing and versioning for cache invalidation.
 */
export class CacheManager {
  private cacheDir: string;
  private maxAge: number; // Maximum age of cache entry in milliseconds
  private readonly appVersion: string; // Version of the application, for cache invalidation

  /**
   * Creates a new CacheManager instance.
   * @param cacheDir The directory where cache files will be stored.
   * @param maxAgeHours Optional. The maximum age of a cache entry in hours. Defaults to 24.
   */
  constructor(cacheDir: string, maxAgeHours: number = 24) {
    this.cacheDir = cacheDir;
    this.maxAge = maxAgeHours * 60 * 60 * 1000; // Convert hours to milliseconds
    this.appVersion = process.env.npm_package_version || "1.0.0"; // Get app version for invalidation
  }

  /**
   * Initializes the cache directory, creating it if it doesn't exist.
   */
  async initialize(): Promise<void> {
    await CacheFileHelper.runWithWarn(async () => {
      await fs.mkdir(this.cacheDir, { recursive: true });
      logger.debug(`Cache directory initialized: ${this.cacheDir}`);
    }, "Failed to initialize cache directory");
  }

  /**
   * Generates a SHA256 hash for a given string input.
   * @param input The string to hash.
   * @returns The SHA256 hash as a hexadecimal string.
   */
  private generateKeyHash(input: string): string {
    return crypto.createHash("sha256").update(input).digest("hex");
  }

  /**
   * Gets the full file path for a given cache key hash.
   * @param keyHash The hash of the cache key.
   * @returns The full path to the cache file.
   */
  private getCachePath(keyHash: string): string {
    return path.join(this.cacheDir, `${keyHash}.json`);
  }

  /**
   * Checks if a cached entry is valid based on its age, application version, and content hash.
   * @param entry The cached entry to validate.
   * @param content Optional. The current content that corresponds to this cache entry. If provided, its hash is checked against the cached hash.
   * @template T The type of the cached data.
   * @returns True if the cache entry is valid, false otherwise.
   */
  private isCacheValid<T>(entry: CacheEntry<T>, content?: string): boolean {
    // Check age
    if (Date.now() - entry.timestamp > this.maxAge) {
      logger.trace("Cache invalidated: expired");
      return false;
    }
    // Check application version
    if (entry.version !== this.appVersion) {
      logger.trace("Cache invalidated: app version mismatch");
      return false;
    }
    // Check content hash if content is provided
    if (content && entry.hash !== this.generateKeyHash(content)) {
      logger.trace("Cache invalidated: content hash mismatch");
      return false;
    }
    return true;
  }

  /**
   * Retrieves data from the cache.
   * @param key The unique key for the cache entry.
   * @param content Optional. The current content associated with the key, used for hash-based invalidation.
   * @template T The type of the data to retrieve.
   * @returns A Promise that resolves to the cached data, or null if not found or invalid.
   */
  async get<T>(key: string, content?: string): Promise<T | null> {
    const cacheKeyHash = this.generateKeyHash(key);
    const cachePath = this.getCachePath(cacheKeyHash);

    return CacheFileHelper.runWithGetFallback<T | null>(
      async () => {
        const cacheData = await fs.readFile(cachePath, "utf-8");
        const entry: CacheEntry<T> = JSON.parse(cacheData);

        if (!this.isCacheValid(entry, content)) {
          // If invalid, delete the stale entry to keep cache clean
          await this.delete(key);
          return null;
        }

        logger.trace(`Cache hit for key: ${key}`);
        return entry.data;
      },
      key,
      () => null, // Fallback function for cache miss
    );
  }

  /**
   * Stores data in the cache.
   * @param key The unique key for the cache entry.
   * @param data The data to store.
   * @param content Optional. The content that generated this data, used to create a hash for invalidation.
   * @template T The type of the data to store.
   * @returns A Promise that resolves when the data is stored.
   */
  async set<T>(key: string, data: T, content?: string): Promise<void> {
    const cacheKeyHash = this.generateKeyHash(key);
    const cachePath = this.getCachePath(cacheKeyHash);

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      version: this.appVersion,
      hash: content ? this.generateKeyHash(content) : "", // Store hash if content is provided
    };

    await CacheFileHelper.runWithWarn(async () => {
      await fs.writeFile(cachePath, JSON.stringify(entry), "utf-8");
      logger.trace(`Cached data for key: ${key}`);
    }, `Failed to cache data for key ${key}`);
  }

  /**
   * Checks if a cache entry exists for the given key.
   * @param key The key to check for.
   * @returns A Promise that resolves to true if the entry exists, false otherwise.
   */
  async has(key: string): Promise<boolean> {
    const cacheKeyHash = this.generateKeyHash(key);
    const cachePath = this.getCachePath(cacheKeyHash);
    try {
      await fs.access(cachePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deletes a specific entry from the cache.
   * @param key The key of the entry to delete.
   * @returns A Promise that resolves when the entry is deleted (or if it didn't exist).
   */
  async delete(key: string): Promise<void> {
    const cacheKeyHash = this.generateKeyHash(key);
    const cachePath = this.getCachePath(cacheKeyHash);
    try {
      await fs.unlink(cachePath);
      logger.trace(`Deleted cache for key: ${key}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File already doesn't exist, which is fine
        logger.trace(`Attempted to delete non-existent cache for key: ${key}`);
      } else {
        logger.warn(
          `Failed to delete cache for key ${key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Clears all entries from the cache directory.
   * @returns A Promise that resolves when the cache is cleared.
   */
  async clear(): Promise<void> {
    await CacheFileHelper.runWithWarn(async () => {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map((file) => fs.unlink(path.join(this.cacheDir, file))),
      );
      logger.info("Cache cleared successfully");
    }, "Failed to clear cache");
  }
}
