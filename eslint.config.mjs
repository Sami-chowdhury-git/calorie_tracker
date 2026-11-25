import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'js/vendor/**',
      'playwright-report/**',
      'test-results/**',
      'coverage/**',
      'audit-reports/**'
    ]
  },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node,
        lucide: 'readonly',
        Chart: 'readonly',
        DOMPurify: 'readonly',
        Utils: 'readonly',
        Store: 'readonly',
        Auth: 'readonly',
        Gemini: 'readonly',
        Nutrition: 'readonly',
        SyncMerge: 'readonly',
        Landing: 'readonly',
        Onboarding: 'readonly',
        Dashboard: 'readonly',
        MealLogger: 'readonly',
        Diary: 'readonly',
        Analytics: 'readonly',
        Achievements: 'readonly',
        Goals: 'readonly',
        AICoach: 'readonly',
        Report: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'eqeqeq': ['warn', 'smart']
    }
  },
  {
    files: ['api/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-eval': 'error',
      'no-implied-eval': 'error'
    }
  },
  {
    files: ['tests/**/*.{js,mjs}', 'playwright.config.mjs', 'vitest.config.mjs', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['k6/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        __ENV: 'readonly',
        __VU: 'readonly',
        __ITER: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
    }
  }
];
