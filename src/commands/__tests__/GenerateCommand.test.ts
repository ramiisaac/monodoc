import { GenerateCommand } from '../GenerateCommand';
import { CommandContext, ProcessingStats } from '../../types';
import { GenerateDocumentationOperation } from '../../operations/GenerateDocumentationOperation';
import { logger } from '../../utils/logger';
import { HelpSystem } from '../../cli/HelpSystem';

// Mock dependencies
jest.mock('../../operations/GenerateDocumentationOperation');
jest.mock('../../utils/logger');
jest.mock('../../cli/HelpSystem');

const MockGenerateDocumentationOperation = GenerateDocumentationOperation as jest.MockedClass<typeof GenerateDocumentationOperation>;

describe('GenerateCommand', () => {
  let generateCommand: GenerateCommand;
  let mockContext: CommandContext;
  let mockStats: ProcessingStats;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    generateCommand = new GenerateCommand();
    mockContext = {
      baseDir: '/test/base/dir',
      config: {} as any,
      cacheManager: {} as any,
      telemetry: {} as any,
      pluginManager: {} as any,
      project: {} as any,
      reportGenerator: {} as any,
      cliOptions: {},
      aiClient: {} as any,
    };
    mockStats = {
      processedFiles: 10,
      successfulJsdocs: 8,
      failedJsdocs: 2,
      skippedJsdocs: 0,
      durationSeconds: 30.5,
      embeddingSuccesses: 5,
      embeddingFailures: 0,
      totalRelationshipsDiscovered: 15,
      modifiedFiles: 8,
    };
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('execute', () => {
    it('should execute generate command successfully', async () => {
      const mockOperation = new MockGenerateDocumentationOperation();
      mockOperation.execute.mockResolvedValue(mockStats);

      await generateCommand.execute(mockContext);

      expect(logger.info).toHaveBeenCalledWith('Starting JSDoc generation process...');
      expect(mockOperation.execute).toHaveBeenCalledWith(mockContext);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Generation Complete!')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Successfully processed 10 files')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Generated 8 JSDoc comments')
      );
    });

    it('should handle operation execution failure', async () => {
      const mockOperation = new MockGenerateDocumentationOperation();
      const error = new Error('Operation failed');
      mockOperation.execute.mockRejectedValue(error);

      await expect(generateCommand.execute(mockContext)).rejects.toThrow('Operation failed');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Generation operation failed: Operation failed')
      );
    });

    it('should handle undefined stats gracefully', async () => {
      const mockOperation = new MockGenerateDocumentationOperation();
      mockOperation.execute.mockResolvedValue(undefined);

      await generateCommand.execute(mockContext);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No statistics available from the generation process.')
      );
    });

    it('should handle non-Error exceptions', async () => {
      const mockOperation = new MockGenerateDocumentationOperation();
      mockOperation.execute.mockRejectedValue('String error');

      await expect(generateCommand.execute(mockContext)).rejects.toThrow('String error');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Generation operation failed: String error')
      );
    });

    it('should call HelpSystem.showCompletion with correct stats', async () => {
      const mockOperation = new MockGenerateDocumentationOperation();
      mockOperation.execute.mockResolvedValue(mockStats);

      await generateCommand.execute(mockContext);

      expect(HelpSystem.showCompletion).toHaveBeenCalledWith({
        filesProcessed: mockStats.processedFiles,
        successfulJsdocs: mockStats.successfulJsdocs,
        failedJsdocs: mockStats.failedJsdocs,
        skippedJsdocs: mockStats.skippedJsdocs,
        durationSeconds: mockStats.durationSeconds,
        embeddingSuccesses: mockStats.embeddingSuccesses,
        embeddingFailures: mockStats.embeddingFailures,
        totalRelationshipsDiscovered: mockStats.totalRelationshipsDiscovered,
        modifiedFiles: mockStats.modifiedFiles,
      });
    });

    it('should display completion banner and statistics', async () => {
      const mockOperation = new MockGenerateDocumentationOperation();
      mockOperation.execute.mockResolvedValue(mockStats);

      await generateCommand.execute(mockContext);

      expect(consoleSpy).toHaveBeenCalledWith(
        '\n╔══════════════════════════════════════════════════════════════╗'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '║                     🎉 Generation Complete!                ║'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '╚══════════════════════════════════════════════════════════════╝\n'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Reports saved to the configured output directory.'
      );
    });
  });

  describe('error handling', () => {
    it('should handle operation instantiation errors', async () => {
      // Mock constructor to throw
      MockGenerateDocumentationOperation.mockImplementation(() => {
        throw new Error('Constructor error');
      });

      await expect(generateCommand.execute(mockContext)).rejects.toThrow('Constructor error');
    });
  });
});