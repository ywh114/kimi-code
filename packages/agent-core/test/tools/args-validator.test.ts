import { describe, expect, it } from 'vitest';

import { compileToolArgsValidator, validateToolArgs, type JsonType } from '../../src/tools/args-validator';
import { toInputJsonSchema } from '../../src/tools/support/input-schema';
import { ReadInputSchema } from '../../src/tools/builtin/file/read';

// Mirrors the real Read tool schema: `line_offset` is a union of two integer
// ranges, which is exactly the shape some models (Qwen previews) trip on by
// emitting the number as a JSON string.
const schema = toInputJsonSchema(ReadInputSchema);

function validate(args: Record<string, JsonType>): { error: string | null; args: Record<string, JsonType> } {
  const validator = compileToolArgsValidator(schema);
  return { error: validateToolArgs(validator, args), args };
}

describe('tool args validator type coercion', () => {
  it('accepts a proper integer line_offset', () => {
    const { error } = validate({ path: '/a.ts', line_offset: 255 });
    expect(error).toBeNull();
  });

  it('coerces a stringified positive line_offset to a number in place', () => {
    const args: Record<string, JsonType> = { path: '/a.ts', line_offset: '255' };
    const { error } = validate(args);
    expect(error).toBeNull();
    expect(args['line_offset']).toBe(255);
  });

  it('coerces a stringified negative (tail) line_offset via the second union branch', () => {
    const args: Record<string, JsonType> = { path: '/a.ts', line_offset: '-100' };
    const { error } = validate(args);
    expect(error).toBeNull();
    expect(args['line_offset']).toBe(-100);
  });

  it('coerces a stringified n_lines too', () => {
    const args: Record<string, JsonType> = { path: '/a.ts', n_lines: '40' };
    const { error } = validate(args);
    expect(error).toBeNull();
    expect(args['n_lines']).toBe(40);
  });

  it('does not coerce genuine string fields', () => {
    const args: Record<string, JsonType> = { path: '123' };
    const { error } = validate(args);
    expect(error).toBeNull();
    expect(args['path']).toBe('123');
  });

  it('still rejects a non-numeric line_offset string', () => {
    const { error } = validate({ path: '/a.ts', line_offset: 'abc' });
    expect(error).not.toBeNull();
  });

  it('still rejects an out-of-range line_offset', () => {
    const { error } = validate({ path: '/a.ts', line_offset: -5000 });
    expect(error).not.toBeNull();
  });
});
