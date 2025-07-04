export interface NodeQualityMetrics {
  hasJSDoc: boolean;
  completeness: number;
  paramCoverage: number;
  returnCoverage: number;
  exampleCount: number;
  descriptionLength: number;
  overallScore: number;
  issues: QualityIssue[];
  suggestions: string[];
}

// --- Code Quality Analysis Types ---
export interface QualityMetrics {
  score: number; // 0-100 score based on various factors
  missingJsdoc: boolean;
  incompleteJsdoc: boolean;
  outdatedJsdoc: boolean;
  complexity: number; // 0-10 complexity score (higher = more complex)
  issues: QualityIssue[]; // Detailed list of issues found
  suggestions: string[]; // Suggestions for improvement
  overallScore: number; // Overall weighted score
  completenessScore: number; // Score for completeness of documentation
  consistencyScore: number; // Score for consistency of documentation
  exampleQuality: number; // Score for quality of examples
}

export interface QualityIssue {
  type: QualityIssueType;
  message: string;
  severity: "error" | "warning" | "info";
  nodeName?: string;
  lineNumber?: number;
  columnNumber?: number;
  suggestion?: string; // Added suggestion property
  filePath?: string; // Added file path property
}

/**
 * Interface for a quality report item, detailing issues for a specific node.
 */
export interface QualityReportItem {
  file: string;
  node: string;
  nodeKind: string;
  score: number;
  issues: string[];
  suggestions: string[];
}

export type QualityIssueType =
  | "no_jsdoc"
  | "missing_description"
  | "short_description"
  | "missing_param"
  | "missing_return"
  | "missing_example"
  | "inconsistent_style"
  | "poor_example_content"
  | "unclear_param_description"
  | "unclear_return_description"
  | "private_undocumented"
  | "overly_generic_description";
