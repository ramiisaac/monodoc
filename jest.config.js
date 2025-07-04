/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/utils/test-setup.ts' // Exclude test setup from coverage
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/src/utils/test-setup.ts'],
  extensionsToTreatAsEsm: ['.ts'], // Treat .ts files as ESM
  moduleNameMapper: {
    // This mapping allows Jest to resolve imports like 'path/to/module.js'
    // when TypeScript outputs .js files and your source uses .ts
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    // Use ts-jest for TypeScript files
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true, // Enable ES Modules support in ts-jest
      isolatedModules: true // Speeds up compilation, good for tests
    }],
  }
};

