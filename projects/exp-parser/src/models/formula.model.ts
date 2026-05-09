// formula.model.ts
import { ASTNode, FormulaValue } from './ast.model';

export interface FormulaDefinition {
  id: string;
  expression: string;
  ast?: ASTNode;
  dependencies: Set<string>;
  isValid: boolean;
  error?: string;
}

export interface Variable {
  name: string;
  value: FormulaValue;
  formulaId?: string;
}

export interface Entity {
  id?: string;
  [field: string]: any;
}

export interface EvaluationContext {
  variables: Map<string, Variable>;
  entities: Map<string, Entity>;
  functions: Map<string, Function>;
}

export interface EvaluationResult {
  success: boolean;
  value?: FormulaValue;
  error?: string;
  executionTime: number;
}

export interface DependencyNode {
  id: string;
  dependsOn: Set<string>;
  dependedBy: Set<string>;
}