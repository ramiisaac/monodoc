import path from "path";
import fs from "fs/promises";
import { logger } from "../utils/logger";
import { WorkspacePackage } from "../types";
import { AnalysisError } from "../utils/errorHandling";
import { pathExists, readJsonFile } from "../utils/fileUtils";

/**
 * Represents a simplified `package.json` structure for detection purposes.
 */
interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  main?: string;
  types?: string;
  typings?: string;
  // Add workspaces field for monorepo root package.json if needed for recursive discovery
  workspaces?: string[];
}

/**
 * Discovers and identifies workspace packages within a monorepo structure.
 * It scans specified directories for `package.json` and `tsconfig.json` files.
 */
export class PackageDetector {
  /**
   * Discovers workspace packages based on a list of potential workspace directories.
   * It looks for subdirectories containing a `package.json` file.
   * @param workspaceDirs An array of directory names (relative to baseDir) to search within (e.g., ['packages', 'apps']).
   * @param baseDir The base directory of the monorepo.
   * @returns A Promise resolving to an array of discovered WorkspacePackage objects.
   * @throws AnalysisError if reading workspace directories fails.
   */
  async discoverPackages(
    workspaceDirs: string[],
    baseDir: string,
  ): Promise<WorkspacePackage[]> {
    logger.info("🔍 Discovering workspace packages...");
    const packages: WorkspacePackage[] = [];

    // Check the base directory itself for a package.json (root package)
    const rootPackageJsonPath = path.join(baseDir, "package.json");
    if (await pathExists(rootPackageJsonPath)) {
      try {
        const rootPackageJson = (await readJsonFile(
          rootPackageJsonPath,
        )) as PackageJson;
        if (rootPackageJson?.name) {
          const hasTsConfig = await pathExists(
            path.join(baseDir, "tsconfig.json"),
          );
          packages.push({
            name: rootPackageJson.name,
            path: baseDir,
            type: "root", // Custom type for the monorepo root
            priority: this.calculatePackagePriority(
              rootPackageJson,
              "root",
              hasTsConfig,
            ),
          });
          logger.success(
            `  ✓ Found: ${rootPackageJson.name} (Type: root${hasTsConfig ? ", TS" : ""}, Path: ${path.relative(baseDir, baseDir)})`,
          );
        }
      } catch (err) {
        logger.warn(
          `  Error processing root package.json: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    for (const dir of workspaceDirs) {
      const dirPath = path.join(baseDir, dir);
      if (!(await pathExists(dirPath))) {
        logger.debug(
          `  Workspace directory '${dir}' not found at ${dirPath}. Skipping.`,
        );
        continue;
      }

      try {
        const subdirs = await fs.readdir(dirPath, { withFileTypes: true });
        for (const subdir of subdirs) {
          if (subdir.isDirectory()) {
            const packagePath = path.join(dirPath, subdir.name);
            const packageJsonPath = path.join(packagePath, "package.json");
            const tsConfigPath = path.join(packagePath, "tsconfig.json");

            if (!(await pathExists(packageJsonPath))) {
              logger.trace(
                `  Skipping ${path.join(dir, subdir.name)}: Missing package.json.`,
              );
              continue;
            }

            try {
              const packageJson = (await readJsonFile(
                packageJsonPath,
              )) as PackageJson;
              if (!packageJson) {
                logger.warn(
                  `  Could not parse package.json for ${path.join(dir, subdir.name)}. Skipping.`,
                );
                continue;
              }

              const hasTsConfig = await pathExists(tsConfigPath);
              const pkg: WorkspacePackage = {
                name: packageJson.name || subdir.name, // Use package.json name or directory name as fallback
                path: packagePath,
                type: dir, // Type derived from the workspace directory name (e.g., 'packages', 'apps')
                priority: this.calculatePackagePriority(
                  packageJson,
                  dir,
                  hasTsConfig,
                ),
              };
              packages.push(pkg);
              logger.success(
                `  ✓ Found: ${packageJson.name || subdir.name} (Type: ${dir}${hasTsConfig ? ", TS" : ""}, Path: ${path.relative(baseDir, packagePath)})`,
              );
            } catch (err) {
              logger.error(
                `  Error processing package ${path.join(dir, subdir.name)}: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        }
      } catch (error) {
        throw new AnalysisError(
          `Could not read workspace directory '${dirPath}': ${error instanceof Error ? error.message : String(error)}`,
          error,
        );
      }
    }

    // Sort packages by priority so more important packages are analyzed earlier
    packages.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    logger.info(`📦 Discovered ${packages.length} packages`);
    return packages;
  }

  /**
   * Calculates a priority score for a discovered package.
   * Higher priority packages are typically more central to the monorepo (e.g., core libraries, shared services).
   * @param packageJson The parsed `package.json` content.
   * @param type The type of package (derived from its parent directory, e.g., 'packages', 'apps').
   * @param hasTsConfig Whether the package has a `tsconfig.json`.
   * @returns The calculated priority score.
   */
  private calculatePackagePriority(
    packageJson: PackageJson,
    type: string,
    hasTsConfig: boolean,
  ): number {
    let priority = 0;

    // Base priority based on package type/location
    switch (type.toLowerCase()) {
      case "root":
        priority += 200; // Monorepo root is very important
        break;
      case "packages":
        priority += 100; // Common libraries, reusable components
        break;
      case "services":
        priority += 80; // Backend services, APIs
        break;
      case "apps":
        priority += 60; // Frontend applications
        break;
      case "libs": // Could be interchangeable with 'packages'
        priority += 90;
        break;
      case "tools":
        priority += 40; // Build tools, CLI utilities
        break;
      default:
        priority += 10;
        break;
    }

    // Boost priority for packages with common "core" or "shared" names
    if (
      packageJson.name &&
      (packageJson.name.includes("core") ||
        packageJson.name.includes("shared") ||
        packageJson.name.includes("common") ||
        packageJson.name.includes("util"))
    ) {
      priority += 50;
    }

    // Add priority based on number of dependencies (indicates centrality/complexity)
    const depCount =
      Object.keys(packageJson.dependencies || {}).length +
      Object.keys(packageJson.devDependencies || {}).length;
    priority += Math.min(depCount * 0.5, 30); // Cap the dependency boost

    // Boost for TypeScript projects
    if (
      hasTsConfig ||
      packageJson.devDependencies?.typescript ||
      packageJson.dependencies?.typescript
    ) {
      priority += 5;
    }

    return priority;
  }
}
