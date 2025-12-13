/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  testTimeout: 30000,
  // Ensure clean state between tests
  clearMocks: true,
  restoreMocks: true,
  // Handle ESM modules
  transformIgnorePatterns: [
    'node_modules/(?!(mongodb-memory-server)/)',
  ],
  // Environment variables for tests
  testEnvironmentOptions: {
    NODE_ENV: 'test',
  },
};
