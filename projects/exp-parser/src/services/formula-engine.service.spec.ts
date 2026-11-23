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

    const result = computed(() => engine.eval('@Q123.A456', form));
    expect(result()).toBe(false);
    form['@Q123']['A456'] = true;
    expect(result()).toBe(true);
  });
});
