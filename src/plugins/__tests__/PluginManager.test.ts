import { PluginManager } from '../PluginManager';
import { BasePlugin } from '../BasePlugin';
import { ApiDocumentationPlugin } from '../ApiDocumentationPlugin';
import { ReactComponentPlugin } from '../ReactComponentPlugin';
import { Plugin, NodeContext, GeneratorConfig } from '../../types';
import { logger } from '../../utils/logger';

// Mock logger
jest.mock('../../utils/logger');

// Mock config
const mockConfig: GeneratorConfig = {
  workspaceDirs: ['src'],
  aiModels: [{
    id: 'test-model',
    provider: 'openai',
    type: 'generation',
    apiKey: 'test-key'
  }],
  aiClientConfig: {
    defaultGenerationModelId: 'test-model',
    defaultEmbeddingModelId: 'test-model',
    maxConcurrentRequests: 1,
    requestTimeout: 5000,
    maxRetries: 1
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
    enabled: false,
    dimensions: 1536,
    similarityThreshold: 0.8
  },
  cacheConfig: {
    enabled: true,
    ttl: 3600000
  }
} as any;

describe('PluginManager', () => {
  let pluginManager: PluginManager;

  beforeEach(() => {
    pluginManager = new PluginManager(mockConfig);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create PluginManager instance', () => {
      expect(pluginManager).toBeInstanceOf(PluginManager);
    });
  });

  describe('enablePlugin', () => {
    it('should enable a plugin', () => {
      const mockPlugin = new BasePlugin(mockConfig);
      pluginManager['plugins'].set('test-plugin', mockPlugin);
      
      pluginManager.enablePlugin('test-plugin');
      
      expect(pluginManager['enabledPlugins'].has('test-plugin')).toBe(true);
    });

    it('should log warning when plugin not found', () => {
      pluginManager.enablePlugin('non-existent-plugin');
      
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Plugin non-existent-plugin not found')
      );
    });
  });

  describe('disablePlugin', () => {
    it('should disable a plugin', () => {
      const mockPlugin = new BasePlugin(mockConfig);
      pluginManager['plugins'].set('test-plugin', mockPlugin);
      pluginManager['enabledPlugins'].add('test-plugin');
      
      pluginManager.disablePlugin('test-plugin');
      
      expect(pluginManager['enabledPlugins'].has('test-plugin')).toBe(false);
    });
  });

  describe('getEnabledPlugins', () => {
    it('should return enabled plugins', () => {
      const mockPlugin = new BasePlugin(mockConfig);
      pluginManager['plugins'].set('test-plugin', mockPlugin);
      pluginManager['enabledPlugins'].add('test-plugin');
      
      const enabledPlugins = pluginManager.getEnabledPlugins();
      
      expect(enabledPlugins).toHaveLength(1);
      expect(enabledPlugins[0]).toBe(mockPlugin);
    });

    it('should return empty array when no plugins enabled', () => {
      const enabledPlugins = pluginManager.getEnabledPlugins();
      
      expect(enabledPlugins).toHaveLength(0);
    });
  });

  describe('beforeProcessing hook', () => {
    it('should call beforeProcessing on enabled plugins', async () => {
      const mockPlugin = new BasePlugin(mockConfig);
      const beforeProcessingSpy = jest.spyOn(mockPlugin, 'beforeProcessing');
      
      pluginManager['plugins'].set('test-plugin', mockPlugin);
      pluginManager['enabledPlugins'].add('test-plugin');
      
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'testFunction',
        codeSnippet: 'function testFunction() {}',
        fileContext: '/test/file.ts',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {}
      };
      
      await pluginManager.beforeProcessing(mockContext);
      
      expect(beforeProcessingSpy).toHaveBeenCalledWith(mockContext);
    });

    it('should handle plugin errors gracefully', async () => {
      const mockPlugin = new BasePlugin(mockConfig);
      jest.spyOn(mockPlugin, 'beforeProcessing').mockRejectedValue(new Error('Plugin error'));
      
      pluginManager['plugins'].set('error-plugin', mockPlugin);
      pluginManager['enabledPlugins'].add('error-plugin');
      
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'testFunction',
        codeSnippet: 'function testFunction() {}',
        fileContext: '/test/file.ts',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {}
      };
      
      // Should not throw, but handle error gracefully
      await expect(pluginManager.beforeProcessing(mockContext)).resolves.not.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Plugin error-plugin failed during beforeProcessing'),
        expect.any(Error)
      );
    });
  });

  describe('afterProcessing hook', () => {
    it('should call afterProcessing on enabled plugins', async () => {
      const mockPlugin = new BasePlugin(mockConfig);
      const afterProcessingSpy = jest.spyOn(mockPlugin, 'afterProcessing');
      
      pluginManager['plugins'].set('test-plugin', mockPlugin);
      pluginManager['enabledPlugins'].add('test-plugin');
      
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'testFunction',
        codeSnippet: 'function testFunction() {}',
        fileContext: '/test/file.ts',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {}
      };
      
      const result = await pluginManager.afterProcessing(mockContext, 'test jsdoc');
      
      expect(afterProcessingSpy).toHaveBeenCalledWith(mockContext, 'test jsdoc');
      expect(result).toBe('test jsdoc'); // BasePlugin returns unchanged result
    });

    it('should chain plugin results', async () => {
      const plugin1 = new BasePlugin(mockConfig);
      const plugin2 = new BasePlugin(mockConfig);
      
      jest.spyOn(plugin1, 'afterProcessing').mockResolvedValue('modified by plugin1');
      jest.spyOn(plugin2, 'afterProcessing').mockResolvedValue('modified by plugin2');
      
      pluginManager['plugins'].set('plugin1', plugin1);
      pluginManager['plugins'].set('plugin2', plugin2);
      pluginManager['enabledPlugins'].add('plugin1');
      pluginManager['enabledPlugins'].add('plugin2');
      
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'testFunction',
        codeSnippet: 'function testFunction() {}',
        fileContext: '/test/file.ts',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {}
      };
      
      const result = await pluginManager.afterProcessing(mockContext, 'original jsdoc');
      
      expect(result).toBe('modified by plugin2');
    });
  });
});

