import { Project, SourceFile } from 'ts-morph';
import { WorkspacePackage, FileBatch, GeneratorConfig, DetailedSymbolInfo } from '../types';
import { PackageDetector } from './PackageDetector';
import { FileBatcher } from './FileBatcher';
import { SymbolReferenceAnalyzer } from './SymbolReferenceAnalyzer';
import { logger } from '../utils/logger';
import { AnalysisError } from '../utils/errorHandling';
import globby from 'globby';
import path from 'path';

/**
 * Orchestrates the analysis of a TypeScript monorepo workspace.
 * It detects packages, collects source files, organizes them into batches,
 * and analyzes symbol references for cross-file understanding.
 */
export class WorkspaceAnalyzer {
  private packageDetector: PackageDetector;
  private fileBatcher: FileBatcher;
  private symbolReferenceAnalyzer: SymbolReferenceAnalyzer;
  private project: Project; // The ts-morph project instance to populate and analyze

  constructor(project: Project) {
    this.project = project;
    this.packageDetector = new PackageDetector();
    this.fileBatcher = new FileBatcher();
    this.symbolReferenceAnalyzer = new SymbolReferenceAnalyzer(project, process.cwd()); // Initialized with baseDir
  }

  /**
   * Adds source files to the ts-morph project for a given package,
   * respecting include and ignore patterns.
   * @param pkg The workspace package to add files from.
   * @param baseDir The base directory of the monorepo.
   * @param includePatterns Patterns for files to include.
   * @param ignorePatterns Patterns for files to ignore.
   * @returns The count of files successfully added to the project.
   */
  private async addPackageSourceFiles(
    pkg: WorkspacePackage,
    baseDir: string,
    includePatterns: string[],
    ignorePatterns: string[],
  ): Promise<number> {
    let addedFilesCount = 0;

    // Add tsconfig.json if it exists and is relevant to the project structure
    if (pkg.tsConfigPath) {
      try {
        // ts-morph can load files from tsconfig, but we need to ensure all files are added explicitly for analysis.
        // It's safer to add explicit globs.
        // this.project.addSourceFileAtPath(pkg.tsConfigPath); // Already handled by project constructor potentially
        logger.trace(`  Considering tsconfig: ${path.relative(baseDir, pkg.tsConfigPath)}`);
      } catch (e) {
        logger.warn(
          `  Could not process tsconfig for package ${pkg.name} at ${path.relative(baseDir, pkg.tsConfigPath)}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // Use globby to find files based on patterns within the package directory
    const filesToInclude = await globby(includePatterns, {
      cwd: pkg.path, // Search relative to package path
      absolute: true, // Get absolute paths
      ignore: ignorePatterns,
      dot: true,
    });

    for (const filePath of filesToInclude) {
      // Only add if not already added to avoid duplicates in the project instance
      if (!this.project.getSourceFile(filePath)) {
        try {
          this.project.addSourceFileAtPath(filePath);
          addedFilesCount++;
        } catch (e) {
          logger.debug(
            `  Failed to add source file ${path.relative(baseDir, filePath)} to project: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
    return addedFilesCount;
  }

  /**
   * Builds the ts-morph program. This resolves symbol and type information
   * across all added source files.
   * @throws AnalysisError if program building fails.
   */
  private async buildProject(): Promise<void> {
    logger.info('⏳ Building ts-morph program for comprehensive type and symbol resolution...');
    try {
      this.project.resolveSourceFileDependencies(); // This resolves all dependencies and types
      logger.success('✅ ts-morph program built successfully.');
    } catch (e) {
      throw new AnalysisError(
        `Failed to build ts-morph program. This might indicate issues with your tsconfig files or circular dependencies: ${e instanceof Error ? e.message : String(e)}`,
        e,
      );
    }
  }

  /**
   * Performs the complete workspace analysis workflow.
   * @param config The generator configuration.
   * @param baseDir The base directory of the monorepo.
   * @returns A Promise resolving to an object containing discovered packages, file batches, and symbol map.
   * @throws AnalysisError if any part of the analysis fails.
   */
  async analyze(
    config: GeneratorConfig,
    baseDir: string,
  ): Promise<{
    packages: WorkspacePackage[];
    batches: FileBatch[];
    symbolMap: Map<string, DetailedSymbolInfo>;
  }> {
    // 1. Discover packages
    const packages = await this.packageDetector.discoverPackages(config.workspaceDirs, baseDir);
    if (packages.length === 0) {
      logger.warn(
        'No packages found to analyze in the configured workspace directories. Please check your `workspaceDirs` configuration.',
      );
      return { packages: [], batches: [], symbolMap: new Map() };
    }

    // 2. Add source files to ts-morph project
    logger.info('🏗️  Adding source files to ts-morph project for full analysis...');
    let totalFilesAdded = 0;
    for (const pkg of packages) {
      totalFilesAdded += await this.addPackageSourceFiles(
        pkg,
        baseDir,
        config.includePatterns, // Use global include/ignore patterns for file discovery
        config.ignorePatterns,
      );
    }
    logger.success(`✅ Added ${totalFilesAdded} source files to ts-morph project.`);

    // 3. Build the ts-morph program (resolve types, symbols)
    await this.buildProject();

    // 4. Create file batches (after files are added and sorted by priority)
    // Pass the actual project to FileBatcher so it can get up-to-date source files if needed.
    const batches = await this.fileBatcher.createBatches(packages, config, baseDir);

    // 5. Analyze symbol references across the entire project
    const symbolMap = await this.symbolReferenceAnalyzer.analyzeSymbols();

    return { packages, batches, symbolMap };
  }
}
