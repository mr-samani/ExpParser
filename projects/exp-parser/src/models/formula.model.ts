import { ASTNode, ExpressionValue, FormulaValue } from './ast.model';

export interface FormulaDefinition {
  id: string;
  expression: string;
  ast?: ASTNode;
  dependencies: Set<string>;
  isValid: boolean;
  /** True when the formula calls a time-dependent or otherwise impure function. */
  isVolatile?: boolean;
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
  /** Optional root object used to resolve normal expressions such as form.name. */
  scope?: object;
}

export interface EvaluationResult {
  success: boolean;
  value?: ExpressionValue;
  error?: string;
  executionTime: number;
}

export interface DependencyNode {
  id: string;
  dependsOn: Set<string>;
  dependedBy: Set<string>;
}
