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
  moduleNameMapper: {
    // This mapping allows Jest to resolve imports like 'path/to/module.js'
    // when TypeScript outputs .js files and your source uses .ts
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transformIgnorePatterns: [
    // Allow transformation of ES modules in node_modules
    'node_modules/(?!(p-limit|yocto-queue|globby|dir-glob|fast-glob|@sindresorhus/is|@sindresorhus/df|aggregate-error|clean-stack|escape-string-regexp|@vercel/ai-sdk|ai)/)'
  ],
  transform: {
    // Use ts-jest for TypeScript files
    '^.+\\.tsx?$': ['ts-jest', {
      // Remove isolatedModules from here since it's now in tsconfig
    }],
  }
};

