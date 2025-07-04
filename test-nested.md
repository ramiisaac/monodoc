---
title: Test Markdown File with Nested Code Blocks
author: GitHub Copilot
---

# Test Document

This is a test markdown file with nested code blocks to test the improved create_files.cjs script.

## Example 1: Simple Code Block

```typescript:src/test/simple-block.ts
export class SimpleExample {
  constructor() {
    console.log("This is a simple example");
  }
}
```

## Example 2: Markdown with Nested Code Block

`````markdown:src/test/nested-markdown.md
# Nested Markdown File

This is a nested markdown file with its own code block:

````typescript
export class NestedExample {
  constructor() {
    console.log("This is a nested example");
  }
}
`````

The end of the nested markdown file.

````

## Example 3: Code with Multiple Backticks

```typescript:src/test/backtick-example.ts
function showMarkdown() {
  // Example of how to show a markdown code block
  const markdown = `
    # Title

    \`\`\`
    const code = "example";
    \`\`\`
  `;

  return markdown;
}
````

## End of Test Document
