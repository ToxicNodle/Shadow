import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Honor the leading-underscore convention for intentionally unused
      // bindings (e.g. `_lead`, `_status` placeholder props, `catch (_e)`).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // The React Compiler rules shipped in eslint-plugin-react-hooks v6 are
      // useful signal but too aggressive to gate CI on for this client-only
      // SPA — they flag things like `new Date()` during render (no SSR here,
      // so no hydration risk) and deriving state from props in an effect.
      // Keep them visible as warnings; the hard errors below stay blocking.
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      // Fast-refresh boundary hint — a DX optimization, not a runtime bug.
      'react-refresh/only-export-components': 'warn',
      // `any` is discouraged but pre-existing usage shouldn't fail the build.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Empty `catch {}` is an intentional swallow pattern here (best-effort
      // JSON parsing / localStorage writes that may legitimately fail).
      'no-empty': ['error', { allowEmptyCatch: true }],
      // rules-of-hooks and no-unused-expressions stay as errors (real bugs).
    },
  },
])
