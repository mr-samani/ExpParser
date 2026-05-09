import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpParser } from './exp-parser';

describe('ExpParser', () => {
  let component: ExpParser;
  let fixture: ComponentFixture<ExpParser>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpParser]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExpParser);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
