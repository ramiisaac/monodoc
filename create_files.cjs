/**
 * @file create_files.cjs
 * @description This script reads a markdown file, extracts code blocks with a specified format (```lang:path/to/file),
 * and creates or updates files on the filesystem based on the content of these blocks.
 * It supports dry run mode, verbose logging, silent mode, and handling of duplicate file paths.
 *
 * Usage:
 * node create_files.cjs [options]
 *
 * Options:
 *   --file <string>      Input markdown file (default: seed.md)
 *   --dry-run            Simulate file operations without modifying filesystem
 *   --verbose            Enable verbose logging with detailed error traces
 *   --silent             Suppress per-file logging, show only summary and errors
 *   --latest-only        Only create the latest version of duplicate files, skip creating .1, .2, etc. indexed versions
 *
 * Examples:
 *   node create_files.cjs --file my_notes.md
 *   node create_files.cjs --dry-run --verbose
 *   node create_files.cjs --silent --latest-only
 */

const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const readline = require('readline');

// Parse command-line arguments
const argv = yargs(hideBin(process.argv))
  .option('file', {
    type: 'string',
    default: 'seed.md',
    description: 'Input markdown file',
  })
  .option('dry-run', {
    type: 'boolean',
    description: 'Simulate file operations without modifying filesystem',
  })
  .option('verbose', {
    type: 'boolean',
    description: 'Enable verbose logging with detailed error traces',
  })
  .option('silent', {
    type: 'boolean',
    description: 'Suppress per-file logging, show only summary and errors',
  })
  .option('latest-only', {
    type: 'boolean',
    description:
      'Only create the latest version of duplicate files, skip creating .1, .2, etc. indexed versions',
  }).argv;

const isDryRun = argv.dryRun;
const filename = argv.file;
const verbose = argv.verbose;
const silent = argv.silent;
const latestOnly = argv.latestOnly;

// Initialize stats
let filesProcessedCount = 0;
let filesCreatedCount = 0;
let filesOverwrittenCount = 0;
let filesSkippedCount = 0;
const directoriesCreated = new Set();
const fileTypesCount = {};
let dryRunFilesToCreate = 0;
let dryRunFilesToOverwrite = 0;
let dryRunFilesToSkip = 0;
const dryRunDirectoriesToCreate = new Set();
const dryRunFileTypesCount = {};
let totalLinesAdded = 0;
let totalLinesRemoved = 0;
let totalCodeBlocks = 0;
let skippedCodeBlocks = 0;
let skippedDuplicates = 0;

// Duplicate detection
const seedBlocksByPath = {};
let blockPosition = 0;
let repeatedPathCount = 0;
let identicalContentCount = 0;
let differingContentCount = 0;
let totalLinesDiffInDuplicates = 0;
const duplicateDetails = [];
const overwriteDetails = [];

