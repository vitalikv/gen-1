import * as THREE from 'three';
import { ContextSingleton } from '@/core/ContextSingleton';

export interface WorldBounds {
  width: number;
  depth: number;
}

export type FrameListener = (now: number) => void;

/** Запас вокруг границ мира в кадре */
const VIEW_PADDING = 1.1;

/**
 * Three.js: сцена, ортографическая камера сверху, освещение и цикл отображения
 */
export class SceneManager extends ContextSingleton<SceneManager> {
  private _renderer: THREE.WebGLRenderer | null = null;
  private _resizeObserver: ResizeObserver | null = null;
  private _container: HTMLElement | null = null;
  private _bounds: WorldBounds = { width: 1, depth: 1 };
  private readonly _boundsGroup = new THREE.Group();
  private readonly _frameListeners = new Set<FrameListener>();

  public readonly scene = new THREE.Scene();
  public readonly camera = new THREE.OrthographicCamera();

  public get canvas(): HTMLCanvasElement {
    if (!this._renderer) {
      throw new Error('SceneManager: не инициализирован');
    }
    return this._renderer.domElement;
  }

  public init(container: HTMLElement, bounds: WorldBounds): void {
    if (this._renderer) {
      return;
    }

    this._container = container;
    this._bounds = bounds;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    this._renderer = renderer;

    this.scene.background = new THREE.Color(0xffffff);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1));

    // Мир лежит в плоскости XZ, камера смотрит вниз вдоль -Y
    this.camera.position.set(0, 100, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
    this.camera.near = 0.1;
    this.camera.far = 1000;

    this.scene.add(this._boundsGroup);
    this._addWorldBounds(bounds);

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(container);
    this._resize();

    renderer.setAnimationLoop((now) => {
      for (const listener of this._frameListeners) {
        listener(now);
      }
      renderer.render(this.scene, this.camera);
    });
  }

  /** Вызывается перед отрисовкой каждого кадра */
  public onFrame(listener: FrameListener): () => void {
    this._frameListeners.add(listener);
    return () => this._frameListeners.delete(listener);
  }

  public setWorldBounds(bounds: WorldBounds): void {
    if (bounds.width === this._bounds.width && bounds.depth === this._bounds.depth) return;
    for (const child of this._boundsGroup.children) {
      const object = child as THREE.Mesh;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    }
    this._boundsGroup.clear(); this._bounds = { ...bounds };
    this._addWorldBounds(bounds);
    this.camera.position.set(0, 100, 0); this.camera.zoom = 1;
    this._resize();
  }

  public dispose(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._frameListeners.clear();

    if (this._renderer) {
      this._renderer.setAnimationLoop(null);
      this._renderer.domElement.remove();
      this._renderer.dispose();
      this._renderer = null;
    }

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
    this.scene.clear();
    this._container = null;
  }

  private _addWorldBounds(bounds: WorldBounds): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(bounds.width, bounds.depth),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    ground.rotation.x = -Math.PI / 2;
    this._boundsGroup.add(ground);

    const grid = new THREE.GridHelper(Math.max(bounds.width, bounds.depth), 20, 0xc8c8c8, 0xe2e2e2);
    grid.position.y = 0.01;
    this._boundsGroup.add(grid);
  }

  private _resize(): void {
    if (!this._renderer || !this._container) {
      return;
    }

    const width = Math.max(this._container.clientWidth, 1);
    const height = Math.max(this._container.clientHeight, 1);
    const aspect = width / height;

    // Вписываем границы мира в кадр при любом соотношении сторон
    const viewDepth = Math.max(this._bounds.depth, this._bounds.width / aspect) * VIEW_PADDING;
    const viewWidth = viewDepth * aspect;

    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewDepth / 2;
    this.camera.bottom = -viewDepth / 2;
    this.camera.updateProjectionMatrix();

    this._renderer.setSize(width, height);
  }
}
