/**
 * Integration test to verify that ConcurrencyController works correctly
 * in place of the previous p-limit duplicated patterns.
 */

import { ConcurrencyController, createFileProcessingController } from '../ConcurrencyController';

describe('ConcurrencyController Integration', () => {
  it('should work as a drop-in replacement for p-limit patterns', async () => {
    // This test simulates the pattern that was used in both
    // GenerateDocumentationOperation and JSDocGenerator
    const maxConcurrentFiles = 4;
    const concurrencyController = createFileProcessingController(maxConcurrentFiles);

    // Simulate file processing tasks like those in the replaced code
    const filePaths = ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts', 'file5.ts'];
    const processedFiles: string[] = [];
    let maxConcurrent = 0;
    let currentRunning = 0;

    const fileProcessingPromises: Promise<void>[] = [];

    for (const filePath of filePaths) {
      fileProcessingPromises.push(
        concurrencyController.execute(async () => {
          currentRunning++;
          maxConcurrent = Math.max(maxConcurrent, currentRunning);
          
          // Simulate file processing
          await new Promise(resolve => setTimeout(resolve, 50));
          processedFiles.push(filePath);
          
          currentRunning--;
        }),
      );
    }

    await Promise.all(fileProcessingPromises);

    // Verify all files were processed
    expect(processedFiles).toHaveLength(5);
    expect(processedFiles.sort()).toEqual(filePaths.sort());
    
    // Verify concurrency was respected
    expect(maxConcurrent).toBeLessThanOrEqual(maxConcurrentFiles);
    expect(maxConcurrent).toBeGreaterThan(0);
  });

  it('should provide the same interface as the replaced p-limit pattern', () => {
    const controller = createFileProcessingController(4);
    
    // Verify it has the same methods that were being used
    expect(typeof controller.execute).toBe('function');
    expect(typeof controller.getStats).toBe('function');
    expect(typeof controller.getMaxConcurrent).toBe('function');
    
    // Verify the configuration matches what was used before
    expect(controller.getMaxConcurrent()).toBe(4);
    expect(controller.getDescription()).toBe('file processing');
  });

  it('should handle errors in tasks without breaking concurrency control', async () => {
    const controller = createFileProcessingController(2);
    const results: (string | Error)[] = [];

    const tasks = [
      () => Promise.resolve('success1'),
      () => Promise.reject(new Error('failure')),
      () => Promise.resolve('success2'),
    ];

    const promises = tasks.map((task, index) =>
      controller.execute(task)
        .then(result => {
          results[index] = result;
        })
        .catch(error => {
          results[index] = error;
        })
    );

    await Promise.all(promises);

    expect(results[0]).toBe('success1');
    expect(results[1]).toBeInstanceOf(Error);
    expect(results[2]).toBe('success2');
  });
});