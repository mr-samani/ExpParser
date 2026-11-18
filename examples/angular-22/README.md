# Angular 22 — Reactive Expression Example

This is a standalone Angular 22 application demonstrating direct two-way form binding to a deeply reactive model powered by `ngx-exp-parser`.

## Requirements

- Node.js 22.22.3+, 24.15+, or a supported Node.js 26 release
- npm
- The repository root dependencies installed

Angular 22 requires TypeScript 6.0.x. This example declares Angular 22-compatible dependency ranges and TypeScript 6.0.3.

## Run from the repository root

Build the library first:

```bash
npm install
npm run build:lib
```

Then install and start this example:

```bash
cd examples/angular-22
npm install
npm start
```

The example's `ngx-exp-parser` dependency points to the generated local package at `../../dist/exp-parser`.

## What to try

1. Toggle `x1.a1` and `x2.a3`. The main result appears only while both values are true.
2. Toggle the VIP flag or change the customer age. The second expression updates directly.
3. Change the first line's enabled flag or quantity. The array expression updates as well.

The component's important code is:

```ts
readonly expression = 'x1.a1 && x2.a3';

readonly form = this.engine.createReactiveModel({
  x1: { a1: false },
  x2: { a3: true },
});

readonly condition = computed(() =>
  this.engine.eval(this.expression, this.form) === true,
);
```

And the template binds to the very same model:

```html
<input type="checkbox" [(ngModel)]="form.x1.a1">
<input type="checkbox" [(ngModel)]="form.x2.a3">

@if (condition()) {
  <div>The condition is true.</div>
}
```

No manual variable registration, subscriptions, effects, form-to-engine synchronization, or dependency-update calls are involved.
