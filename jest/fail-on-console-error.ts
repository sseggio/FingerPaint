/**
 * Any unexpected `console.error` fails the test (act() warnings, React key / prop-type warnings,
 * uncaught render errors...). The spy throws right away, so the stack points at the culprit, and
 * the test also fails in `afterEach` in case the throw was swallowed by a try/catch along the way.
 *
 * A test that expects an error on purpose mocks it locally:
 * `jest.spyOn(console, 'error').mockImplementation(() => undefined)` (restored automatically
 * since a fresh spy is installed before each test).
 *
 * Allow list: empty. Add a pattern here only for a known, unavoidable third-party message, with
 * a comment saying where it comes from and why it cannot be fixed.
 */
import { formatWithOptions } from 'util';

const ALLOWED: readonly RegExp[] = [];

const original = console.error.bind(console);
let unexpected: string[] = [];
let spy: jest.SpyInstance | null = null;

function format(args: unknown[]): string {
  return formatWithOptions({ depth: 2 }, ...args);
}

beforeEach(() => {
  unexpected = [];
  spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const message = format(args);
    if (ALLOWED.some((pattern) => pattern.test(message))) return;
    unexpected.push(message);
    original(...args);
    throw new Error(`Unexpected console.error: ${message}`);
  });
});

afterEach(() => {
  const errors = unexpected;
  unexpected = [];
  spy?.mockRestore();
  spy = null;
  if (errors.length > 0) {
    throw new Error(`Unexpected console.error during the test:\n${errors.join('\n---\n')}`);
  }
});
