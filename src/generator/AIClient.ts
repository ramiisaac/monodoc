import { GeneratorConfig, AIResponse, NodeContext, AIModelConfig } from "../types";
import { CacheManager } from "../utils/CacheManager";
import { logger } from "../utils/logger";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, embed, embedMany, cosineSimilarity } from "ai";

// Define internal types for AI model instances
interface AIModelInstance {
  config: AIModelConfig;
  provider: any; // Provider instance from AI SDK
  modelInstance: any; // Model instance from provider
}

/**
 * Client for interacting with AI services to generate JSDoc comments.
 * This class handles model selection, prompt construction, and caching
 * of AI-generated content to avoid redundant API calls.
 * Uses Vercel AI SDK for provider abstraction with full production support.
 */
export class AIClient {
  private config: GeneratorConfig;
  private cacheManager: CacheManager;
  private models: Map<string, AIModelInstance> = new Map();
  private defaultGenerationModel: AIModelInstance;
  private defaultEmbeddingModel: AIModelInstance;
  private requestCount: number = 0;
  private concurrencyLimit: (fn: () => Promise<any>) => Promise<any>;

  /**
   * Creates a new AIClient instance.
   * @param config The generator configuration
   * @param cacheManager Optional cache manager for caching responses
   */
  constructor(config: GeneratorConfig, cacheManager: CacheManager) {
    this.config = config;
    this.cacheManager = cacheManager;
    
    // Initialize simple concurrency limiter
    this.initializeConcurrencyLimit();
    
    // Initialize all AI models
    this.initializeModels();
    
    // Set default models
    this.setDefaultModels();
  }

  /**
   * Initializes the concurrency limiter with a simple implementation.
   */
  private initializeConcurrencyLimit(): void {
    let activeRequests = 0;
    const maxConcurrent = this.config.aiClientConfig.maxConcurrentRequests;
    
    this.concurrencyLimit = async (fn: () => Promise<any>) => {
      while (activeRequests >= maxConcurrent) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      activeRequests++;
      try {
        return await fn();
      } finally {
        activeRequests--;
      }
    };
  }

