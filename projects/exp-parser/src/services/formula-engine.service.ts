// formula-engine.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { LexerService } from './lexer.service';
import { ParserService } from './parser.service';
import { EvaluatorService } from './evaluator.service';
import { Token } from '../models/token.model';
import { ASTNode, FormulaValue } from '../models/ast.model';
import {
  FormulaDefinition,
  Variable,
  Entity,
  EvaluationContext,
  EvaluationResult,
  DependencyNode,
} from '../models/formula.model';
import { getAllFunctionNames } from './built-in-functions';

@Injectable({ providedIn: 'root' })
export class FormulaEngineService {
  // Signals for reactive updates
  private readonly _formulas = signal<Map<string, FormulaDefinition>>(new Map());
  private readonly _variables = signal<Map<string, Variable>>(new Map());
  private readonly _entities = signal<Map<string, Entity>>(new Map());
  private readonly _errors = signal<Map<string, string>>(new Map());

  // Public readonly signals
  readonly formulas = this._formulas.asReadonly();
  readonly variables = this._variables.asReadonly();
  readonly entities = this._entities.asReadonly();
  readonly errors = this._errors.asReadonly();

  // Computed signals
  readonly formulaCount = computed(() => this._formulas().size);
  readonly variableCount = computed(() => this._variables().size);
  readonly errorCount = computed(() => this._errors().size);

  // Dependency graph for topological sorting
  private dependencyGraph = new Map<string, DependencyNode>();
  private astCache = new Map<string, ASTNode>();

  constructor(
    private lexer: LexerService,
    private parser: ParserService,
    private evaluator: EvaluatorService
  ) {
    this.initializeBuiltInVariables();
  }

  private initializeBuiltInVariables(): void {
    // Built-in constants
    this.setVariable('PI', Math.PI);
    this.setVariable('E', Math.E);
    this.setVariable('TRUE', true);
    this.setVariable('FALSE', false);
    this.setVariable('NULL', null);
  }

  // ═══════════════════════════════════════════════════════════
  // FORMULA MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  registerFormula(id: string, expression: string): FormulaDefinition {
    const startTime = performance.now();

    // Tokenize
    const { tokens, errors: lexerErrors } = this.lexer.tokenize(expression);

    if (lexerErrors.length > 0) {
      const errorMsg = lexerErrors.map(e => e.message).join('; ');
      this.updateError(id, errorMsg);
      return { id, expression, isValid: false, error: errorMsg, dependencies: new Set() };
    }

    // Parse
    const { ast, errors: parserErrors } = this.parser.parse(tokens);

    if (parserErrors.length > 0 || !ast) {
      const errorMsg = parserErrors.map(e => e.message).join('; ');
      this.updateError(id, errorMsg);
      return { id, expression, isValid: false, error: errorMsg, dependencies: new Set() };
    }

    // Extract dependencies
    const dependencies = this.extractDependencies(ast);

    // Cache AST
    this.astCache.set(id, ast);

    // Update dependency graph
    this.updateDependencyGraph(id, dependencies);

    // Create formula definition
    const formula: FormulaDefinition = {
      id,
      expression,
      ast,
      dependencies,
      isValid: true,
    };

    // Update formulas map
    this._formulas.update(map => {
      const newMap = new Map(map);
      newMap.set(id, formula);
      return newMap;
    });

    // Clear error
    this.clearError(id);

    // Mark variables as formula-dependent
    for (const dep of dependencies) {
      if (dep.startsWith('[%') && dep.endsWith('%]')) {
        const varName = dep.slice(2, -2);
        this._variables.update(map => {
          const newMap = new Map(map);
          const existing = newMap.get(varName);
          newMap.set(varName, {
            name: varName,
            value: existing?.value ?? null,
            formulaId: existing?.formulaId ? `${existing.formulaId},${id}` : id,
          });
          return newMap;
        });
      }
    }

