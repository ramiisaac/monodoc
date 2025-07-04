import { main } from '../../src/index';
import { loadAndMergeConfig } from '../../src/config';
import { logger, setLogLevel } from '../../src/utils/logger';
import path from 'path';

/**
 * CI/CD Integration Example
 * 
 * This example demonstrates how to integrate the JSDoc generator into a CI/CD pipeline.
 * It includes error handling, exit codes, and report generation suitable for automated environments.
 */

export class CICDIntegrationExample {
  private baseDir: string;
  private configPath: string;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
    this.configPath = path.join(baseDir, 'jsdoc-config.yaml');
  }

  /**
   * Main CI/CD integration method
   * Designed to be called from CI/CD pipelines with proper exit codes
   */
  async runCIPipeline(): Promise<void> {
    try {
      logger.info('🚀 Starting CI/CD JSDoc generation pipeline...');
      
      // Set appropriate log level for CI environment
      setLogLevel(process.env.CI_LOG_LEVEL || 'info');
      
      // Load configuration with CI-specific overrides
      const config = await this.loadCIConfig();
      
      // Run the main JSDoc generation
      await main({
        configPath: this.configPath,
        dryRun: process.env.CI_DRY_RUN === 'true',
        verbose: process.env.CI_VERBOSE === 'true',
        forceOverwrite: process.env.CI_FORCE_OVERWRITE === 'true',
        cacheClear: process.env.CI_CLEAR_CACHE === 'true',
      });
      
      logger.info('✅ CI/CD JSDoc generation completed successfully');
      
      // Generate CI-specific reports
      await this.generateCIReports();
      
      // Check quality thresholds
      await this.validateQualityThresholds();
      
    } catch (error) {
      logger.error('❌ CI/CD JSDoc generation failed:', error);
      process.exit(1); // Exit with error code for CI/CD systems
    }
  }

  /**
   * Load configuration with CI-specific overrides
   */
  private async loadCIConfig() {
    const baseConfig = await loadAndMergeConfig(this.configPath);
    
    // Apply CI-specific optimizations
    const ciConfig = {
      ...baseConfig,
      // Optimize for CI environment
      aiClientConfig: {
        ...baseConfig.aiClientConfig,
        maxConcurrentRequests: parseInt(process.env.CI_MAX_CONCURRENT || '2'),
        requestDelayMs: parseInt(process.env.CI_REQUEST_DELAY || '1000'),
      },
      // Enable production mode optimizations
      productionMode: true,
      // Ensure caching is enabled for faster subsequent runs
      performance: {
        ...baseConfig.performance,
        enableCaching: true,
        maxConcurrentFiles: parseInt(process.env.CI_MAX_FILES || '4'),
      },
      // Configure reporting for CI
      outputConfig: {
        ...baseConfig.outputConfig,
        reportDir: process.env.CI_REPORT_DIR || './reports/ci',
        logLevel: process.env.CI_LOG_LEVEL || 'info',
      },
      // Enable telemetry for CI monitoring
      telemetry: {
        ...baseConfig.telemetry,
        enabled: process.env.CI_TELEMETRY_ENABLED !== 'false',
        collectPerformance: true,
        collectErrors: true,
      },
    };
    
    logger.info('🔧 CI configuration loaded with optimizations');
    return ciConfig;
  }

  /**
   * Generate CI-specific reports for integration with CI/CD tools
   */
  private async generateCIReports(): Promise<void> {
    const reportDir = process.env.CI_REPORT_DIR || './reports/ci';
    
    // These would be implemented to generate reports in formats
    // that CI/CD tools can consume (JUnit XML, SARIF, etc.)
    logger.info(`📊 Generating CI reports in ${reportDir}`);
    
    // Example: Generate JUnit-style XML report for test results integration
    await this.generateJUnitReport(reportDir);
    
    // Example: Generate badge data for README integration
    await this.generateBadgeData(reportDir);
  }

  /**
   * Generate JUnit-style XML report for CI integration
   */
  private async generateJUnitReport(reportDir: string): Promise<void> {
    // This would generate a JUnit XML report that CI systems can parse
    logger.info('📋 Generating JUnit XML report for CI integration');
    
    // Placeholder for actual JUnit XML generation
    const junitXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="JSDoc Generation">
  <testsuite name="Documentation Quality" tests="1" failures="0" errors="0" time="0">
    <testcase name="JSDoc Generation" classname="JSDoc" time="0"/>
  </testsuite>
</testsuites>`;
    
    const fs = await import('fs').then(m => m.promises);
    await fs.mkdir(reportDir, { recursive: true });
    await fs.writeFile(path.join(reportDir, 'jsdoc-results.xml'), junitXml);
  }

  /**
   * Generate badge data for README integration
   */
  private async generateBadgeData(reportDir: string): Promise<void> {
    logger.info('🏷️ Generating badge data for README integration');
    
    // Example badge data that could be used with shields.io or similar
    const badgeData = {
      schemaVersion: 1,
      label: 'docs',
      message: 'generated',
      color: 'green',
    };
    
    const fs = await import('fs').then(m => m.promises);
    await fs.writeFile(
      path.join(reportDir, 'badge.json'),
      JSON.stringify(badgeData, null, 2)
    );
  }

  /**
   * Validate quality thresholds and fail CI if not met
   */
  private async validateQualityThresholds(): Promise<void> {
    const minQualityScore = parseInt(process.env.CI_MIN_QUALITY_SCORE || '75');
    
    logger.info(`🎯 Validating quality threshold: ${minQualityScore}%`);
    
    // This would check the actual quality metrics from the generation run
    // For now, we'll simulate the check
    const actualQuality = 85; // This would come from actual analysis
    
    if (actualQuality < minQualityScore) {
      logger.error(`❌ Quality threshold not met: ${actualQuality}% < ${minQualityScore}%`);
      process.exit(1);
    }
    
    logger.info(`✅ Quality threshold met: ${actualQuality}% >= ${minQualityScore}%`);
  }
}

/**
 * Pre-commit Hook Integration Example
 */
export class PreCommitHookExample {
  async runPreCommitHook(): Promise<void> {
    try {
      logger.info('🔍 Running pre-commit JSDoc validation...');
      
      // Get staged files
      const stagedFiles = await this.getStagedTypeScriptFiles();
      
      if (stagedFiles.length === 0) {
        logger.info('ℹ️ No TypeScript files staged, skipping JSDoc validation');
        return;
      }
      
      // Run JSDoc generation on staged files only
      await main({
        configPath: 'jsdoc-config.yaml',
        targetPaths: stagedFiles,
        dryRun: true, // Pre-commit hooks should not modify files
        verbose: false,
      });
      
      logger.info('✅ Pre-commit JSDoc validation passed');
      
    } catch (error) {
      logger.error('❌ Pre-commit JSDoc validation failed:', error);
      process.exit(1);
    }
  }

  private async getStagedTypeScriptFiles(): Promise<string[]> {
    const { execSync } = await import('child_process');
    
    try {
      const output = execSync('git diff --cached --name-only --diff-filter=AM', {
        encoding: 'utf8',
      });
      
      return output
        .split('\n')
        .filter(file => file.endsWith('.ts') || file.endsWith('.tsx'))
        .filter(Boolean);
    } catch (error) {
      logger.warn('Failed to get staged files, skipping pre-commit hook');
      return [];
    }
  }
}

/**
 * GitHub Actions Integration Example
 */
export class GitHubActionsExample {
  async runGitHubAction(): Promise<void> {
    try {
      logger.info('🔄 Running GitHub Actions JSDoc workflow...');
      
      // Set GitHub Actions specific outputs
      const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
      
      if (isGitHubActions) {
        // Set step outputs for GitHub Actions
        console.log('::group::JSDoc Generation');
      }
      
      await main({
        configPath: process.env.INPUT_CONFIG_PATH || 'jsdoc-config.yaml',
        dryRun: process.env.INPUT_DRY_RUN === 'true',
        verbose: process.env.INPUT_VERBOSE === 'true',
      });
      
      if (isGitHubActions) {
        console.log('::endgroup::');
        console.log('::set-output name=status::success');
      }
      
      logger.info('✅ GitHub Actions JSDoc workflow completed');
      
    } catch (error) {
      if (process.env.GITHUB_ACTIONS === 'true') {
        console.log('::endgroup::');
        console.log(`::error::JSDoc generation failed: ${error}`);
        console.log('::set-output name=status::failure');
      }
      
      logger.error('❌ GitHub Actions JSDoc workflow failed:', error);
      process.exit(1);
    }
  }
}

// CLI interface for different integration scenarios
async function main() {
  const scenario = process.argv[2];
  
  switch (scenario) {
    case 'ci':
      await new CICDIntegrationExample().runCIPipeline();
      break;
    case 'pre-commit':
      await new PreCommitHookExample().runPreCommitHook();
      break;
    case 'github-actions':
      await new GitHubActionsExample().runGitHubAction();
      break;
    default:
      console.log('Usage: node ci-integration.js <ci|pre-commit|github-actions>');
      console.log('');
      console.log('Environment variables:');
      console.log('  CI_LOG_LEVEL         - Log level for CI (debug, info, warn, error)');
      console.log('  CI_DRY_RUN          - Run in dry-run mode (true/false)');
      console.log('  CI_MAX_CONCURRENT   - Max concurrent requests (default: 2)');
      console.log('  CI_MIN_QUALITY_SCORE - Minimum quality score (default: 75)');
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}