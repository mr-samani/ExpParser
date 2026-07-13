import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EvaluationResult, FormulaEngineService } from 'ngx-exp-parser';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private engine = inject(FormulaEngineService);

  // Signals
  expression = '';
  lastResult = signal<EvaluationResult | null>(null);

  // Variable inputs
  newVarName = '';
  newVarValue: any = '';

  // Entity inputs
  newEntityId = '';
  newEntityField = '';
  newEntityValue: any = '';

  // Formula inputs
  newFormulaId = '';
  newFormulaExpr = '';

  // Computed from engine
  variables = this.engine.variables;
  entities = this.engine.entities;
  formulas = this.engine.formulas;
  availableFunctions = signal(this.engine.getAvailableFunctions());

  evaluateExpression(): void {
    if (!this.expression.trim()) return;
    const result = this.engine.evaluateExpression(this.expression);
    this.lastResult.set(result);
  }

  addVariable(): void {
    if (!this.newVarName.trim()) return;
    let value: any = this.newVarValue;
    // Try to parse as number
    if (!isNaN(Number(value)) && value !== '') {
      value = Number(value);
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    } else if (value === 'null') {
      value = null;
    }
    this.engine.setVariable(this.newVarName.trim(), value);
    this.newVarName = '';
    this.newVarValue = '';
  }

  removeVariable(name: string): void {
    this.engine.deleteVariable(name);
  }

  addEntityField(): void {
    if (!this.newEntityId.trim() || !this.newEntityField.trim()) return;
    let value: any = this.newEntityValue;
    if (!isNaN(Number(value)) && value !== '') {
      value = Number(value);
    }
    const existing = this.engine.getEntity(this.newEntityId.trim());
    this.engine.setEntity(this.newEntityId.trim(), {
      ...existing,
      [this.newEntityField.trim()]: value,
      id: this.newEntityId.trim(),
    });
    this.newEntityField = '';
    this.newEntityValue = '';
  }

  getEntityKeys(entity: any): string[] {
    return Object.keys(entity).filter((k) => k !== 'id');
  }

  registerFormula(): void {
    if (!this.newFormulaId.trim() || !this.newFormulaExpr.trim()) return;
    this.engine.registerFormula(this.newFormulaId.trim(), this.newFormulaExpr.trim());
    this.newFormulaId = '';
    this.newFormulaExpr = '';
  }

  evaluateFormula(id: string): void {
    const result = this.engine.evaluateFormula(id);
    this.lastResult.set(result);
  }

  getDependencies(formula: any): string {
    return Array.from(formula.dependencies).join(', ');
  }

  loadExample(type: string): void {
    switch (type) {
      case 'simple':
        this.expression = '10 + 20 * 3 - 5';
        break;
      case 'comparison':
        this.expression = '15 > 10 && 5 <= 5';
        break;
      case 'logical':
        this.expression = 'true && false || !false';
        break;
      case 'nested':
        this.engine.setVariable('x', 10);
        this.engine.setVariable('y', 20);
        this.expression = '[%x%] + [%y%] * 2';
        break;
      case 'complex':
        this.engine.setEntity('Q123ewr', { id: 'Q123ewr', A3tffdd: true });
        this.engine.setEntity('Q245fe4', { id: 'Q245fe4', Point: 15 });
        this.engine.setEntity('Q234', { id: 'Q234', A25rew: 8 });
        this.engine.setVariable('myvar', false);
        this.expression =
          '@Q123ewr.A3tffdd && [%myvar%] || (@Q245fe4.Point > 13) && @Q234.A25rew * 5';
        break;
    }
  }
}
