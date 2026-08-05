import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';
import unicornPlugin from 'eslint-plugin-unicorn';
import prettierConfig from 'eslint-config-prettier';

const IGNORE_PATTERNS = [
  'node_modules',
  '**/node_modules/**',
  'dist',
  '**/dist/**',
  'coverage',
  '**/coverage/**',
  '**/*.d.ts',
  '**/*.tsbuildinfo',
  '**/*.map',
  'pnpm-lock.yaml',
  'package-lock.json',
  '.dependency-cruiser.cjs',
  'eslint.config.mjs',
  // Config-style CJS files are not source we own; lint them only if/when we
  // adopt rules for build configuration.
  'commitlint.config.cjs',
  // Vitest/Vite-style `.config.ts` files don't live in any project's
  // tsconfig include, so the typed lint rules cannot resolve them. Lint
  // them only when we add a dedicated tsconfig for build configuration.
  '**/vitest.config.ts',
  // Scratch trees that are not part of the toolkit source. Kept as ignore
  // globs so stray experiment directories do not fail lint; harmless when the
  // directories are absent.
  'lib/**',
  'poc/**',
  // *.proposal.ts files are literate design documents that reference symbols
  // that do not exist yet. Lint would flag every line; the matching tsconfig
  // also excludes this pattern.
  '**/*.proposal.ts',
];

const typedFilePatterns = ['**/*.ts', '**/*.mts', '**/*.cts'];
const testFilePatterns = [
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/__tests__/**/*.ts',
  '**/test/**/*.ts',
];

