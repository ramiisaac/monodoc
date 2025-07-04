import { CacheManager } from "../CacheManager";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

// Mock fs.promises
jest.mock("fs/promises");
const mockFs = fs as jest.Mocked<typeof fs>;

describe("CacheManager", () => {
  let cacheManager: CacheManager;
  const mockCacheDir = "/tmp/test-cache";

  beforeEach(() => {
    jest.clearAllMocks();
    // Set a known app version for consistent testing
    process.env.npm_package_version = "1.0.0";
    cacheManager = new CacheManager(mockCacheDir);
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.npm_package_version;
  });

  // Helper function to generate expected cache file path
  const getCacheFilePath = (key: string): string => {
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    return path.join(mockCacheDir, `${hash}.json`);
  };

  describe("set", () => {
    it("should store data in cache", async () => {
      const testData = { key: "value", number: 42 };
      mockFs.writeFile.mockResolvedValue();

      await cacheManager.set("test-key", testData);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        getCacheFilePath("test-key"),
        expect.stringContaining('"data":{"key":"value","number":42}'),
        "utf-8"
      );
    });

    it("should handle cache write errors gracefully", async () => {
      const testData = { key: "value" };
      mockFs.writeFile.mockRejectedValue(new Error("Write failed"));

      // The CacheManager.set method catches errors and logs them, but doesn't throw
      await expect(cacheManager.set("test-key", testData)).resolves.not.toThrow();
    });
  });

  describe("get", () => {
    it("should retrieve data from cache", async () => {
      const testData = { key: "value", number: 42 };
      const now = Date.now();
      const cacheEntry = {
        data: testData,
        timestamp: now,
        version: "1.0.0", // Match the default app version
        hash: "",
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(cacheEntry));
      
      // Mock Date.now to ensure cache doesn't expire
      const originalNow = Date.now;
      Date.now = jest.fn(() => now);

      const result = await cacheManager.get("test-key");

      expect(result).toEqual(testData);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        getCacheFilePath("test-key"),
        "utf-8"
      );
      
      // Restore Date.now
      Date.now = originalNow;
    });

    it("should return null for non-existent cache files", async () => {
      const mockError = new Error("File not found") as any;
      mockError.code = "ENOENT";
      mockFs.readFile.mockRejectedValue(mockError);

      const result = await cacheManager.get("non-existent-key");

      expect(result).toBeNull();
    });

    it("should return null for other read failures", async () => {
      const mockError = new Error("Permission denied");
      mockFs.readFile.mockRejectedValue(mockError);

      const result = await cacheManager.get("test-key");

      expect(result).toBeNull();
    });

    it("should handle invalid JSON gracefully", async () => {
      mockFs.readFile.mockResolvedValue("invalid json content");

      const result = await cacheManager.get("test-key");

      expect(result).toBeNull();
    });
  });

  describe("has", () => {
    it("should return true for existing cache files", async () => {
      mockFs.access.mockResolvedValue();

      const result = await cacheManager.has("test-key");

      expect(result).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith(getCacheFilePath("test-key"));
    });

    it("should return false for non-existent cache files", async () => {
      const mockError = new Error("File not found") as any;
      mockError.code = "ENOENT";
      mockFs.access.mockRejectedValue(mockError);

      const result = await cacheManager.has("non-existent-key");

      expect(result).toBe(false);
    });
  });

  describe("delete", () => {
    it("should delete cache file", async () => {
      mockFs.unlink.mockResolvedValue();

      await cacheManager.delete("test-key");

      expect(mockFs.unlink).toHaveBeenCalledWith(getCacheFilePath("test-key"));
    });

    it("should handle deletion of non-existent files gracefully", async () => {
      const mockError = new Error("File not found") as any;
      mockError.code = "ENOENT";
      mockFs.unlink.mockRejectedValue(mockError);

      await expect(cacheManager.delete("non-existent-key")).resolves.not.toThrow();
    });
  });

  describe("clear", () => {
    it("should clear all cache files", async () => {
      mockFs.readdir.mockResolvedValue(["file1.json", "file2.json"] as any);
      mockFs.unlink.mockResolvedValue();

      await cacheManager.clear();

      expect(mockFs.readdir).toHaveBeenCalledWith(mockCacheDir);
      expect(mockFs.unlink).toHaveBeenCalledTimes(2);
    });

    it("should handle empty cache directory", async () => {
      mockFs.readdir.mockResolvedValue([] as any);

      await expect(cacheManager.clear()).resolves.not.toThrow();
    });
  });
});