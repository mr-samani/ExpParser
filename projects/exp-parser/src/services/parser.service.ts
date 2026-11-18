import { Injectable } from '@angular/core';
import { Token, TokenType } from '../models/token.model';
import {
  ASTNode, NumberLiteral, StringLiteral, BooleanLiteral, NullLiteral, Identifier,
  VariableReference, EntityReference, BinaryExpression, UnaryExpression, FunctionCall,
  MemberExpression, ArrayAccess,
} from '../models/ast.model';

export interface ParseError {
  message: string;
  position: number;
  expected?: string;
}

@Injectable({ providedIn: 'root' })
export class ParserService {
  private tokens: Token[] = [];
  private position = 0;
  private errors: ParseError[] = [];

  parse(tokens: Token[]): { ast: ASTNode | null; errors: ParseError[] } {
    this.tokens = tokens.filter(t => t.type !== TokenType.EOF);
    this.position = 0;
    this.errors = [];
    if (this.tokens.length === 0) {
      return { ast: null, errors: [{ message: 'Empty expression', position: 0 }] };
    }
    try {
      const ast = this.parseExpression();
      if (this.position < this.tokens.length) {
        const token = this.current();
        this.errors.push({ message: `Unexpected token: ${token.value}`, position: token.position });
      }
      return { ast: this.errors.length ? null : ast, errors: this.errors };
    } catch {
      return { ast: null, errors: this.errors };
    }
  }

  private current(): Token {
    return this.tokens[this.position] || { type: TokenType.EOF, value: null, position: 0, length: 0 };
  }
  private peek(offset = 0): Token {
    return this.tokens[this.position + offset] || { type: TokenType.EOF, value: null, position: 0, length: 0 };
  }
  private advance(): Token {
    return this.tokens[this.position++] || { type: TokenType.EOF, value: null, position: 0, length: 0 };
  }
  private expect(type: TokenType, message?: string): Token {
    const token = this.current();
    if (token.type !== type) {
      this.errors.push({ message: message || `Expected ${type} but got ${token.type}`, position: token.position, expected: type });
      throw new Error('Unexpected token');
    }
    return this.advance();
  }
  private match(...types: TokenType[]): boolean { return types.includes(this.current().type); }

  private parseExpression(): ASTNode { return this.parseOrExpression(); }

  private parseOrExpression(): ASTNode {
    let left = this.parseAndExpression();
    while (this.match(TokenType.OR)) left = this.binary(this.advance(), left, this.parseAndExpression());
    return left;
  }
  private parseAndExpression(): ASTNode {
    let left = this.parseEqualityExpression();
    while (this.match(TokenType.AND)) left = this.binary(this.advance(), left, this.parseEqualityExpression());
    return left;
  }
  private parseEqualityExpression(): ASTNode {
    let left = this.parseComparisonExpression();
    while (this.match(TokenType.EQ, TokenType.NEQ, TokenType.STRICT_EQ, TokenType.STRICT_NEQ)) left = this.binary(this.advance(), left, this.parseComparisonExpression());
    return left;
  }
  private parseComparisonExpression(): ASTNode {
    let left = this.parseAdditionExpression();
    while (this.match(TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE)) {
      left = this.binary(this.advance(), left, this.parseAdditionExpression());
    }
    return left;
  }
  private parseAdditionExpression(): ASTNode {
    let left = this.parseMultiplicationExpression();
    while (this.match(TokenType.PLUS, TokenType.MINUS)) left = this.binary(this.advance(), left, this.parseMultiplicationExpression());
    return left;
  }
  private parseMultiplicationExpression(): ASTNode {
    let left = this.parsePowerExpression();
    while (this.match(TokenType.MULTIPLY, TokenType.DIVIDE, TokenType.MODULO)) {
      left = this.binary(this.advance(), left, this.parsePowerExpression());
    }
    return left;
  }
  private parsePowerExpression(): ASTNode {
    let left = this.parseUnaryExpression();
    if (this.match(TokenType.POWER)) left = this.binary(this.advance(), left, this.parsePowerExpression());
    return left;
  }
  private parseUnaryExpression(): ASTNode {
    if (this.match(TokenType.NOT, TokenType.MINUS)) {
      const operator = this.advance();
      return { type: 'UnaryExpression', operator: operator.type, operand: this.parseUnaryExpression(), token: operator } as UnaryExpression;
    }
    return this.parsePostfixExpression();
  }

