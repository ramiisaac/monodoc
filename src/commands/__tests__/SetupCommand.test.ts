import { SetupCommand } from '../SetupCommand';
import { CommandContext } from '../../types';
import { InteractiveCLI } from '../../cli/InteractiveCLI';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../cli/InteractiveCLI');
jest.mock('../../utils/logger');

const MockInteractiveCLI = InteractiveCLI as jest.Mocked<typeof InteractiveCLI>;

describe('SetupCommand', () => {
  let setupCommand: SetupCommand;
  let mockContext: CommandContext;

  beforeEach(() => {
    setupCommand = new SetupCommand();
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
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should execute setup command successfully', async () => {
      MockInteractiveCLI.runSetup.mockResolvedValue();

      await setupCommand.execute(mockContext);

      expect(logger.info).toHaveBeenCalledWith('Running interactive setup wizard...');
      expect(MockInteractiveCLI.runSetup).toHaveBeenCalledWith(mockContext.baseDir);
      expect(logger.success).toHaveBeenCalledWith('Configuration setup completed successfully.');
    });

    it('should handle setup failure with Error object', async () => {
      const error = new Error('Setup failed');
      MockInteractiveCLI.runSetup.mockRejectedValue(error);

      await expect(setupCommand.execute(mockContext)).rejects.toThrow('Setup failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Interactive setup failed: Setup failed'
      );
    });

    it('should handle setup failure with non-Error object', async () => {
      const error = 'String error';
      MockInteractiveCLI.runSetup.mockRejectedValue(error);

      await expect(setupCommand.execute(mockContext)).rejects.toThrow('String error');
      expect(logger.error).toHaveBeenCalledWith(
        'Interactive setup failed: String error'
      );
    });

    it('should pass correct baseDir to InteractiveCLI', async () => {
      const customBaseDir = '/custom/base/dir';
      const customContext = { ...mockContext, baseDir: customBaseDir };
      
      MockInteractiveCLI.runSetup.mockResolvedValue();

      await setupCommand.execute(customContext);

      expect(MockInteractiveCLI.runSetup).toHaveBeenCalledWith(customBaseDir);
    });

    it('should re-throw errors for CommandRunner error handling', async () => {
      const error = new Error('Setup failed');
      MockInteractiveCLI.runSetup.mockRejectedValue(error);

      await expect(setupCommand.execute(mockContext)).rejects.toBe(error);
    });
  });

  describe('error handling', () => {
    it('should handle undefined errors gracefully', async () => {
      MockInteractiveCLI.runSetup.mockRejectedValue(undefined);

      await expect(setupCommand.execute(mockContext)).rejects.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Interactive setup failed: undefined'
      );
    });

    it('should handle null errors gracefully', async () => {
      MockInteractiveCLI.runSetup.mockRejectedValue(null);

      await expect(setupCommand.execute(mockContext)).rejects.toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Interactive setup failed: null'
      );
    });
  });
});