describe('BasePlugin', () => {
  let basePlugin: BasePlugin;

  beforeEach(() => {
    basePlugin = new BasePlugin(mockConfig);
  });

  describe('initialize', () => {
    it('should initialize plugin', async () => {
      await basePlugin.initialize(mockConfig);
      
      expect(basePlugin['initialized']).toBe(true);
      expect(basePlugin['config']).toBe(mockConfig);
    });
  });

  describe('beforeProcessing', () => {
    it('should return context unchanged', async () => {
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'testFunction',
        codeSnippet: 'function testFunction() {}',
        fileContext: '/test/file.ts',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {}
      };
      
      const result = await basePlugin.beforeProcessing(mockContext);
      
      expect(result).toBe(mockContext);
    });
  });

  describe('afterProcessing', () => {
    it('should return result unchanged', async () => {
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'testFunction',
        codeSnippet: 'function testFunction() {}',
        fileContext: '/test/file.ts',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {}
      };
      
      const result = await basePlugin.afterProcessing(mockContext, 'test jsdoc');
      
      expect(result).toBe('test jsdoc');
    });
  });
});

describe('ApiDocumentationPlugin', () => {
  let apiPlugin: ApiDocumentationPlugin;

  beforeEach(() => {
    apiPlugin = new ApiDocumentationPlugin(mockConfig);
  });

  describe('beforeProcessing', () => {
    it('should identify API routes and add metadata', async () => {
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'handler',
        codeSnippet: `
          export async function GET(request: Request) {
            return new Response('Hello');
          }
        `,
        fileContext: '/pages/api/users.ts',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {}
      };
      
      const result = await apiPlugin.beforeProcessing(mockContext);
      
      expect(result.customData?.isApiRoute).toBe(true);
      expect(result.customData?.httpMethod).toBe('GET');
      expect(result.customData?.routePath).toContain('users');
    });

    it('should not modify non-API route contexts', async () => {
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'utilityFunction',
        codeSnippet: 'function utilityFunction() { return "test"; }',
        fileContext: '/utils/helpers.ts',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {}
      };
      
      const result = await apiPlugin.beforeProcessing(mockContext);
      
      expect(result.customData?.isApiRoute).toBeUndefined();
    });
  });

  describe('afterProcessing', () => {
    it('should enhance JSDoc for API routes', async () => {
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'handler',
        codeSnippet: 'export async function POST() {}',
        fileContext: '/api/users.ts',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {
          isApiRoute: true,
          httpMethod: 'POST',
          routePath: '/users',
          middleware: ['authentication']
        }
      };
      
      const originalJsDoc = '/**\n * Handles user creation\n */';
      const result = await apiPlugin.afterProcessing(mockContext, originalJsDoc);
      
      expect(result).toContain('@route POST /users');
      expect(result).toContain('@middleware authentication');
      expect(result).toContain('@apiSuccess');
      expect(result).toContain('@apiError');
      expect(result).toContain('@example');
    });

    it('should not modify JSDoc for non-API routes', async () => {
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'utilityFunction',
        codeSnippet: 'function utilityFunction() {}',
        fileContext: '/utils/helpers.ts',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {}
      };
      
      const originalJsDoc = '/**\n * Utility function\n */';
      const result = await apiPlugin.afterProcessing(mockContext, originalJsDoc);
      
      expect(result).toBe(originalJsDoc);
    });
  });
});

