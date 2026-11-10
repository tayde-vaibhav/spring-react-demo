/**
 * Historical QA Maven runner.
 *
 * This entry point predates I2's Testcontainers-based MongoDB isolation.
 * The former implementation supplied a fixed localhost MongoDB URI and
 * inherited the parent process environment.
 *
 * It is intentionally disabled to prevent accidental execution against
 * development services.
 *
 * Historical verification details remain in docs/qa/test-report.md.
 * Use the reviewed I2/I3 verification workflow for current testing.
 */

console.error(
  'LEGACY_QA_RUNNER_DISABLED: use the reviewed I2/I3 verification workflow instead.'
);

process.exitCode = 2;