// Path validation regex
const invalidPathChars = /[<>:"|?*\0]/;

// Utility to compute line differences
function computeLineDiff(oldContent, newContent) {
  const oldLines = oldContent.split('\n').filter(line => line.trim());
  const newLines = newContent.split('\n').filter(line => line.trim());
  let added = 0;
  let removed = 0;

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  for (const line of newLines) {
    if (!oldSet.has(line)) added++;
  }
  for (const line of oldLines) {
    if (!newSet.has(line)) removed++;
  }

  return { added, removed };
}

// Format numbers for table alignment
function formatNumber(num) {
  return Number.isFinite(num) ? num.toLocaleString() : '-';
}

// Generate indexed filename
function getIndexedFilename(filePath, index) {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const dir = path.dirname(filePath);
  return path.join(dir, `${base}.${index}${ext}`);
}

// Print header
console.log('='.repeat(80));
console.log(' File Creation Script '.padStart(40 + 22, ' ').padEnd(80, '='));
console.log('='.repeat(80));
console.log(
  `Mode: ${isDryRun ? 'Dry Run (No Filesystem Changes)' : 'Actual File Creation/Update'}`
);
console.log(`Input File: ${filename}`);
console.log(
  `Silent Mode: ${silent ? 'Enabled (Per-file logs suppressed)' : 'Disabled'}`
);
console.log(`Verbose Mode: ${verbose ? 'Enabled' : 'Disabled'}`);
console.log(
  `Latest Only Mode: ${latestOnly ? 'Enabled (Skip .1, .2, etc. versions)' : 'Disabled (Create all versions)'}`
);
console.log('-'.repeat(80));

async function processFile() {
  const startTime = Date.now();
  if (!fs.existsSync(filename)) {
    throw new Error(`Input file ${filename} does not exist.`);
  }
  const stream = fs.createReadStream(filename, 'utf8');
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let currentLine = 0;
  let blockLines = [];
  let inCodeBlock = false;
  let blockPath = '';
  let blockStartLine = 0;

  for await (let line of rl) {
    currentLine++;
    line = line.trimEnd();
    if (currentLine % 10000 === 0) {
      console.log(
        `[PROGRESS] Processed ${currentLine.toLocaleString()} lines (${((Date.now() - startTime) / 1000).toFixed(3)}s)`
      );
    }

    const codeBlockStartMatch = line.match(
      /^`{3,}(?:[\w-]*)\s*:\s*([^\s][^\n]*)$/
    );
    if (!inCodeBlock && codeBlockStartMatch) {
      blockPath = codeBlockStartMatch[1].trim();
      inCodeBlock = true;
      blockStartLine = currentLine;
      blockLines = [];
      totalCodeBlocks++;
      continue;
    }

    if (inCodeBlock) {
      if (line.startsWith('```')) {
        inCodeBlock = false;
        blockPosition++;
        await processBlock(blockPath, blockLines.join('\n'), blockStartLine);
      } else {
        blockLines.push(line);
      }
    }
  }

  if (inCodeBlock) {
    console.error(
      `[ERROR] Unclosed code block starting at line ${blockStartLine.toLocaleString()}`
    );
    skippedCodeBlocks++;
  }
}

async function processBlock(filePath, code, startLine) {
  if (!filePath) {
    console.error(
      `[ERROR] Code block at line ${startLine.toLocaleString()} has no file path. Skipping.`
    );
    skippedCodeBlocks++;
    return;
  }

  if (filePath === 'tree') {
    if (!silent)
      console.log(
        `[INFO] Skipping 'tree' diagram block at line ${startLine.toLocaleString()}.`
      );
    skippedCodeBlocks++;
    return;
  }

  if (filePath.startsWith('/')) {
    filePath = filePath.substring(1);
  }

  const safePath = path.normalize(filePath);
  if (
    safePath.startsWith('..') ||
    path.isAbsolute(safePath) ||
    invalidPathChars.test(safePath)
  ) {
    console.error(
      `[ERROR] Unsafe or invalid file path at line ${startLine.toLocaleString()}: ${safePath}. Skipping.`
    );
    skippedCodeBlocks++;
    return;
  }

  const newCodeContent = code.trim();
  if (!newCodeContent) {
    console.error(
      `[ERROR] Empty code block at line ${startLine.toLocaleString()} for path ${safePath}. Skipping.`
    );
    skippedCodeBlocks++;
    return;
  }

  filesProcessedCount++;
  if (!silent)
    console.log(
      `[PROCESS] Processing code block at line ${startLine.toLocaleString()} for file: ${safePath}`
    );

  // Store for duplicate detection
  const blockInfo = {
    content: newCodeContent + '\n',
    position: blockPosition,
    line: startLine,
  };
  if (!seedBlocksByPath[safePath]) {
    seedBlocksByPath[safePath] = [];
  }
  seedBlocksByPath[safePath].push(blockInfo);
}

