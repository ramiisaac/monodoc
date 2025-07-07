import { ConcurrencyManager, createConcurrencyManager } from '../ConcurrencyManager';

describe('ConcurrencyManager', () => {
  it('should create a ConcurrencyManager with default concurrency', () => {
    const manager = new ConcurrencyManager();
    expect(manager.getMaxConcurrency()).toBe(4);
  });

  it('should create a ConcurrencyManager with specified concurrency', () => {
    const manager = new ConcurrencyManager(10);
    expect(manager.getMaxConcurrency()).toBe(10);
  });

  it('should throw error for invalid concurrency', () => {
    expect(() => new ConcurrencyManager(0)).toThrow('maxConcurrency must be a positive number');
    expect(() => new ConcurrencyManager(-1)).toThrow('maxConcurrency must be a positive number');
  });

  it('should execute functions with concurrency control', async () => {
    const manager = new ConcurrencyManager(2);
    const results: number[] = [];
    
    const createTask = (value: number, delay: number) => async () => {
      await new Promise(resolve => setTimeout(resolve, delay));
      results.push(value);
      return value;
    };

    const promises = [
      manager.execute(createTask(1, 100)),
      manager.execute(createTask(2, 50)),
      manager.execute(createTask(3, 25)),
    ];

    await Promise.all(promises);
    expect(results).toEqual([2, 3, 1]); // Should complete in order of delay
  });

  it('should provide accurate pending and active counts', async () => {
    const manager = new ConcurrencyManager(1);
    
    const createTask = (delay: number) => async () => {
      await new Promise(resolve => setTimeout(resolve, delay));
    };

    const promise1 = manager.execute(createTask(100));
    const promise2 = manager.execute(createTask(50));
    
    // Allow some time for the first task to start
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(manager.getActiveCount()).toBe(1);
    expect(manager.getPendingCount()).toBe(1);
    
    await Promise.all([promise1, promise2]);
    
    expect(manager.getActiveCount()).toBe(0);
    expect(manager.getPendingCount()).toBe(0);
  });

  it('should create manager using factory function', () => {
    const manager = createConcurrencyManager(5);
    expect(manager.getMaxConcurrency()).toBe(5);
  });

  it('should provide access to underlying limiter', () => {
    const manager = new ConcurrencyManager(3);
    const limiter = manager.getLimiter();
    expect(typeof limiter).toBe('function');
  });
});