  /**
   * Initializes all AI models based on the configuration.
   */
  private initializeModels(): void {
    for (const modelConfig of this.config.aiModels) {
      try {
        const provider = this.createProvider(modelConfig);
        const modelInstance = this.createModelInstance(provider, modelConfig);
        
        this.models.set(modelConfig.id, {
          config: modelConfig,
          provider,
          modelInstance,
        });
        
        logger.debug(`Initialized model: ${modelConfig.id} (${modelConfig.provider}:${modelConfig.model})`);
      } catch (error) {
        logger.error(`Failed to initialize model ${modelConfig.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Creates a provider instance based on the model configuration.
   */
  private createProvider(modelConfig: AIModelConfig): any {
    const apiKey = modelConfig.apiKeyEnvVar 
      ? process.env[modelConfig.apiKeyEnvVar] 
      : process.env[`${modelConfig.provider.toUpperCase()}_API_KEY`];

    if (!apiKey) {
      throw new Error(`API key not found for provider: ${modelConfig.provider}. Set ${modelConfig.apiKeyEnvVar || `${modelConfig.provider.toUpperCase()}_API_KEY`} environment variable.`);
    }

    switch (modelConfig.provider.toLowerCase()) {
      case "openai":
        return createOpenAI({ 
          apiKey,
          baseURL: modelConfig.baseUrl,
        });
      case "google":
        return createGoogleGenerativeAI({ 
          apiKey,
          baseURL: modelConfig.baseUrl,
        });
      case "anthropic":
        return createAnthropic({ 
          apiKey,
          baseURL: modelConfig.baseUrl,
        });
      default:
        throw new Error(`Unsupported provider: ${modelConfig.provider}`);
    }
  }

  /**
   * Creates a model instance from the provider.
   */
  private createModelInstance(provider: any, modelConfig: AIModelConfig): any {
    switch (modelConfig.type) {
      case "generation":
        return provider(modelConfig.model);
      case "embedding":
        return provider.textEmbeddingModel(modelConfig.model);
      default:
        throw new Error(`Unsupported model type: ${modelConfig.type}`);
    }
  }

  /**
   * Sets the default models for generation and embedding.
   */
  private setDefaultModels(): void {
    const defaultGenModel = this.models.get(this.config.aiClientConfig.defaultGenerationModelId);
    const defaultEmbModel = this.models.get(this.config.aiClientConfig.defaultEmbeddingModelId);

    if (!defaultGenModel) {
      throw new Error(`Default generation model not found: ${this.config.aiClientConfig.defaultGenerationModelId}`);
    }

    if (!defaultEmbModel) {
      throw new Error(`Default embedding model not found: ${this.config.aiClientConfig.defaultEmbeddingModelId}`);
    }

    this.defaultGenerationModel = defaultGenModel;
    this.defaultEmbeddingModel = defaultEmbModel;
  }

  /**
   * Gets a model instance by ID.
   */
  private getModel(modelId?: string): AIModelInstance {
    if (modelId) {
      const model = this.models.get(modelId);
      if (!model) {
        throw new Error(`Model not found: ${modelId}`);
      }
      return model;
    }
    return this.defaultGenerationModel;
  }

  /**
   * Gets the embedding model instance.
   */
  private getEmbeddingModel(modelId?: string): AIModelInstance {
    if (modelId) {
      const model = this.models.get(modelId);
      if (!model) {
        throw new Error(`Embedding model not found: ${modelId}`);
      }
      if (model.config.type !== 'embedding') {
        throw new Error(`Model ${modelId} is not an embedding model`);
      }
      return model;
    }
    return this.defaultEmbeddingModel;
  }

  /**
   * Builds a prompt for JSDoc generation based on the node context.
   * @param nodeContext The context information for the node
   * @returns The formatted prompt messages
   */
  private buildJSDocPrompt(nodeContext: NodeContext) {
    const systemPrompt = `You are an expert TypeScript developer tasked with generating high-quality JSDoc comments.

Rules:
1. Generate complete, detailed JSDoc comments
2. Include descriptions for all parameters and return types
3. Add examples when helpful
4. Use proper JSDoc tags (@param, @returns, @example, etc.)
5. Be concise but informative
6. Follow TypeScript/JSDoc best practices

Return only the JSDoc comment block, no other text.`;

    const userPrompt = `Generate a JSDoc comment for this ${nodeContext.nodeKind}:

Name: ${nodeContext.nodeName}
Signature: ${nodeContext.signatureDetails}
File Context: ${nodeContext.fileContext}

Code Snippet:
\`\`\`typescript
${nodeContext.codeSnippet}
\`\`\``;

    return [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];
  }

  /**
   * Generates JSDoc content for a given node context.
   * @param nodeContext The context information for the node
   * @param options Optional generation options
   * @returns A promise resolving to an AIResponse
   */
  async generateJSDoc(
    nodeContext: NodeContext,
    options: { 
      forceFresh?: boolean; 
      maxRetries?: number; 
      modelId?: string;
      temperature?: number;
      maxTokens?: number;
    } = {},
  ): Promise<AIResponse> {
    const { 
      forceFresh = false, 
      maxRetries = this.config.aiClientConfig.maxRetries,
      modelId,
      temperature,
      maxTokens
    } = options;
    
    const cacheKey = `jsdoc:${nodeContext.id}:${modelId || 'default'}`;

    return this.concurrencyLimit(async () => {
      try {
        // Check cache first if not forcing fresh generation
        if (!forceFresh && this.cacheManager) {
          const cachedResponse = await this.cacheManager.get<AIResponse>(cacheKey);
          if (cachedResponse) {
            logger.debug(`Using cached JSDoc for ${nodeContext.nodeName}`);
            return cachedResponse;
          }
        }

        // Get model instance
        const modelInstance = this.getModel(modelId);
        
        // Track API usage
        this.requestCount++;

        // Generate JSDoc with AI using Vercel AI SDK
        logger.debug(
          `Generating JSDoc for ${nodeContext.nodeName} using ${modelInstance.config.provider}:${modelInstance.config.model}`,
        );

        const jsdocContent = await this.generateWithRetry(
          nodeContext,
          modelInstance,
          { temperature, maxTokens },
          maxRetries
        );

        // Prepare response
        const response: AIResponse = {
          jsdocContent: jsdocContent,
          status: jsdocContent ? "success" : "skip",
          reason: jsdocContent ? undefined : "AI returned empty content",
        };

        // Cache successful responses
        if (response.status === "success" && this.cacheManager) {
          await this.cacheManager.set(cacheKey, response);
        }

        logger.debug(
          `Generated JSDoc for ${nodeContext.nodeName}: ${jsdocContent?.length || 0} characters`,
        );
        return response;
      } catch (error) {
        logger.error(
          `Error generating JSDoc for ${nodeContext.nodeName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        return {
          jsdocContent: null,
          status: "error",
          reason:
            error instanceof Error
              ? error.message
              : "Unknown error during JSDoc generation",
        };
      }
    });
  }

  /**
   * Generates JSDoc content with retry logic.
   */
  private async generateWithRetry(
    nodeContext: NodeContext,
    modelInstance: AIModelInstance,
    options: { temperature?: number; maxTokens?: number },
    maxRetries: number
  ): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const prompt = this.buildJSDocPrompt(nodeContext);
        
        const result = await generateText({
          model: modelInstance.modelInstance,
          messages: prompt,
          temperature: options.temperature ?? modelInstance.config.temperature ?? 0.7,
          maxTokens: options.maxTokens ?? modelInstance.config.maxOutputTokens ?? 1000,
          topP: modelInstance.config.topP,
          topK: modelInstance.config.topK,
          seed: modelInstance.config.seed,
          stopSequences: modelInstance.config.stopSequences,
          maxRetries: 1, // Handle retries at this level
        });

        const jsdocContent = result.text.trim();
        
        // Validate the response
        if (!jsdocContent) {
          throw new Error("AI returned empty content");
        }

        // Basic validation - should look like JSDoc
        if (!jsdocContent.includes('/**') && !jsdocContent.includes('*')) {
          throw new Error("AI response does not appear to be JSDoc format");
        }

        return jsdocContent;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * this.config.aiClientConfig.retryDelayMs;
          logger.warn(`Attempt ${attempt + 1} failed for ${nodeContext.nodeName}, retrying in ${delay}ms: ${lastError.message}`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Sleep utility for retry delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets the number of AI requests made by this client.
   * @returns The number of AI requests
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Generates embeddings for a list of text inputs.
   * @param texts Array of text strings to embed
   * @param options Optional generation options
   * @returns A promise resolving to an array of embeddings (vectors)
   */
  async generateEmbeddings(
    texts: string[],
    options: { 
      modelId?: string; 
      cacheable?: boolean;
      maxRetries?: number;
    } = {},
  ): Promise<number[][]> {
    const { 
      modelId, 
      cacheable = true, 
      maxRetries = this.config.aiClientConfig.maxRetries 
    } = options;

    return this.concurrencyLimit(async () => {
      try {
        const embeddingModel = this.getEmbeddingModel(modelId);
        this.requestCount++;
        
        logger.debug(`Generating embeddings for ${texts.length} texts using ${embeddingModel.config.provider}:${embeddingModel.config.model}`);

        // Check cache for batch if enabled
        const cacheKey = cacheable ? `embeddings:${this.hashTexts(texts)}:${embeddingModel.config.id}` : null;
        
        if (cacheKey && this.cacheManager) {
          const cachedEmbeddings = await this.cacheManager.get<number[][]>(cacheKey);
          if (cachedEmbeddings) {
            logger.debug(`Using cached embeddings for ${texts.length} texts`);
            return cachedEmbeddings;
          }
        }

        // Generate embeddings with retry logic
        const embeddings = await this.generateEmbeddingsWithRetry(texts, embeddingModel, maxRetries);

        // Cache the results
        if (cacheKey && this.cacheManager) {
          await this.cacheManager.set(cacheKey, embeddings);
        }

        logger.debug(
          `Generated ${embeddings.length} embeddings with ${embeddings[0]?.length || 0} dimensions`,
        );
        return embeddings;
      } catch (error) {
        logger.error(
          `Error generating embeddings: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    });
  }

  /**
   * Generates embeddings with retry logic.
   */
  private async generateEmbeddingsWithRetry(
    texts: string[],
    modelInstance: AIModelInstance,
    maxRetries: number
  ): Promise<number[][]> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Use batch embedding if multiple texts
        if (texts.length > 1) {
          const result = await embedMany({
            model: modelInstance.modelInstance,
            values: texts,
            maxRetries: 1, // Handle retries at this level
          });
          return result.embeddings;
        } else {
          const result = await embed({
            model: modelInstance.modelInstance,
            value: texts[0],
            maxRetries: 1,
          });
          return [result.embedding];
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * this.config.aiClientConfig.retryDelayMs;
          logger.warn(`Embedding attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error("Max retries exceeded for embeddings");
  }

  /**
   * Generates a single embedding for a text.
   */
  async generateEmbedding(
    text: string,
    options: { modelId?: string; cacheable?: boolean } = {}
  ): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text], options);
    return embeddings[0];
  }

  /**
   * Calculates cosine similarity between two embeddings.
   */
  calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    return cosineSimilarity(embedding1, embedding2);
  }

  /**
   * Finds similar embeddings using cosine similarity.
   */
  findSimilarEmbeddings(
    queryEmbedding: number[],
    candidateEmbeddings: { id: string; embedding: number[] }[],
    threshold: number = 0.7,
    maxResults: number = 10
  ): { id: string; similarity: number }[] {
    const similarities = candidateEmbeddings.map(candidate => ({
      id: candidate.id,
      similarity: this.calculateCosineSimilarity(queryEmbedding, candidate.embedding)
    }));

    return similarities
      .filter(item => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);
  }

  /**
   * Hashes an array of texts for caching purposes.
   */
  private hashTexts(texts: string[]): string {
    // Simple hash function for caching - in production, consider using a proper hash function
    return texts.join('|').substring(0, 100) + texts.length;
  }

  /**
   * Gets cost estimation for text generation.
   * @param textLength Estimated length of text to process
   * @param modelId Optional specific model ID
   * @returns Cost estimation in USD
   */
  getCostEstimation(textLength: number, modelId?: string): {
    tokens: number;
    estimatedCost: number;
    provider: string;
    model: string;
  } {
    const modelInstance = this.getModel(modelId);
    
    // Rough token estimation (1 token ≈ 4 characters for most models)
    const estimatedTokens = Math.ceil(textLength / 4);

    let costPerToken = 0;
    const { provider, model } = modelInstance.config;

    // Updated cost estimates based on current pricing (as of 2024)
    switch (provider.toLowerCase()) {
      case "openai":
        if (model.includes("gpt-4o")) {
          costPerToken = 0.000015; // $0.015 per 1K tokens for GPT-4o
        } else if (model.includes("gpt-4")) {
          costPerToken = 0.00003; // $0.03 per 1K tokens for GPT-4
        } else if (model.includes("gpt-3.5")) {
          costPerToken = 0.000002; // $0.002 per 1K tokens for GPT-3.5
        } else {
          costPerToken = 0.000015; // Default OpenAI pricing
        }
        break;

      case "google":
        if (model.includes("gemini-1.5-pro")) {
          costPerToken = 0.000035; // $0.035 per 1K tokens for Gemini Pro
        } else if (model.includes("gemini-1.5-flash")) {
          costPerToken = 0.000015; // $0.015 per 1K tokens for Gemini Flash
        } else {
          costPerToken = 0.000025; // Default Google pricing
        }
        break;

      case "anthropic":
        if (model.includes("claude-3-opus")) {
          costPerToken = 0.000075; // $0.075 per 1K tokens for Claude 3 Opus
        } else if (model.includes("claude-3-sonnet")) {
          costPerToken = 0.000015; // $0.015 per 1K tokens for Claude 3.5 Sonnet
        } else if (model.includes("claude-3-haiku")) {
          costPerToken = 0.000001; // $0.001 per 1K tokens for Claude 3 Haiku
        } else {
          costPerToken = 0.000015; // Default Anthropic pricing
        }
        break;

      default:
        costPerToken = 0.000015; // Default pricing
    }

    const estimatedCost = estimatedTokens * costPerToken;

    return {
      tokens: estimatedTokens,
      estimatedCost,
      provider,
      model,
    };
  }

  /**
   * Gets cost estimation for embeddings.
   * @param textLength Estimated length of text to embed
   * @param modelId Optional specific embedding model ID
   * @returns Cost estimation in USD
   */
  getEmbeddingCostEstimation(textLength: number, modelId?: string): {
    tokens: number;
    estimatedCost: number;
    provider: string;
    model: string;
  } {
    const modelInstance = this.getEmbeddingModel(modelId);
    
    // Rough token estimation (1 token ≈ 4 characters for most models)
    const estimatedTokens = Math.ceil(textLength / 4);

    let costPerToken = 0;
    const { provider, model } = modelInstance.config;

    // Embedding cost estimates
    switch (provider.toLowerCase()) {
      case "openai":
        if (model.includes("text-embedding-3-large")) {
          costPerToken = 0.00000013; // $0.00013 per 1K tokens
        } else if (model.includes("text-embedding-3-small")) {
          costPerToken = 0.00000002; // $0.00002 per 1K tokens
        } else if (model.includes("text-embedding-ada-002")) {
          costPerToken = 0.0000001; // $0.0001 per 1K tokens
        } else {
          costPerToken = 0.00000013; // Default OpenAI embedding pricing
        }
        break;

      case "google":
        costPerToken = 0.00000125; // $0.00125 per 1K tokens for Gemini embeddings
        break;

      default:
        costPerToken = 0.00000013; // Default embedding pricing
    }

    const estimatedCost = estimatedTokens * costPerToken;

    return {
      tokens: estimatedTokens,
      estimatedCost,
      provider,
      model,
    };
  }

  /**
   * Gets available models by type.
   */
  getAvailableModels(type?: 'generation' | 'embedding'): AIModelConfig[] {
    const models = Array.from(this.models.values()).map(instance => instance.config);
    
    if (type) {
      return models.filter(model => model.type === type);
    }
    
    return models;
  }

  /**
   * Gets model health status.
   */
  async getModelHealth(modelId?: string): Promise<{
    modelId: string;
    healthy: boolean;
    error?: string;
    latency?: number;
  }> {
    const modelInstance = this.getModel(modelId);
    const startTime = Date.now();
    
    try {
      // Test the model with a simple request
      const testPrompt = [
        { role: "user" as const, content: "Hello" }
      ];
      
      await generateText({
        model: modelInstance.modelInstance,
        messages: testPrompt,
        maxTokens: 10,
      });
      
      const latency = Date.now() - startTime;
      
      return {
        modelId: modelInstance.config.id,
        healthy: true,
        latency,
      };
    } catch (error) {
      return {
        modelId: modelInstance.config.id,
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
