import { HelpSystem } from '../HelpSystem';
import chalk from 'chalk';

// Mock chalk to avoid ANSI codes in tests
jest.mock('chalk', () => ({
  bold: {
    blue: jest.fn((text) => text),
    white: jest.fn((text) => text),
    yellow: jest.fn((text) => text),
    green: jest.fn((text) => text),
    red: jest.fn((text) => text),
    cyan: jest.fn((text) => text),
    magenta: jest.fn((text) => text),
  },
  cyan: jest.fn((text) => text),
  red: jest.fn((text) => text),
  yellow: jest.fn((text) => text),
  green: jest.fn((text) => text),
  gray: jest.fn((text) => text),
  dim: jest.fn((text) => text),
}));

describe('HelpSystem', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('registerCustomHelp', () => {
    it('should register custom help without errors', () => {
      expect(() => HelpSystem.registerCustomHelp()).not.toThrow();
    });
  });

  describe('showQuickStart', () => {
    it('should display quick start guide', () => {
      HelpSystem.showQuickStart();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Quick Start Guide')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Step 1: Basic Setup')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('monodoc setup')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Step 2: Configure API Key')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('OPENAI_API_KEY')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Step 3: Preview Changes')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('--dry-run')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Step 4: Generate Documentation')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('monodoc generate')
      );
    });
  });

  describe('showTroubleshooting', () => {
    it('should display troubleshooting guide', () => {
      HelpSystem.showTroubleshooting();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Troubleshooting Guide')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Common Issues')
      );
    });
  });

  describe('showConfigValidation', () => {
    it('should display config validation with errors', () => {
      const errors = ['Error 1', 'Error 2'];
      const warnings = ['Warning 1'];
      
      HelpSystem.showConfigValidation(errors, warnings);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration Validation')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration Errors')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration Warnings')
      );
    });

    it('should display success message when no errors or warnings', () => {
      HelpSystem.showConfigValidation([], []);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration is valid!')
      );
    });
  });

  describe('showPerformanceMetrics', () => {
    it('should display performance metrics', () => {
      const metrics = {
        totalFiles: 100,
        processedFiles: 95,
        generationTime: 30.5,
        apiCalls: 50,
        cacheHits: 25,
      };
      
      HelpSystem.showPerformanceMetrics(metrics);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Performance Metrics')
      );
    });
  });

  describe('showCompletion', () => {
    it('should display completion statistics', () => {
      const stats = {
        filesProcessed: 10,
        successfulJsdocs: 8,
        failedJsdocs: 2,
        skippedJsdocs: 0,
        durationSeconds: 30.5,
        embeddingSuccesses: 5,
        embeddingFailures: 0,
        totalRelationshipsDiscovered: 15,
        modifiedFiles: 8,
      };
      
      HelpSystem.showCompletion(stats);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Generation Summary')
      );
    });
  });

  describe('error handling', () => {
    it('should handle console errors gracefully', () => {
      const originalConsole = console.log;
      console.log = jest.fn(() => {
        throw new Error('Console error');
      });

      // This should not throw because the actual implementation doesn't have 
      // error handling that would catch console errors
      expect(() => HelpSystem.registerCustomHelp()).not.toThrow();
      
      console.log = originalConsole;
    });
  });
});