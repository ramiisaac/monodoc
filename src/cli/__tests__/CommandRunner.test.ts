import { CommandRunner } from '../CommandRunner';
import { CliOptions, ICommand, CommandContext } from '../../types';
import { logger } from '../../utils/logger';
import { loadAndMergeConfig } from '../../config';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('../../config');

const mockLoadAndMergeConfig = loadAndMergeConfig as jest.MockedFunction<typeof loadAndMergeConfig>;

// Mock command
class MockCommand implements ICommand {
  name = 'mock-command';
  description = 'Mock command for testing';
  
  async execute(context: CommandContext): Promise<void> {
    // Mock execution
  }
}

class MockFailingCommand implements ICommand {
  name = 'mock-failing-command';
  description = 'Mock failing command for testing';
  
  async execute(context: CommandContext): Promise<void> {
    throw new Error('Mock command failure');
  }
}

describe('CommandRunner', () => {
  let commandRunner: CommandRunner;
  let mockCliOptions: CliOptions;

  beforeEach(() => {
    mockCliOptions = {
      configPath: 'test-config.yaml',
      verbose: false,
      dryRun: false,
    };
    commandRunner = new CommandRunner('/test/base/dir', mockCliOptions);
    
    // Mock the config loading
    mockLoadAndMergeConfig.mockResolvedValue({
      workspaceDirs: ['src'],
      aiModels: [{
        id: 'gpt-4',
        provider: 'openai',
        type: 'generation',
        apiKey: 'test-key'
      }],
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
    } as any);
    
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create CommandRunner instance with correct properties', () => {
      expect(commandRunner).toBeInstanceOf(CommandRunner);
      expect(commandRunner['baseDir']).toBe('/test/base/dir');
      expect(commandRunner['cliOptions']).toEqual(mockCliOptions);
    });
  });

  describe('run', () => {
    it('should execute command successfully', async () => {
      const mockCommand = new MockCommand();
      const executeSpy = jest.spyOn(mockCommand, 'execute');

      await commandRunner.run(mockCommand);

      expect(executeSpy).toHaveBeenCalled();
      expect(mockLoadAndMergeConfig).toHaveBeenCalledWith('test-config.yaml');
    });

    it('should handle command execution failure', async () => {
      const mockCommand = new MockFailingCommand();
      const executeSpy = jest.spyOn(mockCommand, 'execute');

      await expect(commandRunner.run(mockCommand)).rejects.toThrow('Mock command failure');
      expect(executeSpy).toHaveBeenCalled();
    });

    it('should pass correct context to command', async () => {
      const mockCommand = new MockCommand();
      const executeSpy = jest.spyOn(mockCommand, 'execute');

      await commandRunner.run(mockCommand);

      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          baseDir: '/test/base/dir',
          cliOptions: mockCliOptions,
        })
      );
    });

    it('should handle config loading errors', async () => {
      const configError = new Error('Config loading failed');
      mockLoadAndMergeConfig.mockRejectedValue(configError);

      const mockCommand = new MockCommand();
      
      await expect(commandRunner.run(mockCommand)).rejects.toThrow('Config loading failed');
    });
  });

  describe('with verbose logging', () => {
    beforeEach(() => {
      mockCliOptions.verbose = true;
      commandRunner = new CommandRunner('/test/base/dir', mockCliOptions);
    });

    it('should handle verbose mode', async () => {
      const mockCommand = new MockCommand();
      await commandRunner.run(mockCommand);
      
      // Command should still execute successfully with verbose mode
      expect(jest.spyOn(mockCommand, 'execute')).toHaveBeenCalled();
    });
  });

  describe('with dry run mode', () => {
    beforeEach(() => {
      mockCliOptions.dryRun = true;
      commandRunner = new CommandRunner('/test/base/dir', mockCliOptions);
    });

    it('should handle dry run mode', async () => {
      const mockCommand = new MockCommand();
      await commandRunner.run(mockCommand);
      
      // Command should still execute successfully with dry run mode
      expect(jest.spyOn(mockCommand, 'execute')).toHaveBeenCalled();
    });
  });
});