import { Project } from 'ts-morph';
import path from 'path';
import { WorkspacePackage, FileBatch, GeneratorConfig, DetailedSymbolInfo } from '../types';
import { PackageDetector } from './PackageDetector';
import { FileBatcher } from './FileBatcher';
import { SymbolReferenceAnalyzer } from './SymbolReferenceAnalyzer';
import { logger } from '../utils/logger';
import { AnalysisError } from '../utils/errorHandling';

// No direct globby or path import needed here, they are used in sub-components

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
    // SymbolReferenceAnalyzer needs the project instance and base directory
    this.symbolReferenceAnalyzer = new SymbolReferenceAnalyzer(this.project, process.cwd());
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

    // Use globby (via FileBatcher's internal logic) to find files based on patterns within the package directory
    // This is a more robust way to discover files than manually reading dirs if patterns are complex.
    // The FileBatcher's collectFiles method already handles globbing and filtering.
    // For workspace analyzer, we just need to add them to the project.
    // We can reuse the logic from FileBatcher to get the list of files first,
    // or provide the patterns directly to project.addSourceFilesAtPaths.

    // For this context, assuming files are added broadly and then filtered by ts-morph's internal resolution or subsequent steps.
    // A more precise approach would be to pass the include/exclude filters directly to Project.addSourceFilesAtPaths if possible,
    // or manually filter before calling addSourceFileAtPath.
    // Given the `FileBatcher` already does robust file collection, we can leverage it conceptually
    // or just assume `project.addSourceFilesByPaths` with globs and `ignoreFilePatterns` (if available).

    // Corrected way to add files that are relevant:
    const filesToConsider = await this.fileBatcher['collectFiles'](
      [pkg],
      {
        includePatterns: includePatterns,
        ignorePatterns: ignorePatterns,
        workspaceDirs: [pkg.path], // Only consider current package's path
        aiClientConfig: {} as any, // Corrected `any` usage
        embeddingConfig: {} as any, // Corrected `any` usage
        jsdocConfig: {} as any, // Corrected `any` usage
        outputConfig: {} as any, // Corrected `any` usage
        dryRun: false,
        forceOverwrite: false,
        noMergeExisting: false,
        disableEmbeddings: false,
        aiModels: [],
        targetPaths: [],
        productionMode: false,
        performance: undefined,
        telemetry: undefined,
        watchMode: undefined,
        qualityThresholds: undefined,
        plugins: [],
      },
      pkg.path,
    ); // Use pkg.path as baseDir for file collection in that package.

    for (const fileInfo of filesToConsider) {
      const filePath = fileInfo.path;
      if (!this.project.getSourceFile(filePath)) {
        try {
          this.project.addSourceFileAtPath(filePath);
          addedFilesCount++;
        } catch (e) {
          logger.debug(
            `  Failed to add source file ${path.relative(
              baseDir,
              filePath,
            )} to project: ${e instanceof Error ? e.message : String(e)}`,
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