async function processFileOperations() {
  for (const filePath in seedBlocksByPath) {
    const blocks = seedBlocksByPath[filePath].sort((a, b) => b.line - a.line); // Sort by line number descending
    const newestBlock = blocks[0];
    const otherBlocks = blocks.slice(1);

    // Process newest block (highest line number) for original file path
    await processSingleBlock(filePath, newestBlock.content, newestBlock.line);

    // Process other blocks as indexed files (unless latest-only mode is enabled)
    if (!latestOnly) {
      for (let i = 0; i < otherBlocks.length; i++) {
        const indexedPath = getIndexedFilename(filePath, i + 1);
        await processSingleBlock(
          indexedPath,
          otherBlocks[i].content,
          otherBlocks[i].line,
          true
        );
      }
    } else if (otherBlocks.length > 0) {
      // Track skipped duplicates for reporting
      skippedDuplicates += otherBlocks.length;
      if (!silent) {
        console.log(
          `[SKIP] Skipping ${otherBlocks.length} older version(s) of ${filePath} (latest-only mode enabled)`
        );
        otherBlocks.forEach((block, index) => {
          console.log(
            `  - Skipped: ${getIndexedFilename(filePath, index + 1)} (line ${block.line.toLocaleString()})`
          );
        });
      }
    }
  }
}

