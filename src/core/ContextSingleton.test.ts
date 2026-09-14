import { afterEach, describe, expect, it } from 'vitest';
import { ContextSingleton } from './ContextSingleton';

class TestManager extends ContextSingleton<TestManager> {
  public value = 0;
}

describe('ContextSingleton', () => {
  afterEach(() => {
    TestManager.destroyAllInstances();
  });

  it('возвращает один экземпляр для одного контекста', () => {
    expect(TestManager.inst('main')).toBe(TestManager.inst('main'));
    expect(TestManager.inst()).toBe(TestManager.inst('main'));
  });

  it('создает независимые экземпляры для разных контекстов', () => {
    const main = TestManager.inst('main');
    const simulation = TestManager.inst('simulation');

    main.value = 1;

    expect(simulation).not.toBe(main);
    expect(simulation.value).toBe(0);
    expect(simulation.contextName).toBe('simulation');
  });

  it('использует контекст по умолчанию', () => {
    TestManager.setDefaultContext('simulation');

    expect(TestManager.inst()).toBe(TestManager.inst('simulation'));
  });

  it('удаляет экземпляр контекста', () => {
    const first = TestManager.inst('main');
    TestManager.destroyInstance('main');

    expect(TestManager.hasInstance('main')).toBe(false);
    expect(TestManager.inst('main')).not.toBe(first);
  });
});