  private parsePostfixExpression(): ASTNode {
    let expression = this.parsePrimaryExpression();

    // Whitespace before '(' is allowed: "ABS (value)".
    if (expression.type === 'Identifier' && this.match(TokenType.LPAREN)) {
      expression = this.parseNamedFunction(expression as Identifier);
    }

    while (true) {
      if (this.match(TokenType.DOT)) {
        const dot = this.advance();
        const property = this.expect(TokenType.IDENTIFIER, 'Expected a property name after "."');
        expression = {
          type: 'MemberExpression', object: expression, property: String(property.value), token: dot,
        } as MemberExpression;
        continue;
      }
      if (this.match(TokenType.LBRACKET)) {
        const bracket = this.advance();
        const index = this.parseExpression();
        this.expect(TokenType.RBRACKET, 'Expected "]" after index');
        expression = { type: 'ArrayAccess', object: expression, index, token: bracket } as ArrayAccess;
        continue;
      }
      break;
    }
    return expression;
  }

  private parseNamedFunction(identifier: Identifier): FunctionCall {
    this.expect(TokenType.LPAREN);
    const args: ASTNode[] = [];
    if (!this.match(TokenType.RPAREN)) {
      args.push(this.parseExpression());
      while (this.match(TokenType.COMMA)) {
        this.advance();
        args.push(this.parseExpression());
      }
    }
    this.expect(TokenType.RPAREN, 'Expected ")" after function arguments');
    return { type: 'FunctionCall', name: identifier.name, arguments: args, token: identifier.token };
  }

  private parsePrimaryExpression(): ASTNode {
    const token = this.current();
    switch (token.type) {
      case TokenType.NUMBER:
        this.advance(); return { type: 'NumberLiteral', value: token.value as number, token } as NumberLiteral;
      case TokenType.STRING:
        this.advance(); return { type: 'StringLiteral', value: token.value as string, token } as StringLiteral;
      case TokenType.BOOLEAN:
        this.advance(); return { type: 'BooleanLiteral', value: token.value as boolean, token } as BooleanLiteral;
      case TokenType.NULL:
        this.advance(); return { type: 'NullLiteral', token } as NullLiteral;
      case TokenType.VARIABLE_REF:
        this.advance(); return { type: 'VariableReference', name: token.value as string, token } as VariableReference;
      case TokenType.ENTITY_REF: {
        this.advance();
        const ref = token.value as { entityId: string; field: string };
        return { type: 'EntityReference', entityId: ref.entityId, field: ref.field, token } as EntityReference;
      }
      case TokenType.IDENTIFIER:
        this.advance(); return { type: 'Identifier', name: token.value as string, token } as Identifier;
      case TokenType.FUNCTION: {
        this.advance();
        const name = token.value as string;
        this.expect(TokenType.LPAREN, 'Expected "(" after function name');
        const args: ASTNode[] = [];
        if (!this.match(TokenType.RPAREN)) {
          args.push(this.parseExpression());
          while (this.match(TokenType.COMMA)) { this.advance(); args.push(this.parseExpression()); }
        }
        this.expect(TokenType.RPAREN, 'Expected ")" after function arguments');
        return { type: 'FunctionCall', name, arguments: args, token } as FunctionCall;
      }
      case TokenType.LPAREN: {
        this.advance();
        const expression = this.parseExpression();
        this.expect(TokenType.RPAREN, 'Expected ")" after expression');
        return expression;
      }
      default:
        this.errors.push({ message: `Unexpected token: ${token.type} (${token.value})`, position: token.position });
        throw new Error('Unexpected token');
    }
  }

  private binary(operator: Token, left: ASTNode, right: ASTNode): BinaryExpression {
    return { type: 'BinaryExpression', operator: operator.type, left, right, token: operator };
  }
}
