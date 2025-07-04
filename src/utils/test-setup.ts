import { afterEach } from '@jest/globals'; // Correctly import from @jest/globals
import { setLogLevel } from './logger';
import { jest } from '@jest/globals'; // Correctly import jest from @jest/globals

// Set log level to silent during tests to prevent excessive console output
setLogLevel('silent');

// Backup original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;
const originalConsoleDebug = console.debug;

// Mock console methods to prevent output during tests
console.log = jest.fn();
console.error = jest.fn();
console.warn = jest.fn();
console.info = jest.fn();
console.debug = jest.fn();

// Restore original console methods after each test suite
afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.info = originalConsoleInfo;
  console.debug = originalConsoleDebug;
});

// Extend Jest's expect matchers for custom assertions (e.g., JSDoc validation)
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidJSDoc(): R;
    }
  }
}

expect.extend({
  /**
   * Custom Jest matcher to validate JSDoc content.
   * Checks for presence of '@' and a reasonable length.
   * This is a basic check and can be enhanced for more rigorous validation.
   * @param received The string content of the JSDoc.
   * @returns Jest MatcherResult.
   */
  toBeValidJSDoc(received: string) {
    const pass =
      typeof received === 'string' &&
      received.includes('@') && // Must contain at least one JSDoc tag
      received.trim().length > 10; // Must have some substantial content

    if (pass) {
      return {
        message: () => `Expected "${received}" not to be valid JSDoc.`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `Expected "${received}" to be valid JSDoc content. It must be a string, contain '@', and have a length > 10.`,
        pass: false,
      };
    }
  },
});
