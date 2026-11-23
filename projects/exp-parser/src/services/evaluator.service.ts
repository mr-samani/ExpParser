import { Injectable } from '@angular/core';
import { TokenType } from '../models/token.model';
import {
  ASTNode,
  ExpressionValue,
  FormulaValue,
  BinaryExpression,
  UnaryExpression,
  FunctionCall,
  VariableReference,
  EntityReference,
  Identifier,
  MemberExpression,
  ArrayAccess,
} from '../models/ast.model';
import { EvaluationContext } from '../models/formula.model';
import { BUILT_IN_FUNCTIONS } from './built-in-functions';

const BLOCKED_PROPERTIES = new Set(['__proto__', 'prototype', 'constructor']);

@Injectable({ providedIn: 'root' })
export class EvaluatorService {
  private context!: EvaluationContext;
  setContext(context: EvaluationContext): void {
    this.context = context;
  }

  evaluate(node: ASTNode): ExpressionValue {
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
      case 'Identifier':
        return this.evaluateIdentifier(node as Identifier);
      case 'BinaryExpression':
        return this.evaluateBinaryExpression(node as BinaryExpression);
      case 'UnaryExpression':
        return this.evaluateUnaryExpression(node as UnaryExpression);
      case 'FunctionCall':
        return this.evaluateFunctionCall(node as FunctionCall);
      case 'MemberExpression':
        return this.evaluateMemberExpression(node as MemberExpression);
      case 'ArrayAccess':
        return this.evaluateArrayAccess(node as ArrayAccess);
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  private evaluateIdentifier(node: Identifier): ExpressionValue {
    if (this.context.scope && node.name in this.context.scope) {
      return Reflect.get(this.context.scope, node.name);
    }
    const variable = this.context.variables.get(node.name);
    if (variable) return variable.value;
    throw new Error(`Unknown identifier: ${node.name}`);
  }

  private evaluateVariableReference(node: VariableReference): FormulaValue {
    const variable = this.context.variables.get(node.name);
    if (!variable) throw new Error(`Undefined variable: [%${node.name}%]`);
    return variable.value;
  }

  private evaluateEntityReference(node: EntityReference): ExpressionValue {
    const entityKey = `@${node.entityId}`;
    const scope = this.context.scope;

    // First, resolve the entity from the reactive model.
    if (scope && Reflect.has(scope, entityKey)) {
      const entity = Reflect.get(scope, entityKey);

      if (entity === null || typeof entity !== 'object') {
        throw new Error(`Entity not found: @${node.entityId}.${node.field}`);
      }

      if (!(node.field in entity)) {
        throw new Error(`Field '${node.field}' not found in entity @${node.entityId}`);
      }

      return Reflect.get(entity, node.field);
    }

    // Backward compatibility with manually registered entities.
    const entity = this.context.entities.get(node.entityId);

    if (!entity) {
      throw new Error(`Entity not found: @${node.entityId}.${node.field}`);
    }

    if (!(node.field in entity)) {
      throw new Error(`Field '${node.field}' not found in entity @${node.entityId}`);
    }

    return Reflect.get(entity, node.field);
  }

  private evaluateMemberExpression(node: MemberExpression): ExpressionValue {
    const object = this.evaluate(node.object);
    if (object === null || object === undefined) {
      throw new Error(`Cannot read property '${node.property}' of ${object}`);
    }
    if (BLOCKED_PROPERTIES.has(node.property))
      throw new Error('Access to this property is not allowed');
    if (
      (typeof object !== 'object' && typeof object !== 'string') ||
      !(node.property in Object(object))
    ) {
      throw new Error(`Property '${node.property}' does not exist`);
    }
    return Reflect.get(Object(object), node.property);
  }

  private evaluateArrayAccess(node: ArrayAccess): ExpressionValue {
    const object = this.evaluate(node.object);
    const index = this.evaluate(node.index);
    if (object === null || object === undefined) throw new Error('Cannot index null or undefined');
    if (typeof index !== 'number' && typeof index !== 'string')
      throw new Error('Array index must be a number or string');
    const key = String(index);
    if (BLOCKED_PROPERTIES.has(key)) throw new Error('Access to this property is not allowed');
    if (!(key in Object(object))) throw new Error(`Index '${key}' does not exist`);
    return Reflect.get(Object(object), key);
  }

  private evaluateBinaryExpression(node: BinaryExpression): ExpressionValue {
    const left = this.evaluate(node.left);

    // Real short-circuiting is important for both performance and dynamic signal dependencies.
    if (node.operator === TokenType.AND)
      return this.isTruthy(left) ? this.isTruthy(this.evaluate(node.right)) : false;
    if (node.operator === TokenType.OR)
      return this.isTruthy(left) ? true : this.isTruthy(this.evaluate(node.right));

    const right = this.evaluate(node.right);
    switch (node.operator) {
      case TokenType.PLUS:
        return this.add(left as FormulaValue, right as FormulaValue);
      case TokenType.MINUS:
        return this.subtract(left as FormulaValue, right as FormulaValue);
      case TokenType.MULTIPLY:
        return this.multiply(left as FormulaValue, right as FormulaValue);
      case TokenType.DIVIDE:
        return this.divide(left as FormulaValue, right as FormulaValue);
      case TokenType.MODULO:
        return this.modulo(left as FormulaValue, right as FormulaValue);
      case TokenType.POWER:
        return this.power(left as FormulaValue, right as FormulaValue);
      case TokenType.EQ:
        return this.equals(left as FormulaValue, right as FormulaValue);
      case TokenType.NEQ:
        return !this.equals(left as FormulaValue, right as FormulaValue);
      case TokenType.STRICT_EQ:
        return left === right;
      case TokenType.STRICT_NEQ:
        return left !== right;
      case TokenType.LT:
        return this.lessThan(left as FormulaValue, right as FormulaValue);
      case TokenType.GT:
        return this.greaterThan(left as FormulaValue, right as FormulaValue);
      case TokenType.LTE:
        return (
          this.equals(left as FormulaValue, right as FormulaValue) ||
          this.lessThan(left as FormulaValue, right as FormulaValue)
        );
      case TokenType.GTE:
        return (
          this.equals(left as FormulaValue, right as FormulaValue) ||
          this.greaterThan(left as FormulaValue, right as FormulaValue)
        );
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
        if (typeof operand !== 'number') throw new Error('Unary minus requires a number');
        return -operand;
      default:
        throw new Error(`Unknown unary operator: ${node.operator}`);
    }
  }

  private evaluateFunctionCall(node: FunctionCall): FormulaValue {
    const fn = BUILT_IN_FUNCTIONS[node.name.toUpperCase()];
    if (!fn) throw new Error(`Unknown function: ${node.name}()`);
    return fn(node.arguments.map((arg) => this.evaluate(arg)) as FormulaValue[]);
  }

  private add(a: FormulaValue, b: FormulaValue): FormulaValue {
    if (typeof a === 'number' && typeof b === 'number') return a + b;
    if (typeof a === 'string' || typeof b === 'string') return String(a ?? '') + String(b ?? '');
    return null;
  }
  private subtract(a: FormulaValue, b: FormulaValue): FormulaValue {
    return typeof a === 'number' && typeof b === 'number' ? a - b : null;
  }
  private multiply(a: FormulaValue, b: FormulaValue): FormulaValue {
    return typeof a === 'number' && typeof b === 'number' ? a * b : null;
  }
  private divide(a: FormulaValue, b: FormulaValue): FormulaValue {
    if (typeof a !== 'number' || typeof b !== 'number') return null;
    if (b === 0) throw new Error('Division by zero');
    return a / b;
  }
  private modulo(a: FormulaValue, b: FormulaValue): FormulaValue {
    if (typeof a !== 'number' || typeof b !== 'number') return null;
    if (b === 0) throw new Error('Modulo by zero');
    return a % b;
  }
  private power(a: FormulaValue, b: FormulaValue): FormulaValue {
    return typeof a === 'number' && typeof b === 'number' ? Math.pow(a, b) : null;
  }
  private equals(a: FormulaValue, b: FormulaValue): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-10;
    return String(a) === String(b);
  }
  private lessThan(a: FormulaValue, b: FormulaValue): boolean {
    if (typeof a === 'number' && typeof b === 'number') return a < b;
    if (typeof a === 'string' && typeof b === 'string') return a < b;
    return false;
  }
  private greaterThan(a: FormulaValue, b: FormulaValue): boolean {
    if (typeof a === 'number' && typeof b === 'number') return a > b;
    if (typeof a === 'string' && typeof b === 'string') return a > b;
    return false;
  }
  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    return true;
  }
}