describe('ReactComponentPlugin', () => {
  let reactPlugin: ReactComponentPlugin;

  beforeEach(() => {
    reactPlugin = new ReactComponentPlugin(mockConfig);
  });

  describe('beforeProcessing', () => {
    it('should identify React components and extract props', async () => {
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'UserCard',
        codeSnippet: `
          interface UserCardProps {
            name: string;
            email: string;
            isActive?: boolean;
          }
          
          function UserCard({ name, email, isActive }: UserCardProps): JSX.Element {
            return <div>{name}</div>;
          }
        `,
        fileContext: '/components/UserCard.tsx',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {}
      };
      
      const result = await reactPlugin.beforeProcessing(mockContext);
      
      expect(result.customData?.isReactComponent).toBe(true);
      expect(result.customData?.reactProps).toContain('name');
      expect(result.customData?.reactProps).toContain('email');
      expect(result.customData?.reactProps).toContain('isActive');
      expect(result.customData?.componentType).toBe('functional');
    });

    it('should detect hook usage', async () => {
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'Counter',
        codeSnippet: `
          function Counter(): JSX.Element {
            const [count, setCount] = useState(0);
            
            useEffect(() => {
              console.log('Count changed');
            }, [count]);
            
            return <div>{count}</div>;
          }
        `,
        fileContext: '/components/Counter.tsx',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {}
      };
      
      const result = await reactPlugin.beforeProcessing(mockContext);
      
      expect(result.customData?.isReactComponent).toBe(true);
      expect(result.customData?.hooksUsed).toContain('useState');
      expect(result.customData?.hooksUsed).toContain('useEffect');
    });

    it('should not modify non-React components', async () => {
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'utilityFunction',
        codeSnippet: 'function utilityFunction() { return "test"; }',
        fileContext: '/utils/helpers.ts',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {}
      };
      
      const result = await reactPlugin.beforeProcessing(mockContext);
      
      expect(result.customData?.isReactComponent).toBeUndefined();
    });
  });

  describe('afterProcessing', () => {
    it('should enhance JSDoc for React components', async () => {
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'UserCard',
        codeSnippet: 'function UserCard(props) { return <div>test</div>; }',
        fileContext: '/components/UserCard.tsx',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {
          isReactComponent: true,
          reactProps: ['name', 'email'],
          hooksUsed: ['useState', 'useEffect'],
          componentType: 'functional'
        }
      };
      
      const originalJsDoc = '/**\n * User card component\n */';
      const result = await reactPlugin.afterProcessing(mockContext, originalJsDoc);
      
      expect(result).toContain('@component functional React component');
      expect(result).toContain('@props Available props: name, email');
      expect(result).toContain('@hooks Uses React hooks: useState, useEffect');
    });

    it('should not modify JSDoc for non-React components', async () => {
      const mockContext: NodeContext = {
        nodeKind: 'FunctionDeclaration',
        nodeName: 'utilityFunction',
        codeSnippet: 'function utilityFunction() {}',
        fileContext: '/utils/helpers.ts',
        symbolReferences: [],
        relatedSymbols: [],
        customData: {}
      };
      
      const originalJsDoc = '/**\n * Utility function\n */';
      const result = await reactPlugin.afterProcessing(mockContext, originalJsDoc);
      
      expect(result).toBe(originalJsDoc);
    });
  });
});