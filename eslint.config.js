import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-non-null-assertion': 0,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'prefer-const': 'warn',
      // Test files use require() for dynamic code evaluation - intentional
      '@typescript-eslint/no-require-imports': 0,
      // Empty functions used in tests and AsyncFunction pattern
      '@typescript-eslint/no-empty-function': 0,
    },
  },
  {
    ignores: ['dist/', '.demo/', 'demo/', 'node_modules/', 'functions/lib/'],
  }
)
