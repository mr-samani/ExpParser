// parser.service.ts
import { Injectable } from '@angular/core';
import { Token, TokenType, OPERATOR_PRECEDENCE } from '../models/token.model';
import {
  ASTNode,
  NumberLiteral,
  StringLiteral,
  BooleanLiteral,
  NullLiteral,
  Identifier,
  VariableReference,
  EntityReference,
  BinaryExpression,
  UnaryExpression,
  FunctionCall,
} from '../models/ast.model';

export interface ParseError {
  message: string;
  position: number;
  expected?: string;
}

@Injectable({ providedIn: 'root' })
export class ParserService {
  private tokens: Token[] = [];
  private position: number = 0;
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
      return { ast, errors: this.errors };
    } catch (e) {
      return { ast: null, errors: this.errors };
    }
  }

  private current(): Token {
    return this.tokens[this.position] || { type: TokenType.EOF, value: null, position: 0, length: 0 };
  }

  private peek(offset: number = 0): Token {
    return this.tokens[this.position + offset] || { type: TokenType.EOF, value: null, position: 0, length: 0 };
  }

  private advance(): Token {
    return this.tokens[this.position++] || { type: TokenType.EOF, value: null, position: 0, length: 0 };
  }

  private expect(type: TokenType, message?: string): Token {
    const token = this.current();
    if (token.type !== type) {
      this.errors.push({
        message: message || `Expected ${type} but got ${token.type}`,
        position: token.position,
        expected: type,
      });
    }
    return this.advance();
  }

  private match(...types: TokenType[]): boolean {
    return types.includes(this.current().type);
  }

  private matchAny(validTokens: TokenType[]): boolean {
    return validTokens.includes(this.current().type);
  }

  // Expression = OrExpression
  private parseExpression(): ASTNode {
    return this.parseOrExpression();
  }

  // OrExpression = AndExpression ('||' AndExpression)*
  private parseOrExpression(): ASTNode {
    let left = this.parseAndExpression();

    while (this.match(TokenType.OR)) {
      const operator = this.advance();
      const right = this.parseAndExpression();
      left = this.createBinaryNode(operator, left, right);
    }

    return left;
  }

  // AndExpression = EqualityExpression ('&&' EqualityExpression)*
  private parseAndExpression(): ASTNode {
    let left = this.parseEqualityExpression();

    while (this.match(TokenType.AND)) {
      const operator = this.advance();
      const right = this.parseEqualityExpression();
      left = this.createBinaryNode(operator, left, right);
    }

    return left;
  }

  // EqualityExpression = ComparisonExpression (('==' | '!=') ComparisonExpression)*
  private parseEqualityExpression(): ASTNode {
    let left = this.parseComparisonExpression();

    while (this.match(TokenType.EQ, TokenType.NEQ)) {
      const operator = this.advance();
      const right = this.parseComparisonExpression();
      left = this.createBinaryNode(operator, left, right);
    }

    return left;
  }

  // ComparisonExpression = AdditionExpression (('<' | '>' | '<=' | '>=') AdditionExpression)*
  private parseComparisonExpression(): ASTNode {
    let left = this.parseAdditionExpression();

    while (this.match(TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE)) {
      const operator = this.advance();
      const right = this.parseAdditionExpression();
      left = this.createBinaryNode(operator, left, right);
    }

    return left;
  }

  // AdditionExpression = MultiplicationExpression (('+' | '-') MultiplicationExpression)*
  private parseAdditionExpression(): ASTNode {
    let left = this.parseMultiplicationExpression();

    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const operator = this.advance();
      const right = this.parseMultiplicationExpression();
      left = this.createBinaryNode(operator, left, right);
    }

    return left;
  }

  // MultiplicationExpression = PowerExpression (('*' | '/' | '%') PowerExpression)*
  private parseMultiplicationExpression(): ASTNode {
    let left = this.parsePowerExpression();

    while (this.match(TokenType.MULTIPLY, TokenType.DIVIDE, TokenType.MODULO)) {
      const operator = this.advance();
      const right = this.parsePowerExpression();
      left = this.createBinaryNode(operator, left, right);
    }

    return left;
  }

  // PowerExpression = UnaryExpression ('**' UnaryExpression)* (right associative)
  private parsePowerExpression(): ASTNode {
    let left = this.parseUnaryExpression();

    while (this.match(TokenType.POWER)) {
      const operator = this.advance();
      const right = this.parseUnaryExpression();
      left = this.createBinaryNode(operator, left, right);
    }

    return left;
  }

  // UnaryExpression = ('!' | '-') UnaryExpression | CallExpression
  private parseUnaryExpression(): ASTNode {
    if (this.match(TokenType.NOT)) {
      const operator = this.advance();
      const operand = this.parseUnaryExpression();
      return this.createUnaryNode(operator, operand);
    }

    if (this.match(TokenType.MINUS)) {
      const operator = this.advance();
      const operand = this.parseUnaryExpression();
      return this.createUnaryNode({ ...operator, type: TokenType.MINUS }, operand);
    }

    return this.parseCallExpression();
  }

  // CallExpression = PrimaryExpression | FunctionCall
  private parseCallExpression(): ASTNode {
    const primary = this.parsePrimaryExpression();

    // Check if it's a function call
    if (this.match(TokenType.LPAREN)) {
      if (primary.type !== 'Identifier') {
        this.errors.push({
          message: 'Function call must be on an identifier',
          position: primary.token?.position || 0,
        });
      }

      this.advance(); // consume '('
      const args: ASTNode[] = [];

      if (!this.match(TokenType.RPAREN)) {
        args.push(this.parseExpression());
        while (this.match(TokenType.COMMA)) {
          this.advance();
          args.push(this.parseExpression());
        }
      }

      this.expect(TokenType.RPAREN, 'Expected ")" after function arguments');

      return {
        type: 'FunctionCall',
        name: (primary as Identifier).name,
        arguments: args,
        token: primary.token,
      } as FunctionCall;
    }

    return primary;
  }

  // PrimaryExpression = Number | String | Boolean | Null | 
  //                    VariableRef | EntityRef | Identifier | '(' Expression ')'
  private parsePrimaryExpression(): ASTNode {
    const token = this.current();

    // Number literal
    if (token.type === TokenType.NUMBER) {
      this.advance();
      return {
        type: 'NumberLiteral',
        value: token.value as number,
        token,
      } as NumberLiteral;
    }

    // String literal
    if (token.type === TokenType.STRING) {
      this.advance();
      return {
        type: 'StringLiteral',
        value: token.value as string,
        token,
      } as StringLiteral;
    }

    // Boolean literal
    if (token.type === TokenType.BOOLEAN) {
      this.advance();
      return {
        type: 'BooleanLiteral',
        value: token.value as boolean,
        token,
      } as BooleanLiteral;
    }

    // Null literal
    if (token.type === TokenType.NULL) {
      this.advance();
      return {
        type: 'NullLiteral',
        token,
      } as NullLiteral;
    }

    // Variable reference: [%myvar%]
    if (token.type === TokenType.VARIABLE_REF) {
      this.advance();
      return {
        type: 'VariableReference',
        name: token.value as string,
        token,
      } as VariableReference;
    }

    // Entity reference: @Q123ewr.A3tffdd
    if (token.type === TokenType.ENTITY_REF) {
      this.advance();
      const ref = token.value as { entityId: string; field: string };
      return {
        type: 'EntityReference',
        entityId: ref.entityId,
        field: ref.field,
        token,
      } as EntityReference;
    }

    // Identifier
    if (token.type === TokenType.IDENTIFIER) {
      this.advance();
      return {
        type: 'Identifier',
        name: token.value as string,
        token,
      } as Identifier;
    }

    // Function call
    if (token.type === TokenType.FUNCTION) {
      this.advance();
      const funcName = token.value as string;

      this.expect(TokenType.LPAREN, 'Expected "(" after function name');

      const args: ASTNode[] = [];
      if (!this.match(TokenType.RPAREN)) {
        args.push(this.parseExpression());
        while (this.match(TokenType.COMMA)) {
          this.advance();
          args.push(this.parseExpression());
        }
      }

      this.expect(TokenType.RPAREN, 'Expected ")" after function arguments');

      return {
        type: 'FunctionCall',
        name: funcName,
        arguments: args,
        token,
      } as FunctionCall;
    }

    // Parenthesized expression
    if (token.type === TokenType.LPAREN) {
      this.advance();
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN, 'Expected ")" after expression');
      return expr;
    }

    // Unexpected token
    this.errors.push({
      message: `Unexpected token: ${token.type} (${token.value})`,
      position: token.position,
    });
    this.advance();
    return {
      type: 'NumberLiteral',
      value: 0,
      token,
    } as NumberLiteral;
  }

  private createBinaryNode(operator: Token, left: ASTNode, right: ASTNode): BinaryExpression {
    return {
      type: 'BinaryExpression',
      operator: operator.type,
      left,
      right,
      token: operator,
    };
  }

  private createUnaryNode(operator: Token, operand: ASTNode): UnaryExpression {
    return {
      type: 'UnaryExpression',
      operator: operator.type,
      operand,
      token: operator,
    };
  }
}