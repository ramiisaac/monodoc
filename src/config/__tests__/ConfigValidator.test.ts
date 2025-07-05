import { ConfigValidator } from '../ConfigValidator';
import { GeneratorConfig } from '../../types';

describe('ConfigValidator', () => {
  let validConfig: Record<string, unknown>;

  beforeEach(() => {
    validConfig = {
      workspaceDirs: ['src', 'lib'],
      aiModels: [
        {
          id: 'gpt-4',
          provider: 'openai',
          model: 'gpt-4o',
          type: 'generation',
          apiKeyEnvVar: 'OPENAI_API_KEY'
        },
        {
          id: 'text-embedding-ada-002',
          provider: 'openai',
          model: 'text-embedding-ada-002',
          type: 'embedding',
          apiKeyEnvVar: 'OPENAI_API_KEY'
        }
      ],
      aiClientConfig: {
        defaultGenerationModelId: 'gpt-4',
        defaultEmbeddingModelId: 'text-embedding-ada-002',
        maxConcurrentRequests: 5,
        requestDelayMs: 100,
        maxRetries: 3,
        retryDelayMs: 1000,
        maxTokensPerBatch: 10000
      },
      embeddingConfig: {
        enabled: true,
        modelId: 'text-embedding-ada-002',
        minRelationshipScore: 0.7,
        maxRelatedSymbols: 10,
        embeddingBatchSize: 100
      },
      jsdocConfig: {
        prioritizeExports: true,
        includePrivate: false,
        includeNodeKinds: ['function', 'class', 'interface'],
        excludeNodeKinds: [],
        maxSnippetLength: 500,
        generateExamples: true,
        overwriteExisting: false,
        mergeExisting: true,
        minJsdocLength: 50,
        includeSymbolReferences: true,
        includeRelatedSymbols: true
      },
      outputConfig: {
        reportFileName: 'monodoc-report.json',
        reportDir: 'docs',
        logLevel: 'info'
      },
      includePatterns: ['**/*.ts'],
      ignorePatterns: ['node_modules/**'],
      targetPaths: [],
      dryRun: false,
      forceOverwrite: false,
      noMergeExisting: false,
      disableEmbeddings: false
    };
  });

  describe('validate', () => {
    it('should validate a correct configuration', () => {
      // Set environment variable for the test
      process.env.OPENAI_API_KEY = 'test-key';
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toBeUndefined();
      expect(result.value).toBeDefined();
      expect(result.warnings).toEqual([]);
      
      // Clean up
      delete process.env.OPENAI_API_KEY;
    });

    it('should fail validation when workspaceDirs is missing', () => {
      delete validConfig.workspaceDirs;
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toContain('workspaceDirs');
      expect(result.error).toContain('non-empty array');
    });

    it('should fail validation when workspaceDirs is empty', () => {
      validConfig.workspaceDirs = [];
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toContain('workspaceDirs');
      expect(result.error).toContain('empty');
    });

    it('should fail validation when aiModels is missing', () => {
      delete validConfig.aiModels;
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toContain('aiModels');
      expect(result.error).toContain('non-empty array');
    });

    it('should fail validation when aiModels is empty', () => {
      validConfig.aiModels = [];
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toContain('aiModels');
      expect(result.error).toContain('empty');
    });

    it('should fail validation when aiClientConfig is missing', () => {
      delete validConfig.aiClientConfig;
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toContain('aiClientConfig is required');
    });

    it('should fail validation when required aiClientConfig properties are missing', () => {
      validConfig.aiClientConfig = {};
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toContain('defaultGenerationModelId');
      expect(result.error).toContain('defaultEmbeddingModelId');
      expect(result.error).toContain('maxConcurrentRequests');
    });

    it('should fail validation when maxConcurrentRequests is not positive', () => {
      (validConfig.aiClientConfig as any).maxConcurrentRequests = 0;
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toContain('maxConcurrentRequests');
      expect(result.error).toContain('greater than 0');
    });

    it('should fail validation when maxConcurrentRequests is negative', () => {
      (validConfig.aiClientConfig as any).maxConcurrentRequests = -1;
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toContain('maxConcurrentRequests');
      expect(result.error).toContain('greater than 0');
    });

    it('should validate AI model configurations', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      
      validConfig.aiModels = [
        {
          id: 'gpt-4',
          provider: 'openai',
          model: 'gpt-4o',
          type: 'generation',
          apiKeyEnvVar: 'OPENAI_API_KEY'
        },
        {
          id: 'text-embedding-ada-002',
          provider: 'openai',
          model: 'text-embedding-ada-002',
          type: 'embedding',
          apiKeyEnvVar: 'OPENAI_API_KEY'
        }
      ];
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toBeUndefined();
      expect(result.value).toBeDefined();
      
      // Clean up
      delete process.env.OPENAI_API_KEY;
    });

    it('should handle multiple validation errors', () => {
      delete validConfig.workspaceDirs;
      delete validConfig.aiModels;
      delete validConfig.aiClientConfig;
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toContain('workspaceDirs');
      expect(result.error).toContain('aiModels');
      expect(result.error).toContain('aiClientConfig');
    });

    it('should generate warnings for optional configurations', () => {
      // Test with minimal valid config that might generate warnings
      process.env.OPENAI_API_KEY = 'test-key';
      
      const minimalConfig = {
        workspaceDirs: ['src'],
        aiModels: [
          {
            id: 'gpt-4',
            provider: 'openai',
            model: 'gpt-4o',
            type: 'generation',
            apiKeyEnvVar: 'OPENAI_API_KEY'
          },
          {
            id: 'text-embedding-ada-002',
            provider: 'openai',
            model: 'text-embedding-ada-002',
            type: 'embedding',
            apiKeyEnvVar: 'OPENAI_API_KEY'
          }
        ],
        aiClientConfig: {
          defaultGenerationModelId: 'gpt-4',
          defaultEmbeddingModelId: 'text-embedding-ada-002',
          maxConcurrentRequests: 1,
          requestDelayMs: 100,
          maxRetries: 3,
          retryDelayMs: 1000,
          maxTokensPerBatch: 10000
        },
        embeddingConfig: {
          enabled: true,
          modelId: 'text-embedding-ada-002',
          minRelationshipScore: 0.7,
          maxRelatedSymbols: 10,
          embeddingBatchSize: 100
        },
        jsdocConfig: {
          prioritizeExports: true,
          includePrivate: false,
          includeNodeKinds: ['function'],
          excludeNodeKinds: [],
          maxSnippetLength: 500,
          generateExamples: true,
          overwriteExisting: false,
          mergeExisting: true,
          minJsdocLength: 50,
          includeSymbolReferences: true,
          includeRelatedSymbols: true
        },
        outputConfig: {
          reportFileName: 'report.json',
          reportDir: 'docs',
          logLevel: 'info'
        },
        includePatterns: ['**/*.ts'],
        ignorePatterns: ['node_modules/**'],
        targetPaths: [],
        dryRun: false,
        forceOverwrite: false,
        noMergeExisting: false,
        disableEmbeddings: false
      };
      
      const result = ConfigValidator.validate(minimalConfig);
      
      expect(result.error).toBeUndefined();
      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
      
      // Clean up
      delete process.env.OPENAI_API_KEY;
    });

    it('should handle invalid data types gracefully', () => {
      validConfig.workspaceDirs = 'not-an-array';
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toContain('workspaceDirs');
    });

    it('should handle null values gracefully', () => {
      validConfig.workspaceDirs = null;
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toContain('workspaceDirs');
    });

    it('should handle undefined nested properties', () => {
      validConfig.aiClientConfig = {
        defaultGenerationModelId: undefined,
        defaultEmbeddingModelId: undefined,
        maxConcurrentRequests: undefined
      };
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toContain('defaultGenerationModelId');
      expect(result.error).toContain('defaultEmbeddingModelId');
      expect(result.error).toContain('maxConcurrentRequests');
    });

    it('should return the validated config on success', () => {
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validConfig);
    });
  });

  describe('error handling', () => {
    it('should handle empty config object', () => {
      const result = ConfigValidator.validate({});
      
      expect(result.error).toBeDefined();
      expect(result.error).toContain('workspaceDirs');
      expect(result.error).toContain('aiModels');
      expect(result.error).toContain('aiClientConfig');
    });

    it('should handle config with extra properties', () => {
      const configWithExtras = {
        ...validConfig,
        extraProperty: 'extra-value',
        anotherExtra: 123
      };
      
      const result = ConfigValidator.validate(configWithExtras);
      
      expect(result.error).toBeUndefined();
      expect(result.value).toBeDefined();
    });
  });
});