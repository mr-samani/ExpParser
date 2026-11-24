# ngx-exp-parser

A lightweight expression parser and evaluator for Angular applications.

The library supports arithmetic, comparison and logical operators, built-in functions, legacy variable/entity references, nested object properties, array access, and Angular Signals-based reactive models.

## Reactive form expressions

The reactive-model API lets expressions read the same object that your form controls update. There is no separate variable registration, entity synchronization, or manual dependency update step.

```ts
import { computed, inject } from '@angular/core';
import { FormulaEngineService } from 'ngx-exp-parser';

export class CheckoutComponent {
  private readonly engine = inject(FormulaEngineService);

  readonly form = this.engine.createReactiveModel({
    customer: { isVerified: false },
    shipping: { express: true },
  });

  readonly canCheckout = computed(() =>
    this.engine.eval('customer.isVerified && shipping.express', this.form) === true,
  );
}
```

```html
<label>
  <input type="checkbox" [(ngModel)]="form.customer.isVerified" />
  Verified customer
</label>

<label>
  <input type="checkbox" [(ngModel)]="form.shipping.express" />
  Express shipping
</label>

@if (canCheckout()) {
  <p>Checkout is available.</p>
}
```

### Why createReactiveModel?

Angular Signals track reads of signals, not arbitrary writes to plain JavaScript objects. `createReactiveModel()` wraps the supplied object graph in deep proxies. Each object property has its own internal signal. Reading a property while a `computed()` is running subscribes that computation to that property; writing the property invalidates only computations that read it.

This preserves ordinary form bindings:

- `[(ngModel)]="form.customer.isVerified"`
- `form.shipping.express = false`
- `form.lines[0].quantity = 3`
- Adding, deleting, or replacing nested properties

Nested objects and arrays are proxied lazily and cached, so repeated reads return stable proxies.

> Create the model once and keep the returned proxy as the form model. Mutating the original object passed into `createReactiveModel` bypasses the proxy and is therefore not reactive. Use the returned model for reads and writes.

### Expression syntax

| Feature | Example |
| --- | --- |
| Nested properties | `customer.isVerified` |
| Array indexing | `lines[0].quantity` |
| Arithmetic | `price * quantity + tax` |
| Comparison | `age >= 18` |
| Logical operators | `isActive && hasAccess` |
| Grouping | `isAdmin || (isOwner && isEnabled)` |
| Legacy variables | `[%discount%]` |
| Legacy entity fields | `@Q123ewr.A3tffdd` |
| Built-in functions | `ROUND(total, 2)`, `IF(valid, 1, 0)` |

Supported logical operators short-circuit. As a result, dependencies are dynamic: only properties read by the active evaluation path are tracked. When the condition changes branch, Angular updates the dependency set automatically.

### API

#### `createReactiveModel<T extends object>(model: T): T`

Returns a deeply reactive proxy for a plain object/array model. Keep this returned value as the canonical form model.

#### `eval(expression: string, scope?: object): ExpressionValue`

Evaluates an expression and returns its value. The parser caches successful ASTs by expression text, so repeated calls from a computed signal do not tokenize and parse the expression again.

`eval()` throws for invalid syntax, unknown identifiers, missing properties, and evaluation errors. This makes it suitable for direct use inside `computed()`; use `evaluateExpression()` when an error-result object is preferred.

#### `evaluateExpression(expression: string, scope?: object): EvaluationResult`

Evaluates an expression and returns `success`, `value`, `error`, and `executionTime` without throwing parser/evaluator errors to the caller.

#### Existing API

The existing `registerFormula`, `evaluateFormula`, `setVariable`, `getVariable`, `deleteVariable`, `setEntity`, `getEntity`, `registerFunction`, and `validateExpression` APIs remain available.





## Compatibility

The library peer dependencies remain `@angular/core >=21.0.0` and `@angular/common >=21.0.0`. 

## Security and scope

The expression evaluator does not use `eval()` or `new Function()`. Member access blocks `constructor`, `prototype`, and `__proto__`. Expressions are intended for application-defined data and should not be treated as a replacement for server-side authorization or validation.

Reactive models are intended for plain objects and arrays. Avoid passing class instances with private fields, DOM nodes, Maps/Sets, Dates, or other objects whose methods depend on their original receiver.

## Development

```bash
npm run build:lib
npx ng test exp-parser
```


## Execution engine and dependency analysis

Expressions are compiled to immutable stack-based bytecode after parsing. Repeated evaluations reuse a bounded LRU cache (4,096 programs), avoiding tokenization, parsing, and AST tree-walking on the hot path. The interpreter uses an explicit evaluation context and does not generate JavaScript or use `eval()` / `new Function()`.

Logical operators and the `IF`, `AND`, and `OR` functions short-circuit. This keeps inactive branches out of Angular Signals' dependency tracking. Custom functions registered with a `FormulaEngineService` instance are isolated to that instance.

The exported `ExpressionAnalyzer` extracts full paths (for example, `customer.address.city`), variable and entity references, function names, and dynamic array-index dependencies. Dynamic indexes are marked because their exact property cannot be determined statically.

Formula dependency traversal uses an iterative topological sort, avoiding recursive call-stack growth and reporting cycles rather than silently returning a partial order. Exponentiation is right-associative and follows conventional unary precedence: `-2 ** 2` evaluates to `-4`.


### Volatile functions

Built-in `NOW()` and `TODAY()` are marked volatile. Custom functions are also treated as volatile by default; declare a custom function pure only when it is deterministic and has no external side effects: `registerFunction('DOUBLE', args => Number(args[0]) * 2, { pure: true })`. `FormulaDefinition.isVolatile` exposes this metadata so a host runtime can schedule explicit refreshes for clock-dependent or impure formulas. The expression engine does not create a timer or refresh volatile formulas automatically.
