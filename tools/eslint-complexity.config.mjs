// Конфігурація лише для заміру цикломатичної складності (правило complexity).
// Поріг 0 змушує ESLint повідомити про кожну функцію; у повідомленні є її складність.
// Запуск: див. tools/measure.mjs
const common = {
  ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/uploads/**', 'backend/tests/**', 'backend/*.config.mjs'],
};

export default [
  common,
  {
    files: ['frontend/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { complexity: ['error', 0] },
  },
  {
    files: ['backend/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' },
    rules: { complexity: ['error', 0] },
  },
];
