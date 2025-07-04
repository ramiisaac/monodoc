import chalk from 'chalk';

/**
 * Provides static methods to display various help messages and formatted output
 * for the command-line interface.
 */
export class HelpSystem {
  /**
   * Placeholder for custom help registration. With Commander.js,
   * help is largely generated automatically from command/option definitions.
   */
  static registerCustomHelp(): void {
    // No custom help registration needed with commander's new API for subcommands
    // Commander handles -h, --help automatically based on defined commands and options.
    // The individual show* methods are still useful for direct calls from logic.
  }

  /**
   * Displays a quick start guide for new users.
   */
  static showQuickStart(): void {
    const banner = `
${chalk.bold.blue('╔══════════════════════════════════════════════════════════════╗')}
${chalk.bold.blue('║')}                    ${chalk.bold.white('🚀 Quick Start Guide')}                   ${chalk.bold.blue('║')}
${chalk.bold.blue('╚══════════════════════════════════════════════════════════════╝')}
`;
    console.log(banner);
    console.log(chalk.bold.yellow('Step 1: Basic Setup'));
    console.log('  Run the interactive setup wizard:');
    console.log(`  ${chalk.cyan('monodoc setup')}\n`); // Updated command
    console.log(chalk.bold.yellow('Step 2: Configure API Key'));
    console.log('  Set your OpenAI API key (or other provider) as an environment variable:');
    console.log(`  ${chalk.cyan('export OPENAI_API_KEY="sk-..."')}\n`); // Emphasize environment variable
    console.log(
      `  Or save it via CLI for convenience: ${chalk.cyan('monodoc --api-key sk-... --save-api-key global')}\n`,
    );
    console.log(chalk.bold.yellow('Step 3: Preview Changes'));
    console.log('  See what would be generated (dry run):');
    console.log(`  ${chalk.cyan('monodoc generate --dry-run --verbose')}\n`); // Updated command
    console.log(chalk.bold.yellow('Step 4: Generate Documentation'));
    console.log('  Run the generation process:');
    console.log(`  ${chalk.cyan('monodoc generate')}\n`); // Updated command
    console.log(
      chalk.bold.green("✅ You're ready to go! Run with `monodoc --help` for all options."),
    );
    console.log(this.getQuickExamples());
  }

  /**
   * Displays a troubleshooting guide with common issues and solutions.
   */
  static showTroubleshooting(): void {
    const banner = `
${chalk.bold.red('╔══════════════════════════════════════════════════════════════╗')}
${chalk.bold.red('║')}                 ${chalk.bold.white('🔧 Troubleshooting Guide')}                  ${chalk.bold.red('║')}
${chalk.bold.red('╚══════════════════════════════════════════════════════════════╝')}
`;
    console.log(banner);
    console.log(chalk.bold.yellow('Common Issues & Solutions:\n'));
    console.log(chalk.bold.red('❌ API Key Issues'));
    console.log('  • Check environment variables: OPENAI_API_KEY, GOOGLE_API_KEY, etc.');
    console.log('  • Verify API key format and permissions');
    console.log(`  • List saved keys: ${chalk.cyan('monodoc info --list-credentials')}\n`); // Updated command
    console.log(chalk.bold.red('❌ Configuration Errors'));
    console.log('  • Validate config file syntax (YAML/JSON)');
    console.log(`  • Run validation: ${chalk.cyan('monodoc validate-config')}`); // Updated command
    console.log('  • Check workspace directory paths\n');
    console.log(chalk.bold.red('❌ TypeScript Issues'));
    console.log('  • Ensure tsconfig.json exists and is valid');
    console.log('  • Check include/exclude patterns');
    console.log('  • Verify file permissions\n');
    console.log(chalk.bold.red('❌ Performance Issues'));
    console.log('  • Reduce `maxConcurrentRequests` in configuration (`aiClientConfig`)');
    console.log('  • Enable caching for faster subsequent runs (`performance.enableCaching`)');
    console.log(`  • Use incremental mode: ${chalk.cyan('monodoc incremental')}\n`); // Updated command
    console.log(chalk.bold.green('💡 Need more help? Check the documentation or open an issue.'));
  }

