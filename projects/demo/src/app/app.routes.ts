import { Routes } from '@angular/router';
import { ReactiveFormComponent } from './reactive-form/reactive-form.component';

export const routes: Routes = [
  { path: '', redirectTo: 'form', pathMatch: 'full' },
  { path: 'form', component: ReactiveFormComponent },
  {
    path: 'legacy',
    loadComponent: () => import('./legacy/legacy.component').then((c) => c.LegacyComponent),
  },
];
