import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormulaEngineService } from 'ngx-exp-parser';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly engine = inject(FormulaEngineService);

  readonly expression = 'x1.a1 && x2.a3';

  // This proxy is the actual form model. Bind ngModel directly to its properties.
  readonly form = this.engine.createReactiveModel({
    x1: { a1: false },
    x2: { a3: true },
    customer: {
      isVip: false,
      age: 24,
    },
    lines: [
      { quantity: 1, enabled: true },
      { quantity: 2, enabled: false },
    ],
  });

  // No effects, subscriptions, setters, or manual engine updates are required.
  readonly condition = computed(() => this.engine.eval(this.expression, this.form) === true);

  readonly vipDiscount = computed(() =>
    this.engine.eval('customer.isVip && customer.age >= 18', this.form) === true,
  );

  readonly hasEnabledQuantity = computed(() =>
    this.engine.eval('lines[0].enabled && lines[0].quantity > 0', this.form) === true,
  );
}