async function processSingleBlock(
  filePath,
  code,
  startLine,
  isIndexed = false
) {
  const fullPath = path.resolve(__dirname, filePath);
  const relativeFullPath = path.relative(__dirname, fullPath);
  const normalizedNewContent = code.replace(/\r\n/g, '\n') + '\n';

  if (isDryRun) {
    if (!silent) console.log(`[DRY RUN] Evaluating file: ${relativeFullPath}`);
    let linesAdded = 0;
    let linesRemoved = 0;
    if (fs.existsSync(fullPath)) {
      const oldContent = fs.readFileSync(fullPath, 'utf8');
      const normalizedOldContent = oldContent.replace(/\r\n/g, '\n');

      if (normalizedOldContent === normalizedNewContent) {
        if (!silent)
          console.log(
            `  [DRY RUN] File exists and contents are identical. Would be SKIPPED.`
          );
        dryRunFilesToSkip++;
      } else {
        if (!silent)
          console.log(
            `  [DRY RUN] File exists and contents differ. Would be ${isIndexed ? 'CREATED (indexed)' : 'OVERWRITTEN'}.`
          );
        if (isIndexed) {
          dryRunFilesToCreate++;
          linesAdded = normalizedNewContent.split('\n').length - 1;
          totalLinesAdded += linesAdded;
          if (!silent)
            console.log(`    Lines Added: ${linesAdded.toLocaleString()}`);
        } else {
          dryRunFilesToOverwrite++;
          const diff = computeLineDiff(
            normalizedOldContent,
            normalizedNewContent
          );
          linesAdded = diff.added;
          linesRemoved = diff.removed;
          totalLinesAdded += linesAdded;
          totalLinesRemoved += linesRemoved;
          overwriteDetails.push({
            'File Path': filePath,
            'Lines Added': formatNumber(linesAdded),
            'Lines Removed': formatNumber(linesRemoved),
            'Line Number': startLine,
          });
          if (!silent)
            console.log(
              `    Lines Added: ${linesAdded.toLocaleString()}, Lines Removed: ${linesRemoved.toLocaleString()}`
            );
        }
      }
    } else {
      if (!silent)
        console.log(
          `  [DRY RUN] File does not exist. Would be CREATED${isIndexed ? ' (indexed)' : ''}.`
        );
      dryRunFilesToCreate++;
      linesAdded = normalizedNewContent.split('\n').length - 1;
      totalLinesAdded += linesAdded;
      if (!silent)
        console.log(`    Lines Added: ${linesAdded.toLocaleString()}`);
    }

    const ext = (path.extname(filePath) || '.no_extension').toLowerCase();
    dryRunFileTypesCount[ext] = (dryRunFileTypesCount[ext] || 0) + 1;

    const dryRunDirPath = path.dirname(filePath);
    if (
      dryRunDirPath &&
      dryRunDirPath !== '.' &&
      !fs.existsSync(path.resolve(__dirname, dryRunDirPath))
    ) {
      dryRunDirectoriesToCreate.add(dryRunDirPath);
    }
  } else {
    const dirPath = path.dirname(fullPath);
    const relativeDirPath = path.relative(__dirname, dirPath);
    if (relativeDirPath && relativeDirPath !== '.' && !fs.existsSync(dirPath)) {
      if (!silent) console.log(`[INFO] Creating directory: ${relativeDirPath}`);
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        directoriesCreated.add(relativeDirPath);
      } catch (dirError) {
        console.error(
          `[ERROR] Failed to create directory ${relativeDirPath}: ${dirError.message}`
        );
        return;
      }
    }

    let linesAdded = 0;
    let linesRemoved = 0;
    if (fs.existsSync(fullPath)) {
      const oldContent = fs.readFileSync(fullPath, 'utf8');
      const normalizedOldContent = oldContent.replace(/\r\n/g, '\n');

      if (normalizedOldContent === normalizedNewContent) {
        if (!silent)
          console.log(
            `[INFO] File exists: ${relativeFullPath}. Contents identical. Skipping write.`
          );
        filesSkippedCount++;
      } else {
        if (!silent)
          console.log(
            `[${isIndexed ? 'WRITE' : 'OVERWRITE'}] ${isIndexed ? 'Writing new indexed file' : 'File exists'}: ${relativeFullPath}. Contents differ. ${isIndexed ? 'Creating' : 'Overwriting'}.`
          );
        if (isIndexed) {
          linesAdded = normalizedNewContent.split('\n').length - 1;
          totalLinesAdded += linesAdded;
          if (!silent)
            console.log(`    Lines Added: ${linesAdded.toLocaleString()}`);
        } else {
          const diff = computeLineDiff(
            normalizedOldContent,
            normalizedNewContent
          );
          linesAdded = diff.added;
          linesRemoved = diff.removed;
          totalLinesAdded += linesAdded;
          totalLinesRemoved += linesRemoved;
          overwriteDetails.push({
            'File Path': filePath,
            'Lines Added': formatNumber(linesAdded),
            'Lines Removed': formatNumber(linesRemoved),
            'Line Number': startLine,
          });
          if (!silent)
            console.log(
              `    Lines Added: ${linesAdded.toLocaleString()}, Lines Removed: ${linesRemoved.toLocaleString()}`
            );
        }
        try {
          fs.writeFileSync(fullPath, normalizedNewContent);
          if (isIndexed) {
            filesCreatedCount++;
          } else {
            filesOverwrittenCount++;
          }
          const ext = (path.extname(filePath) || '.no_extension').toLowerCase();
          fileTypesCount[ext] = (fileTypesCount[ext] || 0) + 1;
        } catch (writeError) {
          console.error(
            `[ERROR] Failed to ${isIndexed ? 'write' : 'overwrite'} file ${relativeFullPath}: ${writeError.message}`
          );
        }
      }
    } else {
      if (!silent) console.log(`[WRITE] Writing new file: ${relativeFullPath}`);
      linesAdded = normalizedNewContent.split('\n').length - 1;
      totalLinesAdded += linesAdded;
      if (!silent)
        console.log(`    Lines Added: ${linesAdded.toLocaleString()}`);
      try {
        fs.writeFileSync(fullPath, normalizedNewContent);
        filesCreatedCount++;
        const ext = (path.extname(filePath) || '.no_extension').toLowerCase();
        fileTypesCount[ext] = (fileTypesCount[ext] || 0) + 1;
      } catch (writeError) {
        console.error(
          `[ERROR] Failed to write file ${relativeFullPath}: ${writeError.message}`
        );
      }
    }
  }
}

