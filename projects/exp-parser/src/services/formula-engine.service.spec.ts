import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { EvaluatorService } from './evaluator.service';
import { FormulaEngineService } from './formula-engine.service';
import { LexerService } from './lexer.service';
import { ParserService } from './parser.service';

function createEngine(): FormulaEngineService {
  return new FormulaEngineService(new LexerService(), new ParserService(), new EvaluatorService());
}

describe('FormulaEngineService reactive expressions', () => {
  it('tracks direct nested property writes from a reactive model', () => {
    const engine = createEngine();
    const form = engine.createReactiveModel({
      x1: { a1: false },
      x2: { a3: true },
    });

    const visible = computed(() => engine.eval('x1.a1 && x2.a3', form) === true);

    expect(visible()).toBe(false);
    form.x1.a1 = true;
    expect(visible()).toBe(true);
    form.x2.a3 = false;
    expect(visible()).toBe(false);
  });

  it('tracks only properties actually read by the expression', () => {
    const engine = createEngine();
    let evaluations = 0;
    engine.registerFunction('TICK', () => {
      evaluations++;
      return true;
    });
    const form = engine.createReactiveModel({
      x1: { a1: true, unrelated: 0 },
    });

    const result = computed(() => engine.eval('TICK() && x1.a1', form) === true);

    expect(result()).toBe(true);
    expect(evaluations).toBe(1);

    form.x1.unrelated++;
    expect(result()).toBe(true);
    expect(evaluations).toBe(1);

    form.x1.a1 = false;
    expect(result()).toBe(false);
    expect(evaluations).toBe(2);
  });

  it('uses short-circuit evaluation and dynamically tracks the active branch', () => {
    const engine = createEngine();
    const form = engine.createReactiveModel({
      enabled: false,
      left: false,
      right: true,
    });

    const result = computed(() => engine.eval('enabled && left || right', form) === true);

    expect(result()).toBe(true);
    form.right = false;
    expect(result()).toBe(false);

    form.enabled = true;
    form.left = true;
    expect(result()).toBe(true);
  });

  it('supports nested array access', () => {
    const engine = createEngine();
    const form = engine.createReactiveModel({
      rows: [{ selected: false }, { selected: true }],
    });

    const selected = computed(() => engine.eval('rows[1].selected', form) === true);
    expect(selected()).toBe(true);

    form.rows[1].selected = false;
    expect(selected()).toBe(false);
  });

  it('caches valid parsed expressions and returns useful validation errors', () => {
    const engine = createEngine();
    expect(engine.validateExpression('x1.a1 && x2.a3').valid).toBe(true);
    expect(engine.validateExpression('x1.').valid).toBe(false);
    expect(() => engine.eval('x1.')).toThrow();
  });
  it('distinguishes loose and strict equality operators', () => {
    const engine = createEngine();
    expect(engine.eval("1 == '1'")).toBe(true);
    expect(engine.eval("1 === '1'")).toBe(false);
    expect(engine.eval("1 !== '1'")).toBe(true);
  });

  it('check entity refrence', () => {
    const engine = createEngine();
    const form = engine.createReactiveModel({
      '@Q123': {
        A456: false,
        A789: true,
      },
    });

    expect(engine.eval('@Q123.A456', form)).toBe(false);
    expect(engine.eval('@Q123.A789', form)).toBe(true);

    form['@Q123']['A456'] = true;
    expect(engine.eval('@Q123.A456', form)).toBe(true);

    form['@Q123']['A456'] = false;
    const result = computed(() => engine.eval('@Q123.A456', form));
    expect(result()).toBe(false);
    form['@Q123']['A456'] = true;
    expect(result()).toBe(true);
  });
});


describe('Expression dependency analyzer', () => {
  it('preserves full nested paths and marks dynamic indexes', async () => {
    const { ExpressionAnalyzer } = await import('./expression-analyzer');
    const lexer = new LexerService();
    const parser = new ParserService();
    const tokens = lexer.tokenize('customer.address.city && rows[index].enabled').tokens;
    const ast = parser.parse(tokens).ast!;
    const dependencies = new ExpressionAnalyzer().analyze(ast);
    expect(dependencies.some(item => item.path === 'customer.address.city')).toBe(true);
    expect(dependencies.some(item => item.kind === 'dynamic-index' && item.path === 'rows[*]')).toBe(true);
    expect(dependencies.some(item => item.path === 'index')).toBe(true);
  });
});


describe('Bytecode execution', () => {
  it('uses correct unary and exponentiation precedence and resolves identifiers', () => {
    const engine = createEngine();
    expect(engine.eval('-2 ** 2')).toBe(-4);
    expect(engine.eval('2 ** 3 ** 2')).toBe(512);
    expect(engine.eval('2 ** -2')).toBe(0.25);
    expect(engine.eval('PI')).toBe(Math.PI);
    engine.setVariable('customValue', 12);
    expect(engine.eval('customValue * 2')).toBe(24);
  });

  it('short-circuits IF, AND and OR function calls', () => {
    const engine = createEngine();
    let calls = 0;
    engine.registerFunction('TICK', () => { calls++; return true; });
    expect(engine.eval('IF(false, TICK(), 7)')).toBe(7);
    expect(engine.eval('AND(false, TICK())')).toBe(false);
    expect(engine.eval('OR(true, TICK())')).toBe(true);
    expect(calls).toBe(0);
  });

  it('tracks only the active IF branch in Angular computed signals', () => {
    const engine = createEngine();
    const form = engine.createReactiveModel({ enabled: true, left: 1, right: 2 });
    let calls = 0;
    engine.registerFunction('COUNT', args => { calls++; return args[0] as number; });
    const value = computed(() => engine.eval('IF(enabled, COUNT(left), COUNT(right))', form));
    expect(value()).toBe(1);
    expect(calls).toBe(1);
    form.right = 3;
    expect(value()).toBe(1);
    expect(calls).toBe(1);
    form.enabled = false;
    expect(value()).toBe(3);
    expect(calls).toBe(2);
  });

  it('detects circular formula dependencies', () => {
    const engine = createEngine();
    engine.registerFormula('alpha', '[%beta%]');
    engine.registerFormula('beta', '[%alpha%]');
    const result = engine.evaluateFormula('alpha');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Circular formula dependency');
  });

  it('rejects malformed and overflowing numeric literals', () => {
    const engine = createEngine();
    expect(engine.validateExpression('1e+').valid).toBe(false);
    expect(engine.validateExpression('1e9999').valid).toBe(false);
  });

  it('keeps custom functions isolated between engine instances', () => {
    const first = createEngine();
    const second = createEngine();
    first.registerFunction('ONLY_FIRST', () => 10);
    expect(first.eval('ONLY_FIRST()')).toBe(10);
    expect(() => second.eval('ONLY_FIRST()')).toThrow();
  });
});


describe('Formula volatility metadata', () => {
  it('marks clock-dependent and custom impure functions as volatile', () => {
    const engine = createEngine();
    expect(engine.registerFormula('clock', 'NOW()').isVolatile).toBe(true);
    engine.registerFunction('CUSTOM_CLOCK', () => 'now');
    expect(engine.registerFormula('customClock', 'CUSTOM_CLOCK()').isVolatile).toBe(true);
    engine.registerFunction('PURE_CUSTOM', () => 5, { pure: true });
    expect(engine.registerFormula('pure', 'PURE_CUSTOM()').isVolatile).toBe(false);
    expect(engine.registerFormula('math', 'SUM(1, 2)').isVolatile).toBe(false);
  });
});
