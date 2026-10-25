import tseslint from 'typescript-eslint';

const remediationFiles = [
  'scripts/run-master-regression.ts',
  'scripts/regression-results.ts',
  'scripts/regression-rpc-scope.ts',
  'scripts/regression-target.ts',
  'scripts/disposable-migration-validation.ts',
  'tests/unit/regression-results.test.ts',
  'tests/unit/regression-rpc-scope.test.ts',
  'tests/unit/disposable-migration-validation.test.ts',
];

export default tseslint.config(
  ...tseslint.configs.recommended,
  { files: remediationFiles },
);
