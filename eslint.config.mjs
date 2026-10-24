/**
 * Baseline ESLint configuration for the empty workspace.
 * TypeScript-specific rules are added with the mobile/shared package setup
 * after the exact Expo and TypeScript toolchain versions are verified.
 */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/android/**',
      '**/ios/**',
    ],
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    rules: {
      'no-constant-condition': 'warn',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
    },
  },
];
