import { QualityIssue } from "../types";

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
