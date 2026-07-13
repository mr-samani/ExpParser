// built-in-functions.ts
import { FormulaValue } from '../models/ast.model';
import { BuiltInFunction } from '../models/BuiltInFunction';

export const BUILT_IN_FUNCTIONS: Record<string, BuiltInFunction> = {
  // Math functions
  ABS: (args) => {
    const n = args[0];
    if (typeof n !== 'number') return null;
    return Math.abs(n);
  },

  ROUND: (args) => {
    const n = args[0] as number;
    const decimals = (args[1] as number) ?? 0;
    if (typeof n !== 'number') return null;
    const factor = Math.pow(10, decimals);
    return Math.round(n * factor) / factor;
  },

  FLOOR: (args) => {
    const n = args[0];
    if (typeof n !== 'number') return null;
    return Math.floor(n);
  },

  CEIL: (args) => {
    const n = args[0];
    if (typeof n !== 'number') return null;
    return Math.ceil(n);
  },

  SQRT: (args) => {
    const n = args[0];
    if (typeof n !== 'number') return null;
    return n >= 0 ? Math.sqrt(n) : null;
  },

  POW: (args) => {
    const base = args[0] as number;
    const exp = args[1] as number;
    if (typeof base !== 'number' || typeof exp !== 'number') return null;
    return Math.pow(base, exp);
  },

  MIN: (args) => {
    const nums = args.filter(a => typeof a === 'number') as number[];
    return nums.length > 0 ? Math.min(...nums) : null;
  },

  MAX: (args) => {
    const nums = args.filter(a => typeof a === 'number') as number[];
    return nums.length > 0 ? Math.max(...nums) : null;
  },

  AVG: (args) => {
    const nums = args.filter(a => typeof a === 'number') as number[];
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  },

  SUM: (args) => {
    const nums = args.filter(a => typeof a === 'number') as number[];
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : 0;
  },

  MOD: (args) => {
    const a = args[0] as number;
    const b = args[1] as number;
    if (typeof a !== 'number' || typeof b !== 'number') return null;
    return a % b;
  },

  // Logical functions
  IF: (args) => {
    const condition = args[0];
    const thenVal = args[1];
    const elseVal = args[2] ?? null;

    if (isTruthy(condition)) {
      return thenVal;
    }
    return elseVal;
  },

  AND: (args) => {
    return args.every(a => isTruthy(a));
  },

  OR: (args) => {
    return args.some(a => isTruthy(a));
  },

  NOT: (args) => {
    return !isTruthy(args[0]);
  },

  XOR: (args) => {
    const a = isTruthy(args[0]);
    const b = isTruthy(args[1]);
    return a !== b;
  },

  // Type checking
  ISNULL: (args) => {
    return args[0] === null || args[0] === undefined;
  },

  ISNUMBER: (args) => {
    return typeof args[0] === 'number' && !isNaN(args[0] as number);
  },

  ISSTRING: (args) => {
    return typeof args[0] === 'string';
  },

  ISBOOLEAN: (args) => {
    return typeof args[0] === 'boolean';
  },

  // String functions
  LEN: (args) => {
    const s = args[0];
    if (typeof s !== 'string') return null;
    return s.length;
  },

  CONCAT: (args) => {
    return args.map(a => String(a ?? '')).join('');
  },

  UPPER: (args) => {
    const s = args[0];
    if (typeof s !== 'string') return null;
    return s.toUpperCase();
  },

  LOWER: (args) => {
    const s = args[0];
    if (typeof s !== 'string') return null;
    return s.toLowerCase();
  },

  TRIM: (args) => {
    const s = args[0];
    if (typeof s !== 'string') return null;
    return s.trim();
  },

  SUBSTRING: (args) => {
    const s = args[0] as string;
    const start = args[1] as number;
    const length = args[2] as number;
    if (typeof s !== 'string' || typeof start !== 'number') return null;
    return s.substring(start, length ? start + length : undefined);
  },

  REPLACE: (args) => {
    const s = args[0] as string;
    const search = args[1] as string;
    const replacement = args[2] as string;
    if (typeof s !== 'string') return null;
    return s.split(search).join(replacement);
  },

  // Date functions (basic)
  NOW: () => {
    return new Date().toISOString();
  },

  TODAY: () => {
    return new Date().toISOString().split('T')[0];
  },

  // Utility
  COALESCE: (args) => {
    for (const arg of args) {
      if (arg !== null && arg !== undefined) {
        return arg;
      }
    }
    return null;
  },

  BETWEEN: (args) => {
    const val = args[0] as number;
    const min = args[1] as number;
    const max = args[2] as number;
    if (typeof val !== 'number' || typeof min !== 'number' || typeof max !== 'number') {
      return null;
    }
    return val >= min && val <= max;
  },

  IN: (args) => {
    const val = args[0];
    return args.slice(1).some(a => a === val);
  },

  // Clamp
  CLAMP: (args) => {
    const val = args[0] as number;
    const min = args[1] as number;
    const max = args[2] as number;
    if (typeof val !== 'number') return null;
    return Math.max(min, Math.min(max, val));
  },
};

function isTruthy(value: FormulaValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

export function getAllFunctionNames(): string[] {
  return Object.keys(BUILT_IN_FUNCTIONS);
}