    return formula;
  }

  evaluateFormula(id: string): EvaluationResult {
    const startTime = performance.now();

    try {
      const formula = this._formulas().get(id);
      if (!formula) {
        return {
          success: false,
          error: `Formula not found: ${id}`,
          executionTime: performance.now() - startTime,
        };
      }

      if (!formula.isValid || !formula.ast) {
        return {
          success: false,
          error: formula.error || 'Invalid formula',
          executionTime: performance.now() - startTime,
        };
      }

      // Build evaluation context
      const context = this.buildEvaluationContext();

      // Topological sort for correct evaluation order
      const sortedIds = this.topologicalSort([id]);

      // Evaluate in order
      for (const evalId of sortedIds) {
        const evalFormula = this._formulas().get(evalId);
        if (evalFormula?.ast) {
          this.evaluator.setContext(context);
          const value = this.evaluator.evaluate(evalFormula.ast);

          // Update context with new value
          context.variables.set(`__formula_${evalId}`, { name: `__formula_${evalId}`, value });

          // If this is the target formula, we're done
          if (evalId === id) {
            return {
              success: true,
              value,
              executionTime: performance.now() - startTime,
            };
          }
        }
      }

      return {
        success: false,
        error: 'Evaluation failed',
        executionTime: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: performance.now() - startTime,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // VARIABLE MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  setVariable(name: string, value: FormulaValue): void {
    this._variables.update(map => {
      const newMap = new Map(map);
      const existing = newMap.get(name);
      newMap.set(name, {
        name,
        value,
        formulaId: existing?.formulaId,
      });
      return newMap;
    });
  }

  getVariable(name: string): FormulaValue {
    return this._variables().get(name)?.value ?? null;
  }

  deleteVariable(name: string): void {
    this._variables.update(map => {
      const newMap = new Map(map);
      newMap.delete(name);
      return newMap;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ENTITY MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  setEntity(id: string, data: Entity): void {
    this._entities.update(map => {
      const newMap = new Map(map);
      newMap.set(id, { ...data });
      return newMap;
    });
  }

  getEntity(id: string): Entity | undefined {
    return this._entities().get(id);
  }

  updateEntityField(entityId: string, field: string, value: any): void {
    this._entities.update(map => {
      const newMap = new Map(map);
      const entity = newMap.get(entityId);
      if (entity) {
        newMap.set(entityId, { ...entity, [field]: value });
      }
      return newMap;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // DIRECT EXPRESSION EVALUATION
  // ═══════════════════════════════════════════════════════════

  evaluateExpression(expression: string): EvaluationResult {
    const startTime = performance.now();

    try {
      // Tokenize
      const { tokens, errors: lexerErrors } = this.lexer.tokenize(expression);
      if (lexerErrors.length > 0) {
        return {
          success: false,
          error: lexerErrors.map(e => e.message).join('; '),
          executionTime: performance.now() - startTime,
        };
      }

      // Parse
      const { ast, errors: parserErrors } = this.parser.parse(tokens);
      if (parserErrors.length > 0 || !ast) {
        return {
          success: false,
          error: parserErrors.map(e => e.message).join('; '),
          executionTime: performance.now() - startTime,
        };
      }

      // Evaluate
      const context = this.buildEvaluationContext();
      this.evaluator.setContext(context);
      const value = this.evaluator.evaluate(ast);

      return {
        success: true,
        value,
        executionTime: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: performance.now() - startTime,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════

  private buildEvaluationContext(): EvaluationContext {
    return {
      variables: new Map(this._variables()),
      entities: new Map(this._entities()),
      functions: new Map(),
    };
  }

  private extractDependencies(ast: ASTNode): Set<string> {
    const deps = new Set<string>();

    const traverse = (node: ASTNode) => {
      switch (node.type) {
        case 'VariableReference':
          deps.add(`[%${(node as any).name}%]`);
          break;
        case 'EntityReference':
          deps.add(`@${(node as any).entityId}.${(node as any).field}`);
          break;
        case 'BinaryExpression':
          traverse((node as any).left);
          traverse((node as any).right);
          break;
        case 'UnaryExpression':
          traverse((node as any).operand);
          break;
        case 'FunctionCall':
          (node as any).arguments.forEach(traverse);
          break;
      }
    };

    traverse(ast);
    return deps;
  }

  private updateDependencyGraph(id: string, dependencies: Set<string>): void {
    // Remove this node from dependedBy of old dependencies
    const existing = this.dependencyGraph.get(id);
    if (existing) {
      for (const depId of existing.dependsOn) {
        const depNode = this.dependencyGraph.get(depId);
        if (depNode) {
          depNode.dependedBy.delete(id);
        }
      }
    }

    // Create/update node
    const node: DependencyNode = {
      id,
      dependsOn: new Set(),
      dependedBy: new Set(),
    };

    for (const dep of dependencies) {
      if (dep.startsWith('[%') && dep.endsWith('%]')) {
        const varName = dep.slice(2, -2);
        node.dependsOn.add(varName);

        // Update dependedBy of variable
        if (!this.dependencyGraph.has(varName)) {
          this.dependencyGraph.set(varName, {
            id: varName,
            dependsOn: new Set(),
            dependedBy: new Set(),
          });
        }
        this.dependencyGraph.get(varName)!.dependedBy.add(id);
      }
    }

    this.dependencyGraph.set(id, node);
  }

  private topologicalSort(targetIds: string[]): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const node = this.dependencyGraph.get(id);
      if (node) {
        for (const depId of node.dependsOn) {
          visit(depId);
        }
      }

      result.push(id);
    };

    for (const id of targetIds) {
      visit(id);
    }

    return result;
  }

  private updateError(id: string, error: string): void {
    this._errors.update(map => {
      const newMap = new Map(map);
      newMap.set(id, error);
      return newMap;
    });
  }

  private clearError(id: string): void {
    this._errors.update(map => {
      const newMap = new Map(map);
      newMap.delete(id);
      return newMap;
    });
  }

  // Get all available functions
  getAvailableFunctions(): string[] {
    return getAllFunctionNames();
  }

  // Validate expression without evaluating
  validateExpression(expression: string): { valid: boolean; errors: string[] } {
    const { tokens, errors: lexerErrors } = this.lexer.tokenize(expression);
    if (lexerErrors.length > 0) {
      return { valid: false, errors: lexerErrors.map(e => e.message) };
    }

    const { ast, errors: parserErrors } = this.parser.parse(tokens);
    if (parserErrors.length > 0 || !ast) {
      return { valid: false, errors: parserErrors.map(e => e.message) };
    }

    return { valid: true, errors: [] };
  }

  // Clear all data
  reset(): void {
    this._formulas.set(new Map());
    this._variables.set(new Map());
    this._entities.set(new Map());
    this._errors.set(new Map());
    this.dependencyGraph.clear();
    this.astCache.clear();
    this.initializeBuiltInVariables();
  }
}