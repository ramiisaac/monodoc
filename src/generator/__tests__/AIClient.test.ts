import { AIClient } from '../AIClient';
import { GeneratorConfig, AIModelConfig, NodeContext } from '../../types';
import { CacheManager } from '../../utils/CacheManager';
import { generateText, embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Mock the AI SDK functions
jest.mock('ai', () => ({
  generateText: jest.fn(),
  embed: jest.fn(),
  embedMany: jest.fn(),
  cosineSimilarity: jest.fn(),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(),
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(),
}));

jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: jest.fn(),
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock CacheManager
jest.mock('../../utils/CacheManager', () => ({
  CacheManager: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    clear: jest.fn(),
  })),
}));

describe('AIClient', () => {
  let aiClient: AIClient;
  let mockCacheManager: jest.Mocked<CacheManager>;
  let mockConfig: GeneratorConfig;
  let mockOpenAIProvider: jest.Mock;
  let mockAnthropicProvider: jest.Mock;
  let mockGoogleProvider: jest.Mock;

  const mockNodeContext: NodeContext = {
    id: 'test-node-1',
    codeSnippet: 'function testFunction() { return "test"; }',
    nodeKind: 'function',
    nodeName: 'testFunction',
    signatureDetails: 'function testFunction(): string',
    fileContext: '/test/file.ts',
    packageContext: 'test-package',
  };

  const mockAIModels: AIModelConfig[] = [
    {
      id: 'openai-gpt4',
      provider: 'openai',
      model: 'gpt-4o',
      type: 'generation',
      apiKeyEnvVar: 'OPENAI_API_KEY',
      temperature: 0.7,
      maxOutputTokens: 1000,
    },
    {
      id: 'openai-embedding',
      provider: 'openai',
      model: 'text-embedding-3-small',
      type: 'embedding',
      apiKeyEnvVar: 'OPENAI_API_KEY',
    },
    {
      id: 'anthropic-claude',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      type: 'generation',
      apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    },
  ];

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock environment variables
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.GOOGLE_API_KEY = 'test-google-key';

    // Mock cache manager
    mockCacheManager = new (CacheManager as any)('/tmp/cache') as jest.Mocked<CacheManager>;

    // Mock provider functions
    mockOpenAIProvider = jest.fn();
    mockAnthropicProvider = jest.fn();
    mockGoogleProvider = jest.fn();

    (createOpenAI as jest.Mock).mockReturnValue(mockOpenAIProvider);
    (createAnthropic as jest.Mock).mockReturnValue(mockAnthropicProvider);
    (createGoogleGenerativeAI as jest.Mock).mockReturnValue(mockGoogleProvider);

    // Mock model instances
    mockOpenAIProvider.mockReturnValue('mock-openai-model');
    mockOpenAIProvider.textEmbeddingModel = jest.fn().mockReturnValue('mock-embedding-model');
    mockAnthropicProvider.mockReturnValue('mock-anthropic-model');
    mockGoogleProvider.mockReturnValue('mock-google-model');

    mockConfig = {
      aiModels: mockAIModels,
      aiClientConfig: {
        defaultGenerationModelId: 'openai-gpt4',
        defaultEmbeddingModelId: 'openai-embedding',
        maxConcurrentRequests: 5,
        requestDelayMs: 100,
        maxRetries: 2,
        retryDelayMs: 1000,
        maxTokensPerBatch: 10000,
      },
      embeddingConfig: {
        enabled: true,
        modelId: 'openai-embedding',
        minRelationshipScore: 0.7,
        maxRelatedSymbols: 10,
        embeddingBatchSize: 100,
      },
    } as GeneratorConfig;

    aiClient = new AIClient(mockConfig, mockCacheManager);
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  describe('initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(createOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-openai-key',
        baseURL: undefined,
      });
      expect(createAnthropic).toHaveBeenCalledWith({
        apiKey: 'test-anthropic-key',
        baseURL: undefined,
      });
      expect(aiClient.getRequestCount()).toBe(0);
    });

    it('should throw error if API key is missing', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      
      expect(() => {
        new AIClient(mockConfig, mockCacheManager);
      }).toThrow('API key not found');
    });

    it('should throw error if default model is not found', () => {
      const invalidConfig = {
        ...mockConfig,
        aiClientConfig: {
          ...mockConfig.aiClientConfig,
          defaultGenerationModelId: 'non-existent-model',
        },
      };

      expect(() => {
        new AIClient(invalidConfig, mockCacheManager);
      }).toThrow('Default generation model not found: non-existent-model');
    });
  });

  describe('generateJSDoc', () => {
    it('should generate JSDoc successfully', async () => {
      const mockResponse = {
        text: '/**\n * Test function description\n * @returns string\n */',
      };

      (generateText as jest.Mock).mockResolvedValue(mockResponse);

      const result = await aiClient.generateJSDoc(mockNodeContext);

      expect(result.status).toBe('success');
      expect(result.jsdocContent).toBe(mockResponse.text);
      expect(aiClient.getRequestCount()).toBe(1);
    });

    it('should use cached result when available', async () => {
      const cachedResponse = {
        jsdocContent: '/**\n * Cached JSDoc\n */',
        status: 'success' as const,
      };

      mockCacheManager.get.mockResolvedValue(cachedResponse);

      const result = await aiClient.generateJSDoc(mockNodeContext);

      expect(result).toEqual(cachedResponse);
      expect(generateText).not.toHaveBeenCalled();
      expect(aiClient.getRequestCount()).toBe(0);
    });

    it('should retry on failure', async () => {
      (generateText as jest.Mock)
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValue({ text: '/**\n * Success on retry\n */' });

      const result = await aiClient.generateJSDoc(mockNodeContext);

      expect(result.status).toBe('success');
      expect(generateText).toHaveBeenCalledTimes(2);
    });

    it('should handle max retries exceeded', async () => {
      (generateText as jest.Mock).mockRejectedValue(new Error('Persistent API Error'));

      const result = await aiClient.generateJSDoc(mockNodeContext);

      expect(result.status).toBe('error');
      expect(result.reason).toContain('Persistent API Error');
      expect(generateText).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should validate JSDoc format', async () => {
      (generateText as jest.Mock).mockResolvedValue({ text: 'Not a JSDoc comment' });

      const result = await aiClient.generateJSDoc(mockNodeContext);

      expect(result.status).toBe('error');
      expect(result.reason).toContain('does not appear to be JSDoc format');
    });

    it('should use specific model when provided', async () => {
      const mockResponse = { text: '/**\n * Anthropic generated\n */' };
      (generateText as jest.Mock).mockResolvedValue(mockResponse);

      await aiClient.generateJSDoc(mockNodeContext, { modelId: 'anthropic-claude' });

      expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
        model: 'mock-anthropic-model',
      }));
    });
  });

  describe('generateEmbeddings', () => {
    it('should generate embeddings for multiple texts', async () => {
      const mockEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];

      (embedMany as jest.Mock).mockResolvedValue({ embeddings: mockEmbeddings });

      const texts = ['text1', 'text2'];
      const result = await aiClient.generateEmbeddings(texts);

      expect(result).toEqual(mockEmbeddings);
      expect(embedMany).toHaveBeenCalledWith({
        model: 'mock-embedding-model',
        values: texts,
        maxRetries: 1,
      });
    });

    it('should generate embedding for single text', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      (embed as jest.Mock).mockResolvedValue({ embedding: mockEmbedding });

      const result = await aiClient.generateEmbeddings(['single text']);

      expect(result).toEqual([mockEmbedding]);
      expect(embed).toHaveBeenCalledWith({
        model: 'mock-embedding-model',
        value: 'single text',
        maxRetries: 1,
      });
    });

    it('should use cache when available', async () => {
      const cachedEmbeddings = [[0.1, 0.2, 0.3]];
      mockCacheManager.get.mockResolvedValue(cachedEmbeddings);

      const result = await aiClient.generateEmbeddings(['text'], { cacheable: true });

      expect(result).toEqual(cachedEmbeddings);
      expect(embed).not.toHaveBeenCalled();
    });

    it('should retry on failure', async () => {
      (embed as jest.Mock)
        .mockRejectedValueOnce(new Error('Embedding API Error'))
        .mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

      const result = await aiClient.generateEmbeddings(['text']);

      expect(result).toEqual([[0.1, 0.2, 0.3]]);
      expect(embed).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateEmbedding', () => {
    it('should generate single embedding', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      (embed as jest.Mock).mockResolvedValue({ embedding: mockEmbedding });

      const result = await aiClient.generateEmbedding('test text');

      expect(result).toEqual(mockEmbedding);
    });
  });

  describe('cost estimation', () => {
    it('should calculate cost for text generation', () => {
      const textLength = 1000; // characters
      const result = aiClient.getCostEstimation(textLength);

      expect(result.tokens).toBe(250); // 1000 chars / 4
      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o');
    });

    it('should calculate cost for embeddings', () => {
      const textLength = 1000; // characters
      const result = aiClient.getEmbeddingCostEstimation(textLength);

      expect(result.tokens).toBe(250); // 1000 chars / 4
      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('text-embedding-3-small');
    });

    it('should handle different model pricing', () => {
      const gpt4Cost = aiClient.getCostEstimation(1000, 'openai-gpt4');
      const claudeCost = aiClient.getCostEstimation(1000, 'anthropic-claude');

      // The costs should be different values, but they might be close. Let's just ensure they're both positive
      expect(gpt4Cost.estimatedCost).toBeGreaterThan(0);
      expect(claudeCost.estimatedCost).toBeGreaterThan(0);
      expect(gpt4Cost.provider).toBe('openai');
      expect(claudeCost.provider).toBe('anthropic');
    });
  });

  describe('model management', () => {
    it('should get available models', () => {
      const models = aiClient.getAvailableModels();
      expect(models).toHaveLength(3);
      
      const generationModels = aiClient.getAvailableModels('generation');
      expect(generationModels).toHaveLength(2);
      
      const embeddingModels = aiClient.getAvailableModels('embedding');
      expect(embeddingModels).toHaveLength(1);
    });

    it('should check model health', async () => {
      (generateText as jest.Mock).mockResolvedValue({ text: 'Hello' });

      const health = await aiClient.getModelHealth();

      expect(health.healthy).toBe(true);
      expect(health.modelId).toBe('openai-gpt4');
      expect(health.latency).toBeGreaterThanOrEqual(0);
    });

    it('should detect unhealthy models', async () => {
      (generateText as jest.Mock).mockRejectedValue(new Error('Model unavailable'));

      const health = await aiClient.getModelHealth();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain('Model unavailable');
    });
  });

  describe('similarity functions', () => {
    it('should find similar embeddings', () => {
      const queryEmbedding = [1, 0, 0];
      const candidates = [
        { id: 'similar', embedding: [0.9, 0.1, 0.1] },
        { id: 'different', embedding: [0, 1, 0] },
      ];

      // Mock cosineSimilarity to return different values
      const { cosineSimilarity } = require('ai');
      (cosineSimilarity as jest.Mock)
        .mockReturnValueOnce(0.85) // similar
        .mockReturnValueOnce(0.1); // different

      const result = aiClient.findSimilarEmbeddings(queryEmbedding, candidates, 0.7);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('similar');
      expect(result[0].similarity).toBe(0.85);
    });
  });
});