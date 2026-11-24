import { ExpressionValue, FormulaValue } from '../models/ast.model';
import { EvaluationContext } from '../models/formula.model';
import { TokenType } from '../models/token.model';
import { BUILT_IN_FUNCTIONS } from './built-in-functions';
import { BytecodeProgram, Instruction } from './bytecode-compiler';

const BLOCKED_PROPERTIES = new Set(['__proto__', 'prototype', 'constructor']);

export class BytecodeEvaluator {
  evaluate(program: BytecodeProgram, context: EvaluationContext): ExpressionValue {
    const stack: ExpressionValue[] = [];
    const code = program.instructions;
    let ip = 0;
    const pop = (): ExpressionValue => {
      if (!stack.length) throw new Error('Invalid bytecode: stack underflow');
      return stack.pop()!;
    };
    while (ip < code.length) {
      const instruction = code[ip++];
      switch (instruction.op) {
        case 'PUSH': stack.push(instruction.operand as ExpressionValue); break;
        case 'LOAD_IDENTIFIER': {
          const name = instruction.operand as string;
          if (context.scope && Object.prototype.hasOwnProperty.call(context.scope, name)) stack.push(Reflect.get(context.scope, name));
          else {
            const variable = context.variables.get(name);
            if (!variable) throw new Error(`Unknown identifier: ${name}`);
            stack.push(variable.value);
          }
          break;
        }
        case 'LOAD_VARIABLE': {
          const name = instruction.operand as string;
          const variable = context.variables.get(name);
          if (!variable) throw new Error(`Undefined variable: [%${name}%]`);
          stack.push(variable.value); break;
        }
        case 'LOAD_ENTITY': {
          const ref = instruction.operand as { entityId: string; field: string };
          const key = `@${ref.entityId}`;
          const hasScopedEntity = !!context.scope && Reflect.has(context.scope, key);
          const entity = hasScopedEntity ? Reflect.get(context.scope!, key) : context.entities.get(ref.entityId);
          if (!entity || typeof entity !== 'object') throw new Error(`Entity not found: @${ref.entityId}.${ref.field}`);
          this.assertSafeProperty(ref.field);
          if (!(ref.field in entity)) throw new Error(`Field '${ref.field}' not found in entity @${ref.entityId}`);
          stack.push(Reflect.get(entity, ref.field)); break;
        }
        case 'GET_MEMBER': {
          const object = pop();
          const property = instruction.operand as string;
          this.assertSafeProperty(property);
          if (object === null || object === undefined) throw new Error(`Cannot read property '${property}' of ${object}`);
          if ((typeof object !== 'object' && typeof object !== 'string') || !(property in Object(object))) throw new Error(`Property '${property}' does not exist`);
          stack.push(Reflect.get(Object(object), property)); break;
        }
        case 'GET_INDEX': {
          const index = pop(); const object = pop();
          if (object === null || object === undefined) throw new Error('Cannot index null or undefined');
          if (typeof index !== 'number' && typeof index !== 'string') throw new Error('Array index must be a number or string');
          const key = String(index); this.assertSafeProperty(key);
          if (!(key in Object(object))) throw new Error(`Index '${key}' does not exist`);
          stack.push(Reflect.get(Object(object), key)); break;
        }
        case 'UNARY': {
          const value = pop();
          if (instruction.operand === TokenType.NOT) stack.push(!this.isTruthy(value));
          else if (instruction.operand === TokenType.MINUS && typeof value === 'number') stack.push(-value);
          else throw new Error('Unary minus requires a number');
          break;
        }
        case 'BINARY': {
          const right = pop(); const left = pop();
          stack.push(this.binary(instruction.operand as TokenType, left as FormulaValue, right as FormulaValue)); break;
        }
        case 'TO_BOOLEAN': stack.push(this.isTruthy(pop())); break;
        case 'CALL': {
          const count = instruction.argumentCount ?? 0;
          const args = count ? stack.splice(stack.length - count, count) as FormulaValue[] : [];
          const fn = (context.functions.get(String(instruction.operand)) as ((values: FormulaValue[]) => FormulaValue) | undefined) ?? BUILT_IN_FUNCTIONS[String(instruction.operand)];
          if (!fn) throw new Error(`Unknown function: ${String(instruction.operand)}()`);
          stack.push(fn(args)); break;
        }
        case 'POP': pop(); break;
        case 'JUMP_IF_FALSE': if (!this.isTruthy(stack[stack.length - 1])) ip = Number(instruction.operand); break;
        case 'JUMP_IF_TRUE': if (this.isTruthy(stack[stack.length - 1])) ip = Number(instruction.operand); break;
        case 'JUMP': ip = Number(instruction.operand); break;
        case 'RETURN': return pop();
        default: throw new Error(`Unknown bytecode instruction: ${(instruction as Instruction).op}`);
      }
    }
    throw new Error('Invalid bytecode: missing RETURN');
  }
  private assertSafeProperty(property: string): void {
    if (BLOCKED_PROPERTIES.has(property)) throw new Error('Access to this property is not allowed');
  }
  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    return true;
  }
  private binary(operator: TokenType, a: FormulaValue, b: FormulaValue): FormulaValue {
    switch (operator) {
      case TokenType.PLUS:
        if (typeof a === 'number' && typeof b === 'number') return a + b;
        if (typeof a === 'string' || typeof b === 'string') return String(a ?? '') + String(b ?? '');
        return null;
      case TokenType.MINUS: return typeof a === 'number' && typeof b === 'number' ? a - b : null;
      case TokenType.MULTIPLY: return typeof a === 'number' && typeof b === 'number' ? a * b : null;
      case TokenType.DIVIDE:
        if (typeof a !== 'number' || typeof b !== 'number') return null;
        if (b === 0) throw new Error('Division by zero'); return a / b;
      case TokenType.MODULO:
        if (typeof a !== 'number' || typeof b !== 'number') return null;
        if (b === 0) throw new Error('Modulo by zero'); return a % b;
      case TokenType.POWER: return typeof a === 'number' && typeof b === 'number' ? Math.pow(a, b) : null;
      case TokenType.EQ: return this.equals(a, b);
      case TokenType.NEQ: return !this.equals(a, b);
      case TokenType.STRICT_EQ: return a === b;
      case TokenType.STRICT_NEQ: return a !== b;
      case TokenType.LT: return this.compare(a, b, '<');
      case TokenType.GT: return this.compare(a, b, '>');
      case TokenType.LTE: return this.equals(a, b) || this.compare(a, b, '<');
      case TokenType.GTE: return this.equals(a, b) || this.compare(a, b, '>');
      default: throw new Error(`Unknown operator: ${operator}`);
    }
  }
  private equals(a: FormulaValue, b: FormulaValue): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-10;
    return String(a) === String(b);
  }
  private compare(a: FormulaValue, b: FormulaValue, op: '<' | '>'): boolean {
    if (typeof a === 'number' && typeof b === 'number') return op === '<' ? a < b : a > b;
    if (typeof a === 'string' && typeof b === 'string') return op === '<' ? a < b : a > b;
    return false;
  }
}
