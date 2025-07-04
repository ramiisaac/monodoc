import { readFileAsync, writeFileAsync, ensureDirectoryExists } from "../fileUtils";
import * as fs from "fs/promises";
import * as path from "path";

// Mock fs.promises
jest.mock("fs/promises");
const mockFs = fs as jest.Mocked<typeof fs>;

describe("fileUtils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("readFileAsync", () => {
    it("should read file content successfully", async () => {
      const mockContent = "test file content";
      mockFs.readFile.mockResolvedValue(mockContent);

      const result = await readFileAsync("/path/to/file.txt");
      expect(result).toBe(mockContent);
      expect(mockFs.readFile).toHaveBeenCalledWith("/path/to/file.txt", "utf8");
    });

    it("should throw error when file reading fails", async () => {
      const mockError = new Error("File not found");
      mockFs.readFile.mockRejectedValue(mockError);

      await expect(readFileAsync("/path/to/nonexistent.txt")).rejects.toThrow("File not found");
    });
  });

  describe("writeFileAsync", () => {
    it("should write file content successfully", async () => {
      const mockContent = "test content to write";
      mockFs.writeFile.mockResolvedValue();

      await writeFileAsync("/path/to/file.txt", mockContent);
      expect(mockFs.writeFile).toHaveBeenCalledWith("/path/to/file.txt", mockContent, "utf8");
    });

    it("should throw error when file writing fails", async () => {
      const mockError = new Error("Permission denied");
      mockFs.writeFile.mockRejectedValue(mockError);

      await expect(writeFileAsync("/path/to/file.txt", "content")).rejects.toThrow("Permission denied");
    });
  });

  describe("ensureDirectoryExists", () => {
    it("should create directory if it doesn't exist", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);

      await ensureDirectoryExists("/path/to/new/directory");
      expect(mockFs.mkdir).toHaveBeenCalledWith("/path/to/new/directory", { recursive: true });
    });

    it("should handle existing directory gracefully", async () => {
      const mockError = new Error("Directory exists") as any;
      mockError.code = "EEXIST";
      mockFs.mkdir.mockRejectedValue(mockError);

      await expect(ensureDirectoryExists("/path/to/existing")).resolves.not.toThrow();
    });

    it("should throw error for other mkdir failures", async () => {
      const mockError = new Error("Permission denied");
      mockFs.mkdir.mockRejectedValue(mockError);

      await expect(ensureDirectoryExists("/path/to/directory")).rejects.toThrow("Permission denied");
    });
  });
});