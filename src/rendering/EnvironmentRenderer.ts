import * as THREE from 'three';
import type { SimulationConfig } from '@/shared/config';
import type { Shape } from '@/shared/environment';
import { OBSTACLE_COLOR, ZONE_COLOR } from './colors';

const ZONE_Y = 0.005;
const OBSTACLE_Y = 0.025;

function createShapeGeometry(shape: Shape): THREE.BufferGeometry {
  const geometry =
    shape.kind === 'circle'
      ? new THREE.CircleGeometry(shape.radius, 48)
      : new THREE.PlaneGeometry(shape.width, shape.depth);
  return geometry.rotateX(-Math.PI / 2);
}

/** Прозрачность зоны растет с плодородием */
function zoneOpacity(fertility: number): number {
  return Math.min(0.05 + 0.07 * fertility, 0.35);
}

/**
 * Отображение среды: зоны плодородия и препятствия
 */
export class EnvironmentRenderer {
  private readonly _group = new THREE.Group();
  private _key = '';

  public constructor(scene: THREE.Scene) {
    scene.add(this._group);
  }

  public setEnvironment(environment: SimulationConfig['environment']): void {
    const key = JSON.stringify([environment.obstacles, environment.zones]);
    if (key === this._key) {
      return;
    }
    this._key = key;
    this._clear();

    for (const zone of environment.zones) {
      const mesh = new THREE.Mesh(
        createShapeGeometry(zone.shape),
        new THREE.MeshBasicMaterial({
          color: ZONE_COLOR,
          transparent: true,
          opacity: zoneOpacity(zone.fertility),
          depthWrite: false,
        }),
      );
      mesh.position.set(zone.shape.x, ZONE_Y, zone.shape.z);
      mesh.renderOrder = -1;
      this._group.add(mesh);
    }

    for (const obstacle of environment.obstacles) {
      const mesh = new THREE.Mesh(createShapeGeometry(obstacle), new THREE.MeshBasicMaterial({ color: OBSTACLE_COLOR }));
      mesh.position.set(obstacle.x, OBSTACLE_Y, obstacle.z);
      this._group.add(mesh);
    }
  }

  public dispose(): void {
    this._clear();
    this._group.removeFromParent();
  }

  private _clear(): void {
    for (const child of this._group.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this._group.clear();
  }
}
