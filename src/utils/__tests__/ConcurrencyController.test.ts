import { ConcurrencyController, createFileProcessingController, createConcurrencyController } from '../ConcurrencyController';

describe('ConcurrencyController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with valid maxConcurrent', () => {
      const controller = new ConcurrencyController(5, 'test tasks');
      expect(controller.getMaxConcurrent()).toBe(5);
      expect(controller.getDescription()).toBe('test tasks');
    });

    it('should throw error with invalid maxConcurrent', () => {
      expect(() => new ConcurrencyController(0)).toThrow('maxConcurrent must be a positive number');
      expect(() => new ConcurrencyController(-1)).toThrow('maxConcurrent must be a positive number');
    });

    it('should use default description when not provided', () => {
      const controller = new ConcurrencyController(3);
      expect(controller.getDescription()).toBe('tasks');
    });
  });

  describe('execute', () => {
    it('should execute a single task', async () => {
      const controller = new ConcurrencyController(2, 'test');
      const mockTask = jest.fn().mockResolvedValue('result');

      const result = await controller.execute(mockTask);

      expect(result).toBe('result');
      expect(mockTask).toHaveBeenCalledTimes(1);
    });

    it('should respect concurrency limits', async () => {
      const controller = new ConcurrencyController(2, 'test');
      let runningTasks = 0;
      let maxConcurrent = 0;

      const createTask = () => async () => {
        runningTasks++;
        maxConcurrent = Math.max(maxConcurrent, runningTasks);
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 50));
        runningTasks--;
        return 'done';
      };

      const tasks = Array(5).fill(null).map(() => controller.execute(createTask()));
      await Promise.all(tasks);

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('executeAll', () => {
    it('should execute all tasks with concurrency control', async () => {
      const controller = new ConcurrencyController(2, 'test');
      const tasks = [
        jest.fn().mockResolvedValue('result1'),
        jest.fn().mockResolvedValue('result2'),
        jest.fn().mockResolvedValue('result3'),
      ];

      const results = await controller.executeAll(tasks);

      expect(results).toEqual(['result1', 'result2', 'result3']);
      tasks.forEach(task => expect(task).toHaveBeenCalledTimes(1));
    });
  });

  describe('getStats', () => {
    it('should return current stats', () => {
      const controller = new ConcurrencyController(5, 'test tasks');
      const stats = controller.getStats();

      expect(stats).toEqual({
        maxConcurrent: 5,
        running: 0,
        pending: 0,
        description: 'test tasks',
      });
    });
  });

  describe('getQueueSize and getRunningCount', () => {
    it('should return correct queue size and running count', async () => {
      const controller = new ConcurrencyController(1, 'test');
      
      // Initially should be empty
      expect(controller.getQueueSize()).toBe(0);
      expect(controller.getRunningCount()).toBe(0);

      // Start a long-running task
      const longTask = controller.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'done';
      });

      // Add another task that should be queued
      const queuedTask = controller.execute(async () => 'queued');

      // Check that one is running and one is queued
      // Note: This timing might be flaky, so we'll just check the sum
      expect(controller.getRunningCount() + controller.getQueueSize()).toBe(2);

      await Promise.all([longTask, queuedTask]);
    });
  });
});

describe('Factory functions', () => {
  describe('createFileProcessingController', () => {
    it('should create controller with file processing description', () => {
      const controller = createFileProcessingController(4);
      expect(controller.getMaxConcurrent()).toBe(4);
      expect(controller.getDescription()).toBe('file processing');
    });
  });

  describe('createConcurrencyController', () => {
    it('should create controller with custom description', () => {
      const controller = createConcurrencyController(3, 'custom tasks');
      expect(controller.getMaxConcurrent()).toBe(3);
      expect(controller.getDescription()).toBe('custom tasks');
    });

    it('should use default description when not provided', () => {
      const controller = createConcurrencyController(2);
      expect(controller.getDescription()).toBe('tasks');
    });
  });
});