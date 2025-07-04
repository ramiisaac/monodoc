[**monodoc v2.0.1**](../README.md)

***

[monodoc](../globals.md) / main

# Function: main()

> **main**(`cliOptions`): `Promise`\<`void`\>

Defined in: [index.ts:33](https://github.com/ramiisaac/monodoc/blob/8dfc761efc0b9472f41d7c347037e11c930f5adf/src/index.ts#L33)

The main orchestration function for the JSDoc generation process.
This function is called by various CLI commands (e.g., 'generate', 'watch', 'incremental').
It sets up the shared command context and executes the core `GenerateDocumentationOperation`.

## Parameters

### cliOptions

`CliOptions`

Options parsed from the command line.

## Returns

`Promise`\<`void`\>

A Promise that resolves when the generation process is complete.
