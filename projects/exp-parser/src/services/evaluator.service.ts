// evaluator.service.ts
import { Injectable } from '@angular/core';
import { TokenType } from '../models/token.model';
import {
  ASTNode,
  FormulaValue,
  BinaryExpression,
  UnaryExpression,
  FunctionCall,
  VariableReference,
  EntityReference,
} from '../models/ast.model';
import { EvaluationContext } from '../models/formula.model';
import { BUILT_IN_FUNCTIONS } from './built-in-functions';

@Injectable({ providedIn: 'root' })
export class EvaluatorService {
  private context!: EvaluationContext;
  private evaluationStack: Set<string> = new Set(); // For cycle detection

  setContext(context: EvaluationContext): void {
    this.context = context;
  }

  evaluate(node: ASTNode): FormulaValue {
    switch (node.type) {
      case 'NumberLiteral':
        return (node as any).value;

      case 'StringLiteral':
        return (node as any).value;

      case 'BooleanLiteral':
        return (node as any).value;

      case 'NullLiteral':
        return null;

      case 'VariableReference':
        return this.evaluateVariableReference(node as VariableReference);

      case 'EntityReference':
        return this.evaluateEntityReference(node as EntityReference);

      case 'BinaryExpression':
        return this.evaluateBinaryExpression(node as BinaryExpression);

      case 'UnaryExpression':
        return this.evaluateUnaryExpression(node as UnaryExpression);

      case 'FunctionCall':
        return this.evaluateFunctionCall(node as FunctionCall);

      case 'Identifier':
        // Fall through to error
        throw new Error(`Unknown identifier: ${(node as any).name}`);

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  private evaluateVariableReference(node: VariableReference): FormulaValue {
    const varName = node.name;

    // Cycle detection
    if (this.evaluationStack.has(`[%${varName}%]`)) {
      throw new Error(`Circular reference detected for variable: [%${varName}%]`);
    }

    const variable = this.context.variables.get(varName);
    if (!variable) {
      throw new Error(`Undefined variable: [%${varName}%]`);
    }

    // If variable has a formula, evaluate it
    if (variable.formulaId && variable.value === undefined) {
      this.evaluationStack.add(`[%${varName}%]`);
      try {
        const formula = this.context.variables.get(`__formula_${variable.formulaId}`);
        if (formula && formula.value !== undefined) {
          return formula.value;
        }
      } finally {
        this.evaluationStack.delete(`[%${varName}%]`);
      }
    }

    return variable.value;
  }

  private evaluateEntityReference(node: EntityReference): FormulaValue {
    const { entityId, field } = node;

    const entity = this.context.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: @${entityId}.${field}`);
    }

    const value = entity[field];
    if (value === undefined) {
      throw new Error(`Field '${field}' not found in entity @${entityId}`);
    }

    return value;
  }

  private evaluateBinaryExpression(node: BinaryExpression): FormulaValue {
    const left = this.evaluate(node.left);
    const right = this.evaluate(node.right);

    switch (node.operator) {
      // Arithmetic
      case TokenType.PLUS:
        return this.add(left, right);
      case TokenType.MINUS:
        return this.subtract(left, right);
      case TokenType.MULTIPLY:
        return this.multiply(left, right);
      case TokenType.DIVIDE:
        return this.divide(left, right);
      case TokenType.MODULO:
        return this.modulo(left, right);
      case TokenType.POWER:
        return this.power(left, right);

      // Comparison
      case TokenType.EQ:
        return this.equals(left, right);
      case TokenType.NEQ:
        return !this.equals(left, right);
      case TokenType.LT:
        return this.lessThan(left, right);
      case TokenType.GT:
        return this.greaterThan(left, right);
      case TokenType.LTE:
        return this.lessThanOrEqual(left, right);
      case TokenType.GTE:
        return this.greaterThanOrEqual(left, right);

      // Logical
      case TokenType.AND:
        return this.logicalAnd(left, right);
      case TokenType.OR:
        return this.logicalOr(left, right);

      default:
        throw new Error(`Unknown operator: ${node.operator}`);
    }
  }

  private evaluateUnaryExpression(node: UnaryExpression): FormulaValue {
    const operand = this.evaluate(node.operand);

    switch (node.operator) {
      case TokenType.NOT:
        return !this.isTruthy(operand);
      case TokenType.MINUS:
        if (typeof operand !== 'number') {
          throw new Error(`Unary minus requires a number`);
        }
        return -operand;
      default:
        throw new Error(`Unknown unary operator: ${node.operator}`);
    }
  }

  private evaluateFunctionCall(node: FunctionCall): FormulaValue {
    const funcName = node.name.toUpperCase();
    const func = BUILT_IN_FUNCTIONS[funcName];

    if (!func) {
      throw new Error(`Unknown function: ${node.name}()`);
    }

    const args = node.arguments.map(arg => this.evaluate(arg));
    return func(args);
  }

  // Arithmetic operations
  private add(a: FormulaValue, b: FormulaValue): FormulaValue {
    if (typeof a === 'number' && typeof b === 'number') {
      return a + b;
    }
    if (typeof a === 'string' || typeof b === 'string') {
      return String(a ?? '') + String(b ?? '');
    }
    return null;
  }

  private subtract(a: FormulaValue, b: FormulaValue): FormulaValue {
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }
    return null;
  }

  private multiply(a: FormulaValue, b: FormulaValue): FormulaValue {
    if (typeof a === 'number' && typeof b === 'number') {
      return a * b;
    }
    return null;
  }

  private divide(a: FormulaValue, b: FormulaValue): FormulaValue {
    if (typeof a === 'number' && typeof b === 'number') {
      if (b === 0) {
        throw new Error('Division by zero');
      }
      return a / b;
    }
    return null;
  }

  private modulo(a: FormulaValue, b: FormulaValue): FormulaValue {
    if (typeof a === 'number' && typeof b === 'number') {
      if (b === 0) {
        throw new Error('Modulo by zero');
      }
      return a % b;
    }
    return null;
  }

  private power(a: FormulaValue, b: FormulaValue): FormulaValue {
    if (typeof a === 'number' && typeof b === 'number') {
      return Math.pow(a, b);
    }
    return null;
  }

  // Comparison operations
  private equals(a: FormulaValue, b: FormulaValue): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a === 'number' && typeof b === 'number') {
      return Math.abs(a - b) < 1e-10;
    }
    return String(a) === String(b);
  }

  private lessThan(a: FormulaValue, b: FormulaValue): boolean {
    if (typeof a === 'number' && typeof b === 'number') {
      return a < b;
    }
    if (typeof a === 'string' && typeof b === 'string') {
      return a < b;
    }
    return false;
  }

// evaluator.service.ts (ادامه)
  private greaterThan(a: FormulaValue, b: FormulaValue): boolean {
    if (typeof a === 'number' && typeof b === 'number') {
      return a > b;
    }
    if (typeof a === 'string' && typeof b === 'string') {
      return a > b;
    }
    return false;
  }

  private lessThanOrEqual(a: FormulaValue, b: FormulaValue): boolean {
    return this.equals(a, b) || this.lessThan(a, b);
  }

  private greaterThanOrEqual(a: FormulaValue, b: FormulaValue): boolean {
    return this.equals(a, b) || this.greaterThan(a, b);
  }

  // Logical operations
  private logicalAnd(a: FormulaValue, b: FormulaValue): boolean {
    return this.isTruthy(a) && this.isTruthy(b);
  }

  private logicalOr(a: FormulaValue, b: FormulaValue): boolean {
    return this.isTruthy(a) || this.isTruthy(b);
  }

  private isTruthy(value: FormulaValue): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    return true;
  }
}