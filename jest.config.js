const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^utils/firebaseClient$': '<rootDir>/__mocks__/firebaseClient.ts',
    '^next/router$': '<rootDir>/__mocks__/nextRouter.js',
  },
  testEnvironment: 'jest-environment-jsdom',
}

module.exports = createJestConfig(customJestConfig)