const DISPLAY_MS = 4000;

/**
 * Короткие уведомления о результатах действий и ошибках
 */
export class Notifier {
  private readonly _root: HTMLElement;

  public constructor(container: HTMLElement) {
    this._root = document.createElement('div');
    this._root.className = 'notifier';
    this._root.setAttribute('role', 'status');
    this._root.setAttribute('aria-live', 'polite');
    container.appendChild(this._root);
  }

  public show(message: string, kind: 'info' | 'error' = 'info'): void {
    const item = document.createElement('div');
    item.className = `notifier__item notifier__item--${kind}`;
    item.textContent = message;
    this._root.appendChild(item);
    setTimeout(() => item.remove(), DISPLAY_MS);
  }

  public dispose(): void {
    this._root.remove();
  }
}
