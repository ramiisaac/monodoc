import { AIClient } from "../AIClient";
import { CacheManager } from "../../utils/CacheManager";
import { GeneratorConfig, NodeContext } from "../../types";

// Mock the CacheManager
jest.mock("../../utils/CacheManager");
const MockCacheManager = CacheManager as jest.MockedClass<typeof CacheManager>;

describe("AIClient", () => {
  let aiClient: AIClient;
  let mockCacheManager: jest.Mocked<CacheManager>;
  let mockConfig: GeneratorConfig;
  let mockNodeContext: NodeContext;

  beforeEach(() => {
    // Mock environment variable for API key
    process.env.OPENAI_API_KEY = 'test-key';
    
    mockCacheManager = new MockCacheManager("/tmp/cache") as jest.Mocked<CacheManager>;
    mockConfig = {
      aiModels: [
        {
          id: "test-openai-gpt4",
          model: "gpt-4",
          provider: "openai",
          type: "generation",
          apiKeyEnvVar: "OPENAI_API_KEY",
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      ],
    } as GeneratorConfig;

    mockNodeContext = {
      id: "test-node-123",
      nodeName: "testFunction",
      nodeKind: "function",
      parameters: [
        { name: "param1", type: "string" },
        { name: "param2", type: "number" },
      ],
      returnType: "boolean",
      sourceCode: "function testFunction(param1: string, param2: number): boolean { return true; }",
    } as NodeContext;

    aiClient = new AIClient(mockConfig, mockCacheManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clean up environment variable
    delete process.env.OPENAI_API_KEY;
  });

  describe("generateJSDoc", () => {
    it("should return cached response when available", async () => {
      const cachedResponse = {
        jsdocContent: "/** Cached JSDoc */",
        status: "success" as const,
      };
      mockCacheManager.get.mockResolvedValue(cachedResponse);

      const result = await aiClient.generateJSDoc(mockNodeContext);

      expect(result).toEqual(cachedResponse);
      expect(mockCacheManager.get).toHaveBeenCalledWith("jsdoc:test-node-123");
    });

    it("should generate new JSDoc when cache is empty", async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockCacheManager.set.mockResolvedValue();

      const result = await aiClient.generateJSDoc(mockNodeContext);

      expect(result.status).toBe("success");
      expect(result.jsdocContent).toContain("testFunction");
      expect(result.jsdocContent).toContain("A function that performs operations");
      expect(mockCacheManager.set).toHaveBeenCalledWith("jsdoc:test-node-123", result);
    });

    it("should generate new JSDoc when forceFresh is true", async () => {
      const cachedResponse = {
        jsdocContent: "/** Cached JSDoc */",
        status: "success" as const,
      };
      mockCacheManager.get.mockResolvedValue(cachedResponse);
      mockCacheManager.set.mockResolvedValue();

      const result = await aiClient.generateJSDoc(mockNodeContext, { forceFresh: true });

      expect(result.status).toBe("success");
      expect(result.jsdocContent).not.toBe(cachedResponse.jsdocContent);
      expect(mockCacheManager.get).not.toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      mockCacheManager.get.mockRejectedValue(new Error("Cache error"));

      const result = await aiClient.generateJSDoc(mockNodeContext);

      expect(result.status).toBe("error");
      expect(result.reason).toContain("Cache error");
    });

    it("should handle cache set errors gracefully", async () => {
      mockCacheManager.get.mockResolvedValue(null);
      // Mock the cache manager to throw an error during set operation
      mockCacheManager.set.mockRejectedValue(new Error("Cache write failed"));
      
      const result = await aiClient.generateJSDoc(mockNodeContext);
      
      // When cache set fails, the AIClient should still return an error status
      // since the cache operation is part of the generation process
      expect(result.status).toBe("error");
      expect(result.reason).toContain("Cache write failed");
      expect(mockCacheManager.set).toHaveBeenCalled();
    });
  });

  describe("getRequestCount", () => {
    it("should track request count", async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockCacheManager.set.mockResolvedValue();

      expect(aiClient.getRequestCount()).toBe(0);

      await aiClient.generateJSDoc(mockNodeContext);
      expect(aiClient.getRequestCount()).toBe(1);

      await aiClient.generateJSDoc({ ...mockNodeContext, id: "test-node-456" });
      expect(aiClient.getRequestCount()).toBe(2);
    });

    it("should not increment request count for cached responses", async () => {
      const cachedResponse = {
        jsdocContent: "/** Cached JSDoc */",
        status: "success" as const,
      };
      mockCacheManager.get.mockResolvedValue(cachedResponse);

      await aiClient.generateJSDoc(mockNodeContext);
      expect(aiClient.getRequestCount()).toBe(0);
    });
  });
});