  /**
   * Provides quick usage examples for common CLI commands.
   * @returns A formatted string of quick examples.
   */
  private static getQuickExamples(): string {
    return `
${chalk.bold.magenta('Quick Examples:')}
${chalk.cyan('monodoc generate --model gpt-4o --dry-run')} ${chalk.gray('Preview with GPT-4o')}
${chalk.cyan('monodoc watch --incremental')}                 ${chalk.gray('Watch mode with incremental updates')}
${chalk.cyan('monodoc generate "src/**/*.ts"')}             ${chalk.gray('Target specific files/patterns')}
${chalk.cyan('monodoc quality-check')}                       ${chalk.gray('Analyze documentation quality')}
`;
  }

  /**
   * Displays the result of configuration validation, highlighting errors and warnings.
   * @param errors A list of error messages.
   * @param warnings A list of warning messages.
   */
  static showConfigValidation(errors: string[], warnings: string[]): void {
    const banner = `
${chalk.bold.cyan('╔══════════════════════════════════════════════════════════════╗')}
${chalk.bold.cyan('║')}                ${chalk.bold.white('📋 Configuration Validation')}               ${chalk.bold.cyan('║')}
${chalk.bold.cyan('╚══════════════════════════════════════════════════════════════╝')}
`;
    console.log(banner);
    if (errors.length > 0) {
      console.log(`${chalk.red('❌ Configuration Errors:')}`);
      errors.forEach((error) => {
        console.log(`  ${chalk.red('•')} ${error}`);
      });
    }
    if (warnings.length > 0) {
      console.log(`${chalk.yellow('⚠️ Configuration Warnings:')}`);
      warnings.forEach((warning) => {
        console.log(`  ${chalk.yellow('•')} ${warning}`);
      });
    }
    if (errors.length === 0 && warnings.length === 0) {
      console.log(`${chalk.green('✅ Configuration is valid!')}`);
    }
  }

  /**
   * Displays a summary of performance metrics after a generation run.
   * @param metrics An object containing performance statistics.
   */
  static showPerformanceMetrics(metrics: {
    totalFiles: number;
    processedFiles: number;
    generationTime: number;
    apiCalls: number;
    cacheHits: number;
  }): void {
    const banner = `
${chalk.bold.green('╔══════════════════════════════════════════════════════════════╗')}
${chalk.bold.green('║')}                  ${chalk.bold.white('📊 Performance Metrics')}                  ${chalk.bold.green('║')}
${chalk.bold.green('╚══════════════════════════════════════════════════════════════╝')}
`;
    console.log(banner);
    console.log(
      `${chalk.bold('Files Processed:')} ${metrics.processedFiles}/${metrics.totalFiles}`,
    );
    console.log(`${chalk.bold('Total Time:')} ${metrics.generationTime.toFixed(2)}s`);
    console.log(`${chalk.bold('AI API Calls:')} ${metrics.apiCalls} requests`);
    console.log(`${chalk.bold('Cache Hits:')} ${metrics.cacheHits} hits`);

    const throughput =
      metrics.generationTime > 0 ? metrics.processedFiles / metrics.generationTime : 0;
    console.log(`${chalk.bold('Throughput:')} ${throughput.toFixed(2)} files/second`);

    if (metrics.apiCalls > 0) {
      const cacheRate = (metrics.cacheHits / metrics.apiCalls) * 100;
      console.log(`${chalk.bold('Cache Rate:')} ${cacheRate.toFixed(1)}%`);
    } else {
      console.log(`${chalk.bold('Cache Rate:')} N/A (no API calls made)`);
    }
  }

  /**
   * Displays a completion message after a successful generation run.
   * @param stats An object containing summary statistics.
   */
  static showCompletion(stats: {
    filesProcessed: number;
    documentsGenerated: number;
    timeElapsed: number;
  }): void {
    const banner = `
${chalk.bold.green('╔══════════════════════════════════════════════════════════════╗')}
${chalk.bold.green('║')}                     ${chalk.bold.white('🎉 Generation Complete!')}                ${chalk.bold.green('║')}
${chalk.bold.green('╚══════════════════════════════════════════════════════════════╝')}
`;
    console.log(banner);
    console.log(
      `${chalk.green('✅')} Successfully processed ${chalk.bold(stats.filesProcessed.toString())} files`,
    );
    console.log(
      `${chalk.green('📝')} Generated ${chalk.bold(stats.documentsGenerated.toString())} JSDoc comments`,
    );
    console.log(`${chalk.green('⏱️')} Completed in ${chalk.bold(stats.timeElapsed.toFixed(2))}s`);
    console.log(`\n${chalk.gray('Reports saved to the configured output directory.')}`);
  }
}
