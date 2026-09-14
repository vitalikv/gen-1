/**
 * Базовый класс для реализации паттерна Singleton с поддержкой контекстов
 * Позволяет иметь несколько экземпляров одного класса для разных контекстов
 * Реестр существует отдельно в каждом потоке (главный поток и каждый Worker)
 * // Использование:
 * MyManager.inst().doSomething();
 * MyManager.inst('simulation').doSomething();
 */
export abstract class ContextSingleton<T extends ContextSingleton<T>> {
  private static _instancesMap = new Map<new () => any, Map<string, any>>();
  private static _defaultContexts = new Map<new () => any, string>();

  /** Имя контекста, в котором создан этот экземпляр */
  protected _contextName = 'main';

  public get contextName(): string {
    return this._contextName;
  }

  public static inst<T extends ContextSingleton<T>>(this: new () => T, context?: string): T {
    const defaultContext = ContextSingleton._defaultContexts.get(this) || 'main';
    const ctx = context || defaultContext;

    if (!ContextSingleton._instancesMap.has(this)) {
      ContextSingleton._instancesMap.set(this, new Map<string, T>());
    }

    const instancesMap = ContextSingleton._instancesMap.get(this) as Map<string, T>;

    if (!instancesMap.has(ctx)) {
      const instance = new this();
      instance._contextName = ctx;
      instancesMap.set(ctx, instance);
    }

    return instancesMap.get(ctx)!;
  }

  public static setInstance<T extends ContextSingleton<T>>(this: new () => T, context: string, instance: T): void {
    if (!ContextSingleton._instancesMap.has(this)) {
      ContextSingleton._instancesMap.set(this, new Map<string, T>());
    }

    const instancesMap = ContextSingleton._instancesMap.get(this) as Map<string, T>;
    instance._contextName = context;
    instancesMap.set(context, instance);
  }

  public static hasInstance<T extends ContextSingleton<T>>(this: new () => T, context?: string): boolean {
    const defaultContext = ContextSingleton._defaultContexts.get(this) || 'main';
    const ctx = context || defaultContext;

    if (!ContextSingleton._instancesMap.has(this)) {
      return false;
    }

    const instancesMap = ContextSingleton._instancesMap.get(this) as Map<string, T>;
    return instancesMap.has(ctx);
  }

  public static setDefaultContext<T extends ContextSingleton<T>>(this: new () => T, context: string): void {
    ContextSingleton._defaultContexts.set(this, context);
  }

  public static destroyInstance<T extends ContextSingleton<T>>(this: new () => T, context: string): void {
    const instancesMap = ContextSingleton._instancesMap.get(this);
    if (instancesMap) {
      instancesMap.delete(context);
    }
  }

  public static destroyAllInstances<T extends ContextSingleton<T>>(this: new () => T): void {
    ContextSingleton._instancesMap.delete(this);
    ContextSingleton._defaultContexts.delete(this);
  }
}
