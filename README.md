# ngx-exp-parser

[![npm version](https://img.shields.io/npm/v/ngx-exp-parser.svg)](https://www.npmjs.com/package/ngx-exp-parser)
[![Angular](https://img.shields.io/badge/Angular-21%2B-DD0031?logo=angular)](https://angular.dev)

A small expression parser and evaluator for Angular applications. Write expressions against your form model, and let Angular Signals keep computed conditions up to date.

## The problem it solves

Traditional form-condition systems often duplicate form state into a formula engine:

1. Register each variable or entity.
2. Keep that state synchronized with the form.
3. Manually update the engine when a control changes.
4. Recalculate dependent expressions.

With a reactive model, the form and expression engine read the same object. Your controls update the model directly, and property-level signals notify only the expressions that actually read those properties.

## Reactive model — the main feature

```ts
import { computed, inject } from '@angular/core';
import { FormulaEngineService } from 'ngx-exp-parser';

export class ExampleComponent {
  private readonly engine = inject(FormulaEngineService);

  readonly fx = 'x1.a1 && x2.a3';

  readonly form = this.engine.createReactiveModel({
    x1: { a1: false },
    x2: { a3: true },
  });

  readonly condition = computed(() =>
    this.engine.eval(this.fx, this.form) === true,
  );
}
```

Bind directly to those properties:

```html
<input type="checkbox" [(ngModel)]="form.x1.a1">
<input type="checkbox" [(ngModel)]="form.x2.a3">

@if (condition()) {
  <section>This element is visible.</section>
}
```

There is no `setVariable`, `setEntity`, `update`, subscription, or effect to write. The returned model is a deep Proxy. On a property read, the proxy reads an internal Angular signal dedicated to that object/property pair. On a write, it increments that property's signal.

Consequences:

- Nested properties are reactive: `form.customer.address.city`.
- Arrays are reactive: `form.lines[0].quantity`.
- Replacing, adding, and deleting properties is observable.
- Updating an unrelated property does not invalidate a condition that never read it.
- Short-circuit operators make dependencies dynamic. For `a && b`, `b` is not tracked while `a` is false.

> **Important:** keep and mutate the value returned by `createReactiveModel()`. Mutating the original object passed into the method bypasses the Proxy and is not reactive. Reactive models are designed for plain objects and arrays, not class instances, DOM nodes, Dates, Maps, or Sets.

## Expression language

| Category | Syntax |
| --- | --- |
| Numbers and strings | `12`, `3.14`, `'hello'`, `"hello"` |
| Booleans and null | `true`, `false`, `null` |
| Nested properties | `customer.isVerified` |
| Array indexing | `items[0].enabled` |
| Arithmetic | `+`, `-`, `*`, `/`, `%`, `**` |
| Comparison | `==`, `!=`, `===`, `!==`, `<`, `>`, `<=`, `>=` |
| Logical | `&&`, `\|\|`, `!` |
| Grouping | `(isAdmin \|\| isOwner) && isEnabled` |
| Legacy variable references | `[%discount%]` |
| Legacy entity references | `@Q123ewr.A3tffdd` |

### Built-in functions

Math: `ABS`, `ROUND`, `FLOOR`, `CEIL`, `SQRT`, `POW`, `MIN`, `MAX`, `AVG`, `SUM`, `MOD`, `CLAMP`.

Logical and conditional: `IF`, `AND`, `OR`, `NOT`, `XOR`, `BETWEEN`, `IN`.

Type and string utilities: `ISNULL`, `ISNUMBER`, `ISSTRING`, `ISBOOLEAN`, `LEN`, `CONCAT`, `UPPER`, `LOWER`, `TRIM`, `SUBSTRING`, `REPLACE`, `COALESCE`.

Date utilities: `NOW`, `TODAY`.

You can register additional functions with `registerFunction(name, callback)`.

## API reference

### `createReactiveModel<T extends object>(model: T): T`

Creates and returns the deeply reactive model used by controls and expressions.

### `eval(expression: string, scope?: object): ExpressionValue`

Evaluates an expression and returns its value. The AST is cached by expression text, so a computed expression does not tokenize and parse again every time it is invalidated.

`eval()` throws if syntax or evaluation fails. Inside Angular `computed()`, an exception is surfaced by the computed signal. Use `evaluateExpression()` for a non-throwing result.

### `evaluateExpression(expression: string, scope?: object): EvaluationResult`

Returns `{ success, value, error, executionTime }`.

### Existing formula-engine API

The existing registration-oriented API is retained:

- `registerFormula(id, expression)`
- `evaluateFormula(id)`
- `setVariable(name, value)`, `getVariable(name)`, `deleteVariable(name)`
- `setEntity(id, data)`, `getEntity(id)`
- `registerFunction(name, fn)`
- `getAvailableFunctions()`
- `validateExpression(expression)`
- `reset()`

Use the reactive-model API for form state. Use the existing variable/entity API for scenarios where explicit registration is appropriate.


From the repository root:

```bash
npm install
npm run build:lib

npm start
```

This example installs its local library dependency from `../../dist/exp-parser`.

## Compatibility

The library declares Angular peer dependencies `@angular/core >=21.0.0` and `@angular/common >=21.0.0`. 

## Security notes

The expression engine parses a restricted expression language; it does not execute input using JavaScript `eval()` or `new Function()`. Access to `constructor`, `prototype`, and `__proto__` is blocked.

Expressions are not an authorization boundary. Validate permissions and sensitive business rules on the server as well.

## Development

```bash
npm install
npm run build:lib
npm test
```


## Execution engine and dependency analysis

Expressions are compiled to immutable stack-based bytecode after parsing. Repeated evaluations reuse a bounded LRU cache (4,096 programs), avoiding tokenization, parsing, and AST tree-walking on the hot path. The interpreter uses an explicit evaluation context and does not generate JavaScript or use `eval()` / `new Function()`.

Logical operators and the `IF`, `AND`, and `OR` functions short-circuit. This keeps inactive branches out of Angular Signals' dependency tracking. Custom functions registered with a `FormulaEngineService` instance are isolated to that instance.

The exported `ExpressionAnalyzer` extracts full paths (for example, `customer.address.city`), variable and entity references, function names, and dynamic array-index dependencies. Dynamic indexes are marked because their exact property cannot be determined statically.

Formula dependency traversal uses an iterative topological sort, avoiding recursive call-stack growth and reporting cycles rather than silently returning a partial order. Exponentiation is right-associative and follows conventional unary precedence: `-2 ** 2` evaluates to `-4`.


### Volatile functions

Built-in `NOW()` and `TODAY()` are marked volatile. Custom functions are also treated as volatile by default; declare a custom function pure only when it is deterministic and has no external side effects: `registerFunction('DOUBLE', args => Number(args[0]) * 2, { pure: true })`. `FormulaDefinition.isVolatile` exposes this metadata so a host runtime can schedule explicit refreshes for clock-dependent or impure formulas. The expression engine does not create a timer or refresh volatile formulas automatically.
