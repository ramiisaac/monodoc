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
          type: 'generation',
          apiKey: 'test-key'
        }
      ],
      aiClientConfig: {
        defaultGenerationModelId: 'gpt-4',
        defaultEmbeddingModelId: 'text-embedding-ada-002',
        maxConcurrentRequests: 5,
        requestTimeout: 30000,
        maxRetries: 3
      },
      jsdocConfig: {
        overwriteExisting: false,
        mergeExisting: true,
        includePrivate: false,
        includeInternal: false
      },
      outputConfig: {
        outputDir: 'docs',
        logLevel: 'info'
      },
      embeddingConfig: {
        enabled: true,
        dimensions: 1536,
        similarityThreshold: 0.8
      },
      cacheConfig: {
        enabled: true,
        ttl: 3600000
      }
    };
  });

  describe('validate', () => {
    it('should validate a correct configuration', () => {
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toBeUndefined();
      expect(result.value).toBeDefined();
      expect(result.warnings).toEqual([]);
    });

    it('should fail validation when workspaceDirs is missing', () => {
      delete validConfig.workspaceDirs;
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toContain('workspaceDirs');
      expect(result.error).toContain('required');
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
      expect(result.error).toContain('required');
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
      expect(result.error).toContain('positive');
    });

    it('should fail validation when maxConcurrentRequests is negative', () => {
      (validConfig.aiClientConfig as any).maxConcurrentRequests = -1;
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toContain('maxConcurrentRequests');
      expect(result.error).toContain('positive');
    });

    it('should validate AI model configurations', () => {
      validConfig.aiModels = [
        {
          id: 'gpt-4',
          provider: 'openai',
          type: 'generation'
        }
      ];
      
      const result = ConfigValidator.validate(validConfig);
      
      expect(result.error).toBeUndefined();
      expect(result.value).toBeDefined();
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
      const minimalConfig = {
        workspaceDirs: ['src'],
        aiModels: [
          {
            id: 'gpt-4',
            provider: 'openai',
            type: 'generation'
          }
        ],
        aiClientConfig: {
          defaultGenerationModelId: 'gpt-4',
          defaultEmbeddingModelId: 'text-embedding-ada-002',
          maxConcurrentRequests: 1
        }
      };
      
      const result = ConfigValidator.validate(minimalConfig);
      
      expect(result.error).toBeUndefined();
      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
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