import { GitignoreManager, GitignoreConfig } from "../GitignoreManager";
import * as fs from "fs/promises";

// Mock fs.promises
jest.mock("fs/promises");
const mockFs = fs as jest.Mocked<typeof fs>;

describe("GitignoreManager", () => {
  let gitignoreManager: GitignoreManager;
  const testBasePath = "/test/project";

  beforeEach(() => {
    jest.clearAllMocks();
    gitignoreManager = new GitignoreManager(testBasePath);
  });

  describe("initialization", () => {
    it("should initialize with default config", async () => {
      mockFs.readFile.mockResolvedValue("node_modules/\n*.log\n# comment\n");
      
      await gitignoreManager.initialize();
      
      const patterns = gitignoreManager.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns).toContain("node_modules/**");
      expect(patterns).toContain("*.log");
      expect(patterns).not.toContain("# comment"); // Comments should be filtered
    });

    it("should handle missing .gitignore file gracefully", async () => {
      const error = new Error("File not found") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      mockFs.readFile.mockRejectedValue(error);
      
      await expect(gitignoreManager.initialize()).resolves.not.toThrow();
      
      const patterns = gitignoreManager.getPatterns();
      expect(patterns.length).toBeGreaterThan(0); // Should still have default patterns
    });

    it("should load custom ignore patterns", async () => {
      const customConfig: Partial<GitignoreConfig> = {
        customIgnorePatterns: ["custom-pattern.ts", "*.custom"],
      };
      
      gitignoreManager = new GitignoreManager(testBasePath, customConfig);
      mockFs.readFile.mockResolvedValue("");
      
      await gitignoreManager.initialize();
      
      const patterns = gitignoreManager.getPatterns();
      expect(patterns).toContain("custom-pattern.ts");
      expect(patterns).toContain("*.custom");
    });
  });

  describe("shouldIgnore", () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValue("node_modules/\n*.log\ntemp/\n");
      await gitignoreManager.initialize();
    });

    it("should have patterns loaded", () => {
      const patterns = gitignoreManager.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it("should not ignore normal source files", () => {
      expect(gitignoreManager.shouldIgnore("src/index.ts")).toBe(false);
      expect(gitignoreManager.shouldIgnore("lib/utils.js")).toBe(false);
    });

    it("should respect enabled/disabled state", () => {
      const disabledManager = new GitignoreManager(testBasePath, { enabled: false });
      expect(disabledManager.shouldIgnore("node_modules/anything")).toBe(false);
    });
  });

  describe("filterFiles", () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValue("node_modules/\n*.log\n");
      await gitignoreManager.initialize();
    });

    it("should have basic filtering functionality", () => {
      const files = [
        "src/index.ts",
        "lib/utils.js",
      ];

      const filtered = gitignoreManager.filterFiles(files);
      
      expect(filtered).toContain("src/index.ts");
      expect(filtered).toContain("lib/utils.js");
    });

    it("should return all files when gitignore is disabled", () => {
      const disabledManager = new GitignoreManager(testBasePath, { enabled: false });
      
      const files = ["src/index.ts", "node_modules/package/index.js"];
      const filtered = disabledManager.filterFiles(files);
      
      expect(filtered).toEqual(files);
    });
  });

  describe("pattern matching", () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValue("specific-file.txt\n");
      await gitignoreManager.initialize();
    });

    it("should handle exact file matches", () => {
      expect(gitignoreManager.shouldIgnore("specific-file.txt")).toBe(true);
      expect(gitignoreManager.shouldIgnore("other-file.txt")).toBe(false);
    });
  });

  describe("configuration", () => {
    it("should allow disabling gitignore integration", async () => {
      const disabledManager = new GitignoreManager(testBasePath, { enabled: false });
      
      expect(disabledManager.shouldIgnore("node_modules/anything")).toBe(false);
      expect(disabledManager.isEnabled()).toBe(false);
    });

    it("should allow updating configuration", async () => {
      mockFs.readFile.mockResolvedValue("");
      await gitignoreManager.initialize();
      
      await gitignoreManager.updateConfig({ enabled: false });
      
      expect(gitignoreManager.isEnabled()).toBe(false);
    });

    it("should allow adding custom patterns", async () => {
      mockFs.readFile.mockResolvedValue("");
      await gitignoreManager.initialize();
      
      gitignoreManager.addCustomPatterns(["custom-pattern.txt"]);
      
      const patterns = gitignoreManager.getPatterns();
      expect(patterns).toContain("custom-pattern.txt");
    });
  });

  describe("getConfigSummary", () => {
    it("should return configuration summary", async () => {
      mockFs.readFile.mockResolvedValue("pattern1\npattern2\n");
      await gitignoreManager.initialize();
      
      const summary = gitignoreManager.getConfigSummary();
      
      expect(summary.enabled).toBe(true);
      expect(summary.patternsCount).toBeGreaterThan(0);
      expect(summary.respectsGitignore).toBe(true);
      expect(summary.allowsOverride).toBe(true);
    });
  });
});