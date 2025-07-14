module.exports = {
  testEnvironment: "node",
  testMatch: ["**/test/**/*.test.js"],
  collectCoverageFrom: ["index.js", "!test/**", "!node_modules/**"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
  verbose: true,
  testTimeout: 10000,
};
