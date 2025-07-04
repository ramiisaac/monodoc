import { PackageDetector } from "../PackageDetector";
import * as fs from "fs/promises";
import * as path from "path";

// Mock fs.promises
jest.mock("fs/promises");
const mockFs = fs as jest.Mocked<typeof fs>;

describe("PackageDetector", () => {
  let packageDetector: PackageDetector;

  beforeEach(() => {
    jest.clearAllMocks();
    packageDetector = new PackageDetector();
  });

  describe("detectPackages", () => {
    it("should detect packages in a monorepo structure", async () => {
      const rootDir = "/test/monorepo";
      
      // Mock directory structure
      mockFs.readdir.mockImplementation(async (dir: string) => {
        if (dir === rootDir) {
          return ["packages", "apps", "package.json"] as any;
        }
        if (dir === path.join(rootDir, "packages")) {
          return ["package-a", "package-b"] as any;
        }
        if (dir === path.join(rootDir, "apps")) {
          return ["app-1"] as any;
        }
        return [] as any;
      });

      // Mock package.json files
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.endsWith("package.json")) {
          return JSON.stringify({
            name: "test-package",
            version: "1.0.0",
            scripts: { build: "tsc" },
          });
        }
        throw new Error("File not found");
      });

      // Mock stat to identify directories
      mockFs.stat.mockImplementation(async (filePath: string) => {
        return {
          isDirectory: () => !filePath.endsWith(".json"),
          isFile: () => filePath.endsWith(".json"),
        } as any;
      });

      const packages = await packageDetector.detectPackages(rootDir);

      expect(packages.length).toBeGreaterThan(0);
      expect(packages.some(pkg => pkg.name === "test-package")).toBe(true);
    });

    it("should handle single package repositories", async () => {
      const rootDir = "/test/single-package";
      
      mockFs.readdir.mockResolvedValue(["src", "package.json"] as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        name: "single-package",
        version: "1.0.0",
      }));
      mockFs.stat.mockImplementation(async (filePath: string) => {
        return {
          isDirectory: () => !filePath.endsWith(".json"),
          isFile: () => filePath.endsWith(".json"),
        } as any;
      });

      const packages = await packageDetector.detectPackages(rootDir);

      expect(packages).toHaveLength(1);
      expect(packages[0].name).toBe("single-package");
    });

    it("should handle directories without package.json", async () => {
      const rootDir = "/test/no-package";
      
      mockFs.readdir.mockResolvedValue(["src", "docs"] as any);
      mockFs.stat.mockImplementation(async () => {
        return { isDirectory: () => true, isFile: () => false } as any;
      });
      mockFs.readFile.mockRejectedValue(new Error("File not found"));

      const packages = await packageDetector.detectPackages(rootDir);

      expect(packages).toHaveLength(0);
    });

    it("should handle read errors gracefully", async () => {
      const rootDir = "/test/error-dir";
      
      mockFs.readdir.mockRejectedValue(new Error("Permission denied"));

      const packages = await packageDetector.detectPackages(rootDir);

      expect(packages).toHaveLength(0);
    });
  });

  describe("isPackageDirectory", () => {
    it("should identify package directories", async () => {
      mockFs.access.mockResolvedValue();

      const result = await packageDetector.isPackageDirectory("/test/package");

      expect(result).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith(
        path.join("/test/package", "package.json")
      );
    });

    it("should return false for non-package directories", async () => {
      const mockError = new Error("File not found") as any;
      mockError.code = "ENOENT";
      mockFs.access.mockRejectedValue(mockError);

      const result = await packageDetector.isPackageDirectory("/test/not-package");

      expect(result).toBe(false);
    });
  });

  describe("readPackageJson", () => {
    it("should read and parse package.json", async () => {
      const packageData = {
        name: "test-package",
        version: "1.0.0",
        dependencies: { "lodash": "^4.0.0" },
      };
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(packageData));

      const result = await packageDetector.readPackageJson("/test/package");

      expect(result).toEqual(packageData);
    });

    it("should return null for invalid JSON", async () => {
      mockFs.readFile.mockResolvedValue("invalid json");

      const result = await packageDetector.readPackageJson("/test/package");

      expect(result).toBeNull();
    });

    it("should return null when file doesn't exist", async () => {
      const mockError = new Error("File not found") as any;
      mockError.code = "ENOENT";
      mockFs.readFile.mockRejectedValue(mockError);

      const result = await packageDetector.readPackageJson("/test/package");

      expect(result).toBeNull();
    });
  });
});