const baseGlobals = { ...globals.es2024, ...globals.node };

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: IGNORE_PATTERNS },

  // Base JS rules apply to all source files.
  js.configs.recommended,

  // Typed TypeScript rules apply ONLY to .ts / .mts / .cts files.
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: typedFilePatterns,
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: typedFilePatterns,
  })),

  prettierConfig,

  {
    files: typedFilePatterns,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: baseGlobals,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'import-x': importPlugin,
      unicorn: unicornPlugin,
    },
    rules: {
      // TypeScript strict rules
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: true,
        },
      ],
      '@typescript-eslint/consistent-type-exports': [
        'error',
        { fixMixedExportsWithInlineTypeSpecifier: true },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
      // Optional chaining, optional parameters, and default-value parameters
      // are all allowed. These opinionated stylistic rules are left off so the
      // rules do not force a particular arity-expression style on the code.
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/no-useless-default-assignment': 'off',
      '@typescript-eslint/unified-signatures': 'off',
      // `no-namespace` bans module-augmenting namespace declarations by default.
      // We need them to extend `declare global { namespace PlaywrightTest { ... } }`
      // with custom matchers. Allow inside `declare` blocks (the only legitimate
      // use case for namespaces in this codebase).
      '@typescript-eslint/no-namespace': [
        'error',
        { allowDeclarations: true, allowDefinitionFiles: true },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],

      // Import rules
      'import-x/no-cycle': ['error', { maxDepth: 10 }],
      'import-x/no-duplicates': ['error', { 'prefer-inline': true }],
      'import-x/first': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-mutable-exports': 'error',
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            ...testFilePatterns,
            '**/*.config.ts',
            '**/*.config.mts',
            '**/*.config.mjs',
            '**/*.config.cjs',
            '**/*.config.js',
          ],
          optionalDependencies: false,
        },
      ],

      // Strict boundary rules
      'no-restricted-syntax': [
        'error',
        {
          // No double type assertions
          selector: 'TSAsExpression > TSAsExpression',
          message:
            'Double type assertions (x as unknown as Y) are not allowed. Fix the underlying type instead of forcing a cast.',
        },
        {
          // No `x as any` cast — escape hatch. `no-explicit-any` only catches
          // `: any` annotations; the cast form needs an AST rule of its own.
          selector: 'TSAsExpression > TSAnyKeyword',
          message:
            '`as any` is forbidden. Fix the underlying type or refactor the API so the cast is unneeded.',
        },
        {
          // No `x as never` cast — same reasoning. Returning `as never` from a
          // stub function is a sign the function should not exist, or the
          // surrounding type contract is wrong.
          selector: 'TSAsExpression > TSNeverKeyword',
          message:
            '`as never` is forbidden. Replace the stubbed value with a real one, or refactor the type so the cast is unneeded.',
        },
        {
          // No "I" prefix on interfaces (TypeScript structural typing)
          selector: 'TSInterfaceDeclaration[id.name=/^I[A-Z]/]',
          message: 'Do not prefix interfaces with "I". TypeScript uses structural typing.',
        },
        // Optional properties, optional parameters, and optional chaining are
        // intentionally allowed. The frozen @earsyntax/core contract in
        // packages/core/src/types.ts uses optional properties throughout to
        // mirror the Go reference JSON shapes, and the public API functions
        // (lintEars, parseEars, ...) take optional `catalog?`/`options?`
        // parameters. Earlier bans on `?:` and `?.` were blackbox-era rules.
        // NO REDUNDANT TYPE ANNOTATION on `new` expressions — `new Foo()`
        // already returns the typed instance. `const x: Foo = new Foo()`
        // duplicates information. Drop the annotation: `const x = new Foo()`.
        {
          selector: 'VariableDeclarator[id.typeAnnotation][init.type="NewExpression"]',
          message:
            'Redundant type annotation on a `new` expression — the constructor already returns the typed instance. Drop the annotation: `const x = new Foo()` instead of `const x: Foo = new Foo()`.',
        },
        // NO `delete` OPERATOR. Deleting a key mutates an object in place and
        // deoptimizes its shape. Construct a new object without the key instead
        // (e.g. object rest: `const { removed: _removed, ...rest } = obj`).
        {
          selector: 'UnaryExpression[operator="delete"]',
          message:
            'Do not use `delete`; construct a new object without the key instead (e.g. object rest destructuring).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@earsyntax/*/src/*', '@earsyntax/*/src'],
              message:
                'Import from the package entry point, not /src paths. Use the @earsyntax/<package> export.',
            },
            {
              group: ['**/dist/**', '@earsyntax/*/dist', '@earsyntax/*/dist/**'],
              message:
                'Do not import built dist artifacts from TypeScript source or tests. Import a package entry point instead.',
            },
            {
              group: ['../../../*'],
              message: 'Avoid deep relative imports. Use workspace package imports.',
            },
          ],
        },
      ],

      // Unicorn rules
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/no-array-reduce': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off',
      'unicorn/filename-case': 'off',

      // General rules
      'no-console': 'warn',
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      // Immutability: do not mutate received values. `no-param-reassign` with
      // `props: true` forbids both reassigning a parameter and mutating its
      // properties; combined with the `delete` ban above this pushes the code
      // toward constructing new objects rather than editing in place.
      'no-param-reassign': ['error', { props: true }],
    },
  },
  {
    files: testFilePatterns,
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Test files live 2-3 directories deep under test/, so a 3-level relative
      // import is same-package (test/a/b/ → src/). Only cross-package imports
      // (4+ levels) need to be restricted.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@earsyntax/*/src/*', '@earsyntax/*/src'],
              message:
                'Import from the package entry point, not /src paths. Use the @earsyntax/<package> export.',
            },
            {
              group: ['**/dist/**', '@earsyntax/*/dist', '@earsyntax/*/dist/**'],
              message:
                'Do not import built dist artifacts from TypeScript source or tests. Import a package entry point instead.',
            },
            {
              group: ['../../../../*'],
              message:
                'Avoid cross-package relative imports. Use workspace package imports instead.',
            },
          ],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'no-console': 'off',
      'import-x/no-extraneous-dependencies': 'off',
    },
  },

  // ESM script files (*.mjs). These are Node.js utility scripts, not TypeScript
  // source. Apply Node globals so `console`, `process`, `URL`, etc. are defined.
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: baseGlobals,
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // CommonJS source files (*.cjs). These are config-style or bootstrap files
  // that can't be ESM or TypeScript. Lint them with vanilla JS rules + Node
  // globals + CommonJS source type. None of the typed TS rules apply.
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: baseGlobals,
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
];
