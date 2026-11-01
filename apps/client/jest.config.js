// jest-expo, plus one mapping and one folder left out. lucide-react-native's React Native entry is an
// ES module (.mjs), which Jest can't load, so tests use its CommonJS build.
// Metro, which builds the app itself, is unaffected. jest.setup.js stands in
// for the safe area.
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // The lint rules' tests run under node's own runner (see package.json):
  // Expo's preset can't host ESLint.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/eslint-rules/'],
  moduleNameMapper: {
    '^lucide-react-native$': require.resolve('lucide-react-native'),
  },
};
