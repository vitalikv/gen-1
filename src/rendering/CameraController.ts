import { OrthographicCamera, Vector3 } from 'three';

export interface WorldPoint {
  x: number;
  z: number;
}

/** Смещение указателя, после которого нажатие считается перетаскиванием */
const DRAG_THRESHOLD_PX = 4;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 30;
const ZOOM_SPEED = 0.0015;

/**
 * Перемещение и масштабирование ортографической камеры сверху; щелчок без перетаскивания — выбор точки мира
 */
export class CameraController {
  private readonly _camera: OrthographicCamera;
  private readonly _element: HTMLElement;
  private readonly _onClick: (point: WorldPoint) => void;
  private readonly _vector = new Vector3();
  private _pointerId: number | null = null;
  private _startX = 0;
  private _startY = 0;
  private _lastX = 0;
  private _lastY = 0;
  private _dragging = false;

  public constructor(camera: OrthographicCamera, element: HTMLElement, onClick: (point: WorldPoint) => void) {
    this._camera = camera;
    this._element = element;
    this._onClick = onClick;

    element.addEventListener('pointerdown', this._onPointerDown);
    element.addEventListener('pointermove', this._onPointerMove);
    element.addEventListener('pointerup', this._onPointerUp);
    element.addEventListener('pointercancel', this._onPointerCancel);
    element.addEventListener('wheel', this._onWheel, { passive: false });
    element.style.touchAction = 'none';
  }

  public dispose(): void {
    this._element.removeEventListener('pointerdown', this._onPointerDown);
    this._element.removeEventListener('pointermove', this._onPointerMove);
    this._element.removeEventListener('pointerup', this._onPointerUp);
    this._element.removeEventListener('pointercancel', this._onPointerCancel);
    this._element.removeEventListener('wheel', this._onWheel);
  }

  /** Сколько единиц мира приходится на один CSS-пиксель */
  public worldUnitsPerPixel(): number {
    return (this._camera.right - this._camera.left) / this._camera.zoom / Math.max(this._element.clientWidth, 1);
  }

  /** Точка мира под координатами клиента */
  public toWorld(clientX: number, clientY: number): WorldPoint {
    const rect = this._element.getBoundingClientRect();
    this._vector
      .set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, 0)
      .unproject(this._camera);
    return { x: this._vector.x, z: this._vector.z };
  }

  private readonly _onPointerDown = (event: PointerEvent): void => {
    if (this._pointerId !== null || event.button !== 0) {
      return;
    }
    this._pointerId = event.pointerId;
    this._startX = this._lastX = event.clientX;
    this._startY = this._lastY = event.clientY;
    this._dragging = false;
    this._element.setPointerCapture(event.pointerId);
  };

  private readonly _onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) {
      return;
    }

    if (!this._dragging) {
      this._dragging = Math.hypot(event.clientX - this._startX, event.clientY - this._startY) > DRAG_THRESHOLD_PX;
    }

    if (this._dragging) {
      // Правая сторона экрана — +X мира, верх — -Z
      const worldPerPixel = this.worldUnitsPerPixel();
      this._camera.position.x -= (event.clientX - this._lastX) * worldPerPixel;
      this._camera.position.z -= (event.clientY - this._lastY) * worldPerPixel;
      this._element.style.cursor = 'grabbing';
    }

    this._lastX = event.clientX;
    this._lastY = event.clientY;
  };

  private readonly _onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) {
      return;
    }
    if (!this._dragging) {
      this._onClick(this.toWorld(event.clientX, event.clientY));
    }
    this._onPointerCancel(event);
  };

  private readonly _onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) {
      return;
    }
    if (this._element.hasPointerCapture(event.pointerId)) {
      this._element.releasePointerCapture(event.pointerId);
    }
    this._pointerId = null;
    this._dragging = false;
    this._element.style.cursor = '';
  };

  /** Масштабирование к точке под курсором */
  private readonly _onWheel = (event: WheelEvent): void => {
    event.preventDefault();

    const before = this.toWorld(event.clientX, event.clientY);
    const zoom = this._camera.zoom * Math.exp(-event.deltaY * ZOOM_SPEED);
    this._camera.zoom = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
    this._camera.updateProjectionMatrix();
    const after = this.toWorld(event.clientX, event.clientY);

    this._camera.position.x += before.x - after.x;
    this._camera.position.z += before.z - after.z;
  };
}