async function main() {
  try {
    await processFile();
    await processFileOperations();

    // Analyze duplicates
    console.log('\n' + '='.repeat(80));
    console.log(
      ' Duplicate File Path Analysis in seed7.md '
        .padStart(40 + 25, ' ')
        .padEnd(80, '=')
    );
    console.log('='.repeat(80));
    console.log(
      'This section identifies file paths declared multiple times in seed7.md,'
    );
    console.log(
      'categorizing them by whether their content is identical or differing.'
    );
    console.log('-'.repeat(80));

    for (const filePath in seedBlocksByPath) {
      const blocks = seedBlocksByPath[filePath];
      if (blocks.length > 1) {
        repeatedPathCount++;
        const lastContent = blocks[blocks.length - 1].content;
        const allIdentical = blocks.every(
          block => block.content === lastContent
        );
        let linesDiff = 0;

        if (allIdentical) {
          identicalContentCount++;
        } else {
          differingContentCount++;
          for (const block of blocks.slice(0, -1)) {
            const diff = computeLineDiff(block.content, lastContent);
            linesDiff += diff.added + diff.removed;
          }
          totalLinesDiffInDuplicates += linesDiff;
        }

        duplicateDetails.push({
          'File Path': filePath,
          Declarations: blocks.length,
          'Line Numbers': blocks.map(b => b.line).join(', '),
          'Content Status': allIdentical
            ? 'Identical'
            : `Differing (${formatNumber(linesDiff)} lines changed)`,
          Module: filePath.split('/')[0] || 'root',
        });

        console.log(
          `[PATH] File path '${filePath}' declared ${blocks.length} times:`
        );
        blocks.forEach(block => {
          console.log(
            `  - Line ${block.line.toLocaleString()} (block position: ${block.position})`
          );
        });
        console.log(
          `  ↔ Content: ${allIdentical ? 'Identical across all declarations' : `Differing, ${linesDiff.toLocaleString()} lines changed. Using last declaration.`}`
        );
      }
    }

    if (repeatedPathCount === 0) {
      console.log('[INFO] No duplicate file paths found in seed7.md.');
    } else {
      console.log('\nDuplicate Paths Overview Table:');
      console.table(duplicateDetails);
    }

    // Overwritten Files Table
    if (overwriteDetails.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log(
        ' Overwritten Files Overview '.padStart(40 + 20, ' ').padEnd(80, '=')
      );
      console.log('='.repeat(80));
      console.log(
        'This section lists files that would be overwritten, with line changes.'
      );
      console.log('-'.repeat(80));
      console.table(overwriteDetails);
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log(
      ` Processing Summary${isDryRun ? ' (Dry Run)' : ''} `
        .padStart(40 + 20, ' ')
        .padEnd(80, '=')
    );
    console.log('='.repeat(80));

    const summaryTable = [];
    if (isDryRun) {
      summaryTable.push({
        Metric: 'Files to be Created',
        Count: formatNumber(dryRunFilesToCreate),
        'Lines Added': formatNumber(totalLinesAdded),
        'Lines Removed': '0',
      });
      summaryTable.push({
        Metric: 'Files to be Overwritten',
        Count: formatNumber(dryRunFilesToOverwrite),
        'Lines Added': formatNumber(
          totalLinesAdded *
            (dryRunFilesToOverwrite /
              (dryRunFilesToCreate + dryRunFilesToOverwrite || 1))
        ),
        'Lines Removed': formatNumber(totalLinesRemoved),
      });
      summaryTable.push({
        Metric: 'Files to be Skipped (Identical Content)',
        Count: formatNumber(dryRunFilesToSkip),
        'Lines Added': '0',
        'Lines Removed': '0',
      });
    } else {
      summaryTable.push({
        Metric: 'Files Created',
        Count: formatNumber(filesCreatedCount),
        'Lines Added': formatNumber(totalLinesAdded),
        'Lines Removed': '0',
      });
      summaryTable.push({
        Metric: 'Files Overwritten',
        Count: formatNumber(filesOverwrittenCount),
        'Lines Added': formatNumber(
          totalLinesAdded *
            (filesOverwrittenCount /
              (filesCreatedCount + filesOverwrittenCount || 1))
        ),
        'Lines Removed': formatNumber(totalLinesRemoved),
      });
      summaryTable.push({
        Metric: 'Files Skipped (Identical Content)',
        Count: formatNumber(filesSkippedCount),
        'Lines Added': '0',
        'Lines Removed': '0',
      });
    }
    summaryTable.push({
      Metric: 'Files with Repeated Paths in Seed7.md',
      Count: formatNumber(repeatedPathCount),
      'Lines Added': '-',
      'Lines Removed': '-',
    });
    summaryTable.push({
      Metric: 'Repeated Paths with Identical Content',
      Count: formatNumber(identicalContentCount),
      'Lines Added': '0',
      'Lines Removed': '0',
    });
    summaryTable.push({
      Metric: 'Repeated Paths with Differing Content',
      Count: formatNumber(differingContentCount),
      'Lines Added': formatNumber(totalLinesDiffInDuplicates / 2),
      'Lines Removed': formatNumber(totalLinesDiffInDuplicates / 2),
    });
    summaryTable.push({
      Metric: 'Total Code Blocks Processed',
      Count: formatNumber(totalCodeBlocks),
      'Lines Added': '-',
      'Lines Removed': '-',
    });
    summaryTable.push({
      Metric: 'Code Blocks Skipped (Invalid/Empty)',
      Count: formatNumber(skippedCodeBlocks),
      'Lines Added': '0',
      'Lines Removed': '0',
    });
    summaryTable.push({
      Metric: 'Duplicate Files Skipped (Latest-Only Mode)',
      Count: formatNumber(skippedDuplicates),
      'Lines Added': '0',
      'Lines Removed': '0',
    });
    summaryTable.push({
      Metric: 'Directories to be Created',
      Count: formatNumber(
        isDryRun ? dryRunDirectoriesToCreate.size : directoriesCreated.size
      ),
      'Lines Added': '-',
      'Lines Removed': '-',
    });
    summaryTable.push({
      Metric: 'Total Lines Added Overall',
      Count: formatNumber(totalLinesAdded),
      'Lines Added': formatNumber(totalLinesAdded),
      'Lines Removed': '0',
    });
    summaryTable.push({
      Metric: 'Total Lines Removed Overall',
      Count: formatNumber(totalLinesRemoved),
      'Lines Added': '0',
      'Lines Removed': formatNumber(totalLinesRemoved),
    });

    console.log('\nSummary of File Operations:');
    console.table(summaryTable);

    // File Types
    console.log('\nFile Type Distribution:');
    const types = isDryRun ? dryRunFileTypesCount : fileTypesCount;
    const typeTable = [];
    for (const ext in types) {
      typeTable.push({
        'File Extension': ext,
        'File Count': formatNumber(types[ext]),
        Percentage: ((types[ext] / filesProcessedCount) * 100).toFixed(2) + '%',
      });
    }
    typeTable.sort((a, b) => b['File Count'] - a['File Count']);
    console.table(typeTable);

    // Directories
    if (isDryRun && dryRunDirectoriesToCreate.size > 0) {
      console.log('\nDirectories to be Created (Dry Run):');
      const dirArray = Array.from(dryRunDirectoriesToCreate).sort();
      dirArray.forEach(dir => console.log(`  - ${dir}`));
    } else if (!isDryRun && directoriesCreated.size > 0) {
      console.log('\nDirectories Created:');
      const dirArray = Array.from(directoriesCreated).sort();
      dirArray.forEach(dir => console.log(`  - ${dir}`));
    }

    console.log('\n' + '-'.repeat(80));
    console.log(
      isDryRun
        ? 'Dry Run Completed. No files or directories modified.'
        : `Processing of ${filename} completed.`
    );
    console.log('='.repeat(80));
  } catch (error) {
    console.error(`\n[ERROR] An error occurred: ${error.message}`);
    if (verbose) console.error(error.stack);
    process.exit(1);
  }
}

main();
