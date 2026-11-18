import { Injectable, computed, signal, WritableSignal } from '@angular/core';
import { LexerService } from './lexer.service';
import { ParserService } from './parser.service';
import { EvaluatorService } from './evaluator.service';
import { ASTNode, ExpressionValue, FormulaValue } from '../models/ast.model';
import {
  FormulaDefinition, Variable, Entity, EvaluationContext, EvaluationResult, DependencyNode,
} from '../models/formula.model';
import { BUILT_IN_FUNCTIONS, getAllFunctionNames } from './built-in-functions';
import { BuiltInFunction } from '../models/BuiltInFunction';

const ITERATE_KEY = Symbol('iterate');
const MAX_AST_CACHE_SIZE = 500;

interface AstFeatures {
  readsVariables: boolean;
  readsEntities: boolean;
}

@Injectable({ providedIn: 'root' })
export class FormulaEngineService {
  private readonly _formulas = signal<Map<string, FormulaDefinition>>(new Map());
  private readonly _variables = signal<Map<string, Variable>>(new Map());
  private readonly _entities = signal<Map<string, Entity>>(new Map());
  private readonly _errors = signal<Map<string, string>>(new Map());

  readonly formulas = this._formulas.asReadonly();
  readonly variables = this._variables.asReadonly();
  readonly entities = this._entities.asReadonly();
  readonly errors = this._errors.asReadonly();

  readonly formulaCount = computed(() => this._formulas().size);
  readonly variableCount = computed(() => this._variables().size);
  readonly errorCount = computed(() => this._errors().size);

  private dependencyGraph = new Map<string, DependencyNode>();
  private astCache = new Map<string, ASTNode>();
  private readonly astFeatures = new WeakMap<ASTNode, AstFeatures>();

  // Reactive-model internals. Dependencies are tracked per object/property,
  // so changing form.email does not invalidate an expression that only reads form.name.
  private readonly propertyVersions = new WeakMap<object, Map<PropertyKey, WritableSignal<number>>>();
  private readonly proxyCache = new WeakMap<object, object>();
  private readonly rawByProxy = new WeakMap<object, object>();

  constructor(
    private lexer: LexerService,
    private parser: ParserService,
    private evaluator: EvaluatorService,
  ) {
    this.initializeBuiltInVariables();
  }

  private initializeBuiltInVariables(): void {
    this.setVariable('PI', Math.PI);
    this.setVariable('E', Math.E);
    this.setVariable('TRUE', true);
    this.setVariable('FALSE', false);
    this.setVariable('NULL', null);
  }

  registerFunction(name: string, fn: BuiltInFunction): void { BUILT_IN_FUNCTIONS[name.toUpperCase()] = fn; }

  /**
   * Converts a plain object/array graph into a deeply reactive model.
   * Bind directly to the returned proxy: [(ngModel)]="form.customer.name".
   */
  createReactiveModel<T extends object>(model: T): T {
    return this.toReactive(model);
  }

  private toRaw(value: any): any {
    return value && typeof value === 'object' ? (this.rawByProxy.get(value) ?? value) : value;
  }

