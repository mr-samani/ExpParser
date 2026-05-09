// ast.model.ts
import { TokenType } from './token.model';

export type ASTNodeType =
  | 'NumberLiteral'
  | 'StringLiteral'
  | 'BooleanLiteral'
  | 'NullLiteral'
  | 'Identifier'
  | 'VariableReference'
  | 'EntityReference'
  | 'BinaryExpression'
  | 'UnaryExpression'
  | 'FunctionCall'
  | 'ArrayAccess';

export interface ASTNode {
  type: ASTNodeType;
  token?: { type: TokenType; value: any; position: number };
}

export interface NumberLiteral extends ASTNode {
  type: 'NumberLiteral';
  value: number;
}

export interface StringLiteral extends ASTNode {
  type: 'StringLiteral';
  value: string;
}

export interface BooleanLiteral extends ASTNode {
  type: 'BooleanLiteral';
  value: boolean;
}

export interface NullLiteral extends ASTNode {
  type: 'NullLiteral';
}

export interface Identifier extends ASTNode {
  type: 'Identifier';
  name: string;
}

export interface VariableReference extends ASTNode {
  type: 'VariableReference';
  name: string;
}

export interface EntityReference extends ASTNode {
  type: 'EntityReference';
  entityId: string;
  field: string;
}

export interface BinaryExpression extends ASTNode {
  type: 'BinaryExpression';
  operator: TokenType;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryExpression extends ASTNode {
  type: 'UnaryExpression';
  operator: TokenType;
  operand: ASTNode;
}

export interface FunctionCall extends ASTNode {
  type: 'FunctionCall';
  name: string;
  arguments: ASTNode[];
}

export type FormulaValue = number | string | boolean | null;