  private isReactiveContainer(value: object): boolean {
    if (Array.isArray(value)) return true;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  private versionFor(target: object, key: PropertyKey): WritableSignal<number> {
    let versions = this.propertyVersions.get(target);
    if (!versions) {
      versions = new Map<PropertyKey, WritableSignal<number>>();
      this.propertyVersions.set(target, versions);
    }
    let version = versions.get(key);
    if (!version) {
      version = signal(0);
      versions.set(key, version);
    }
    return version;
  }

  private notify(target: object, key: PropertyKey): void {
    this.versionFor(target, key).update(value => value + 1);
  }

  private toReactive<T extends object>(input: T): T {
    const raw = this.toRaw(input);
    if (!raw || typeof raw !== 'object' || !this.isReactiveContainer(raw)) return input;
    const cached = this.proxyCache.get(raw);
    if (cached) return cached as T;

    const engine = this;
    const proxy = new Proxy(raw, {
      get(target, key, receiver) {
        engine.versionFor(target, key)();
        const value = Reflect.get(target, key, receiver);
        return value && typeof value === 'object' ? engine.toReactive(value) : value;
      },
      set(target, key, value) {
        const previous = Reflect.get(target, key, target);
        const rawValue = engine.toRaw(value);
        const hadKey = Object.prototype.hasOwnProperty.call(target, key);
        const oldLength = Array.isArray(target) ? target.length : -1;
        const success = Reflect.set(target, key, rawValue, target);
        if (success && !Object.is(previous, rawValue)) {
          engine.notify(target, key);
          if (!hadKey) engine.notify(target, ITERATE_KEY);
          if (Array.isArray(target)) {
            if (key === 'length' && target.length < oldLength) {
              for (let index = target.length; index < oldLength; index++) engine.notify(target, String(index));
              engine.notify(target, ITERATE_KEY);
            } else if (key !== 'length' && isArrayIndex(key) && Number(key) >= oldLength) {
              engine.notify(target, 'length');
            }
          }
        }
        return success;
      },
      deleteProperty(target, key) {
        const hadKey = Object.prototype.hasOwnProperty.call(target, key);
        const success = Reflect.deleteProperty(target, key);
        if (success && hadKey) {
          engine.notify(target, key);
          engine.notify(target, ITERATE_KEY);
        }
        return success;
      },
      defineProperty(target, key, descriptor) {
        const hadKey = Object.prototype.hasOwnProperty.call(target, key);
        const previous = Reflect.getOwnPropertyDescriptor(target, key);
        const success = Reflect.defineProperty(target, key, descriptor);
        if (success && (!hadKey || !Object.is(previous?.value, descriptor.value))) {
          engine.notify(target, key);
          if (!hadKey) engine.notify(target, ITERATE_KEY);
        }
        return success;
      },
      has(target, key) {
        engine.versionFor(target, key)();
        return Reflect.has(target, key);
      },
      ownKeys(target) {
        engine.versionFor(target, ITERATE_KEY)();
        return Reflect.ownKeys(target);
      },
    });

    this.proxyCache.set(raw, proxy);
    this.rawByProxy.set(proxy, raw);
    return proxy as T;
  }

  registerFormula(id: string, expression: string): FormulaDefinition {
    const parsed = this.getAst(expression);
    if (!parsed.ast) {
      const error = parsed.error ?? 'Invalid expression';
      this.updateError(id, error);
      return { id, expression, isValid: false, error, dependencies: new Set() };
    }
    const dependencies = this.extractDependencies(parsed.ast);
    this.updateDependencyGraph(id, dependencies);
    const formula: FormulaDefinition = { id, expression, ast: parsed.ast, dependencies, isValid: true };
    this._formulas.update(map => new Map(map).set(id, formula));
    this.clearError(id);

    // Keep the legacy formula/variable metadata in sync for the original API.
    for (const dependency of dependencies) {
      if (dependency.startsWith('[%') && dependency.endsWith('%]')) {
        const variableName = dependency.slice(2, -2);
        this._variables.update(map => {
          const next = new Map(map);
          const existing = next.get(variableName);
          next.set(variableName, {
            name: variableName,
            value: existing?.value ?? null,
            formulaId: existing?.formulaId ? `${existing.formulaId},${id}` : id,
          });
          return next;
        });
      }
    }
    return formula;
  }

  evaluateFormula(id: string): EvaluationResult {
    const startTime = performance.now();
    try {
      const formula = this._formulas().get(id);
      if (!formula?.isValid || !formula.ast) {
        return { success: false, error: formula?.error ?? `Formula not found: ${id}`, executionTime: performance.now() - startTime };
      }
      const context = this.buildEvaluationContext(formula.ast);
      const sortedIds = this.topologicalSort([id]);
      for (const evalId of sortedIds) {
        const item = this._formulas().get(evalId);
        if (item?.ast) {
          this.evaluator.setContext(context);
          const value = this.evaluator.evaluate(item.ast);
          context.variables.set(`__formula_${evalId}`, { name: `__formula_${evalId}`, value: value as FormulaValue });
          if (evalId === id) return { success: true, value, executionTime: performance.now() - startTime };
        }
      }
      return { success: false, error: 'Evaluation failed', executionTime: performance.now() - startTime };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', executionTime: performance.now() - startTime };
    }
  }

  setVariable(name: string, value: FormulaValue): void {
    this._variables.update(map => new Map(map).set(name, { name, value, formulaId: map.get(name)?.formulaId }));
  }
  getVariable(name: string): FormulaValue { return this._variables().get(name)?.value ?? null; }
  deleteVariable(name: string): void { this._variables.update(map => { const next = new Map(map); next.delete(name); return next; }); }
  setEntity(id: string, data: Entity): void {
    this._entities.update(map => new Map(map).set(id, { ...map.get(id), ...data }));
  }
  getEntity(id: string): Entity | undefined { return this._entities().get(id); }

  /** Evaluates an expression against a scope. The parsed AST is cached by expression text. */
  eval(expression: string, scope?: object): ExpressionValue {
    const parsed = this.getAst(expression);
    if (!parsed.ast) throw new Error(parsed.error ?? 'Invalid expression');
    this.evaluator.setContext({ ...this.buildEvaluationContext(parsed.ast), scope });
    return this.evaluator.evaluate(parsed.ast);
  }

  evaluateExpression(expression: string, scope?: object): EvaluationResult {
    const startTime = performance.now();
    try {
      const value = this.eval(expression, scope);
      return { success: true, value, executionTime: performance.now() - startTime };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', executionTime: performance.now() - startTime };
    }
  }

  private getAst(expression: string): { ast: ASTNode | null; error?: string } {
    const cached = this.astCache.get(expression);
    if (cached) {
      // Refresh insertion order so frequently used expressions stay in the bounded cache.
      this.astCache.delete(expression);
      this.astCache.set(expression, cached);
      return { ast: cached };
    }
    const { tokens, errors: lexerErrors } = this.lexer.tokenize(expression);
    if (lexerErrors.length) return { ast: null, error: lexerErrors.map(e => e.message).join('; ') };
    const { ast, errors } = this.parser.parse(tokens);
    if (!ast || errors.length) return { ast: null, error: errors.map(e => e.message).join('; ') || 'Invalid expression' };
    this.astFeatures.set(ast, {
      readsVariables: containsNode(ast, 'VariableReference'),
      readsEntities: containsNode(ast, 'EntityReference'),
    });
    this.astCache.set(expression, ast);
    if (this.astCache.size > MAX_AST_CACHE_SIZE) {
      const oldestExpression = this.astCache.keys().next().value;
      if (oldestExpression !== undefined) this.astCache.delete(oldestExpression);
    }
    return { ast };
  }

  private buildEvaluationContext(ast?: ASTNode): EvaluationContext {
    // Do not subscribe a normal form expression to the engine's global variable/entity maps.
    // Explicit legacy references opt into those stores.
    const features = ast ? this.astFeatures.get(ast) : undefined;
    const readsVariables = features?.readsVariables ?? (ast ? containsNode(ast, 'VariableReference') : true);
    const readsEntities = features?.readsEntities ?? (ast ? containsNode(ast, 'EntityReference') : true);
    const variables = readsVariables ? this._variables() : new Map<string, Variable>();
    const entities = readsEntities ? this._entities() : new Map<string, Entity>();
    return { variables: new Map(variables), entities: new Map(entities), functions: new Map() };
  }

  private extractDependencies(ast: ASTNode): Set<string> {
    const deps = new Set<string>();
    const visit = (node: ASTNode): void => {
      switch (node.type) {
        case 'VariableReference': deps.add(`[%${(node as any).name}%]`); break;
        case 'EntityReference': deps.add(`@${(node as any).entityId}.${(node as any).field}`); break;
        case 'MemberExpression': visit((node as any).object); deps.add((node as any).property); break;
        case 'ArrayAccess': visit((node as any).object); visit((node as any).index); break;
        case 'BinaryExpression': visit((node as any).left); visit((node as any).right); break;
        case 'UnaryExpression': visit((node as any).operand); break;
        case 'FunctionCall': (node as any).arguments.forEach(visit); break;
      }
    };
    visit(ast);
    return deps;
  }

  private updateDependencyGraph(id: string, dependencies: Set<string>): void {
    const existing = this.dependencyGraph.get(id);
    if (existing) for (const depId of existing.dependsOn) this.dependencyGraph.get(depId)?.dependedBy.delete(id);
    const node: DependencyNode = { id, dependsOn: new Set(), dependedBy: new Set() };
    for (const dep of dependencies) {
      if (dep.startsWith('[%') && dep.endsWith('%]')) {
        const name = dep.slice(2, -2);
        node.dependsOn.add(name);
        if (!this.dependencyGraph.has(name)) this.dependencyGraph.set(name, { id: name, dependsOn: new Set(), dependedBy: new Set() });
        this.dependencyGraph.get(name)!.dependedBy.add(id);
      }
    }
    this.dependencyGraph.set(id, node);
  }

  private topologicalSort(ids: string[]): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      for (const dep of this.dependencyGraph.get(id)?.dependsOn ?? []) visit(dep);
      result.push(id);
    };
    ids.forEach(visit);
    return result;
  }

  private updateError(id: string, error: string): void { this._errors.update(map => new Map(map).set(id, error)); }
  private clearError(id: string): void { this._errors.update(map => { const next = new Map(map); next.delete(id); return next; }); }
  getAvailableFunctions(): string[] { return getAllFunctionNames(); }

  validateExpression(expression: string): { valid: boolean; errors: string[] } {
    const parsed = this.getAst(expression);
    return parsed.ast ? { valid: true, errors: [] } : { valid: false, errors: [parsed.error ?? 'Invalid expression'] };
  }

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

function isArrayIndex(key: PropertyKey): boolean {
  return typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key);
}


function containsNode(node: ASTNode, type: ASTNode['type']): boolean {
  const current = node as any;
  if (current.type === type) return true;
  switch (current.type) {
    case 'BinaryExpression':
      return containsNode(current.left, type) || containsNode(current.right, type);
    case 'UnaryExpression':
      return containsNode(current.operand, type);
    case 'FunctionCall':
      return current.arguments.some((argument: ASTNode) => containsNode(argument, type));
    case 'MemberExpression':
      return containsNode(current.object, type);
    case 'ArrayAccess':
      return containsNode(current.object, type) || containsNode(current.index, type);
    default:
      return false;
  }
}
