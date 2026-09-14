import * as THREE from 'three';
import { FOOD_RADIUS } from '@/shared/config';
import { normalizeGene } from '@/shared/genes';
import {
  FOOD_STRIDE,
  ORGANISM_FIELD,
  ORGANISM_STRIDE,
  organismGeneField,
  type SimulationSnapshot,
} from '@/shared/snapshot';
import type { WorldPoint } from './CameraController';
import { FOOD_COLOR, PERCEPTION_COLOR, SELECTION_COLOR, sequentialColor } from './colors';
import type { ColorMode, ViewSettings } from './ViewSettings';

const LAYER_Y = { food: 0.02, perception: 0.03, organisms: 0.05, selection: 0.06 } as const;
const MIN_SNAPSHOT_INTERVAL_MS = 1000 / 60;
const MAX_SNAPSHOT_INTERVAL_MS = 250;
const INITIAL_CAPACITY = 256;

/** Тело радиуса 1 с заостренной передней частью по +X, лежит в плоскости XZ */
function createBodyGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(1.6, 0);
  shape.absarc(0, 0, 1, 0.55, Math.PI * 2 - 0.55, false);
  shape.lineTo(1.6, 0);
  // rotateX(-90°): (x, y) -> (x, 0, -y), лицевая сторона смотрит вверх на камеру
  return new THREE.ShapeGeometry(shape, 12).rotateX(-Math.PI / 2);
}

function nextCapacity(count: number): number {
  let capacity = INITIAL_CAPACITY;
  while (capacity < count) {
    capacity *= 2;
  }
  return capacity;
}

/** Матрица поворота вокруг Y на -heading с равномерным масштабом и переносом */
function writeInstanceMatrix(target: Float32Array, index: number, x: number, y: number, z: number, heading: number, scale: number): void {
  const offset = index * 16;
  const cos = Math.cos(heading) * scale;
  const sin = Math.sin(heading) * scale;
  target[offset] = cos;
  target[offset + 1] = 0;
  target[offset + 2] = sin;
  target[offset + 3] = 0;
  target[offset + 4] = 0;
  target[offset + 5] = scale;
  target[offset + 6] = 0;
  target[offset + 7] = 0;
  target[offset + 8] = -sin;
  target[offset + 9] = 0;
  target[offset + 10] = cos;
  target[offset + 11] = 0;
  target[offset + 12] = x;
  target[offset + 13] = y;
  target[offset + 14] = z;
  target[offset + 15] = 1;
}

/**
 * Отображение снимков мира: организмы и пища через InstancedMesh, интерполяция между снимками, выделение
 */
export class WorldRenderer {
  private readonly _scene: THREE.Scene;
  private readonly _settings: ViewSettings;
  private readonly _unsubscribeSettings: () => void;

  private readonly _bodyGeometry = createBodyGeometry();
  private readonly _bodyMaterial = new THREE.MeshBasicMaterial();
  private readonly _ringGeometry = new THREE.RingGeometry(0.985, 1, 64).rotateX(-Math.PI / 2);
  private readonly _perceptionMaterial = new THREE.MeshBasicMaterial({
    color: PERCEPTION_COLOR,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  private readonly _foodGeometry = new THREE.CircleGeometry(FOOD_RADIUS, 10).rotateX(-Math.PI / 2);
  private readonly _foodMaterial = new THREE.MeshBasicMaterial({ color: FOOD_COLOR });
  private readonly _selectionMesh = new THREE.Mesh(
    new THREE.RingGeometry(1.9, 2.3, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: SELECTION_COLOR }),
  );

  private _organismMesh: THREE.InstancedMesh;
  private _perceptionMesh: THREE.InstancedMesh;
  private _foodMesh: THREE.InstancedMesh;

  private _current: SimulationSnapshot | null = null;
  private _previous: SimulationSnapshot | null = null;
  /** Индекс организма в предыдущем снимке для каждого организма текущего; -1 — нет */
  private _previousIndex = new Int32Array(0);
  private _receivedAt = 0;
  private _interval = MAX_SNAPSHOT_INTERVAL_MS;
  /** Отрисованные позиции [x, z] для выбора щелчком */
  private _renderPositions = new Float32Array(0);
  private _selectedId: number | null = null;
  private _colorsDirty = false;
  private readonly _color = new THREE.Color();

  public constructor(scene: THREE.Scene, settings: ViewSettings) {
    this._scene = scene;
    this._settings = settings;

    this._organismMesh = this._createOrganismMesh(INITIAL_CAPACITY);
    this._perceptionMesh = this._createPerceptionMesh(INITIAL_CAPACITY);
    this._foodMesh = this._createFoodMesh(INITIAL_CAPACITY);

    this._selectionMesh.visible = false;
    this._selectionMesh.renderOrder = 3;
    scene.add(this._selectionMesh);

    this._unsubscribeSettings = settings.subscribe(() => {
      this._colorsDirty = true;
    });
  }

  public get selectedId(): number | null {
    return this._selectedId;
  }

  public set selectedId(id: number | null) {
    this._selectedId = id;
  }

  public setSnapshot(snapshot: SimulationSnapshot, now = performance.now()): void {
    const current = this._current;

    if (current && snapshot.step === current.step) {
      // Повтор того же шага (после команды): интерполяция продолжается без сброса времени
      this._current = snapshot;
    } else {
      this._previous = current && snapshot.step > current.step ? current : null;
      this._current = snapshot;
      if (this._previous) {
        this._interval = Math.min(Math.max(now - this._receivedAt, MIN_SNAPSHOT_INTERVAL_MS), MAX_SNAPSHOT_INTERVAL_MS);
      }
      this._receivedAt = now;
    }

    this._matchPreviousIndices();
    this._updateFood(snapshot);
    this._colorsDirty = true;
  }

  public update(now: number): void {
    const snapshot = this._current;
    if (!snapshot) {
      return;
    }

    const count = snapshot.organismIds.length;
    this._ensureOrganismCapacity(count);
    if (this._colorsDirty) {
      this._updateColors(snapshot);
      this._colorsDirty = false;
    }

    const alpha = this._previous ? Math.min(Math.max((now - this._receivedAt) / this._interval, 0), 1) : 1;
    const previous = this._previous?.organisms;
    const data = snapshot.organisms;
    const bodyMatrices = this._organismMesh.instanceMatrix.array as Float32Array;
    const ringMatrices = this._perceptionMesh.instanceMatrix.array as Float32Array;
    const perceptionField = organismGeneField('perception');
    const sizeField = organismGeneField('size');
    const selectedIndex = this._selectedId === null ? -1 : this._findIndex(snapshot, this._selectedId);

    for (let i = 0; i < count; i++) {
      const offset = i * ORGANISM_STRIDE;
      let x = data[offset + ORGANISM_FIELD.x]!;
      let z = data[offset + ORGANISM_FIELD.z]!;
      let heading = data[offset + ORGANISM_FIELD.heading]!;
      const previousIndex = this._previousIndex[i]!;

      if (previous && previousIndex >= 0 && alpha < 1) {
        const previousOffset = previousIndex * ORGANISM_STRIDE;
        const previousX = previous[previousOffset + ORGANISM_FIELD.x]!;
        const previousZ = previous[previousOffset + ORGANISM_FIELD.z]!;
        const previousHeading = previous[previousOffset + ORGANISM_FIELD.heading]!;
        const turn = Math.atan2(Math.sin(heading - previousHeading), Math.cos(heading - previousHeading));
        x = previousX + (x - previousX) * alpha;
        z = previousZ + (z - previousZ) * alpha;
        heading = previousHeading + turn * alpha;
      }

      const size = data[offset + sizeField]!;
      writeInstanceMatrix(bodyMatrices, i, x, LAYER_Y.organisms, z, heading, size);
      writeInstanceMatrix(ringMatrices, i, x, LAYER_Y.perception, z, 0, data[offset + perceptionField]!);
      this._renderPositions[i * 2] = x;
      this._renderPositions[i * 2 + 1] = z;

      if (i === selectedIndex) {
        this._selectionMesh.position.set(x, LAYER_Y.selection, z);
        this._selectionMesh.scale.setScalar(size);
      }
    }

    this._organismMesh.count = count;
    this._organismMesh.instanceMatrix.needsUpdate = true;
    this._perceptionMesh.visible = this._settings.state.showPerception;
    this._perceptionMesh.count = count;
    this._perceptionMesh.instanceMatrix.needsUpdate = true;
    this._selectionMesh.visible = selectedIndex >= 0;
  }

  /** ID организма под точкой мира с допуском tolerance или null */
  public pickOrganism(point: WorldPoint, tolerance: number): number | null {
    const snapshot = this._current;
    if (!snapshot) {
      return null;
    }

    const sizeField = organismGeneField('size');
    let pickedId: number | null = null;
    let bestDistance = Infinity;

    for (let i = 0; i < snapshot.organismIds.length; i++) {
      const distance = Math.hypot(this._renderPositions[i * 2]! - point.x, this._renderPositions[i * 2 + 1]! - point.z);
      const reach = snapshot.organisms[i * ORGANISM_STRIDE + sizeField]! * 1.6 + tolerance;
      if (distance <= reach && distance < bestDistance) {
        bestDistance = distance;
        pickedId = snapshot.organismIds[i]!;
      }
    }

    return pickedId;
  }

  public dispose(): void {
    this._unsubscribeSettings();
    for (const mesh of [this._organismMesh, this._perceptionMesh, this._foodMesh]) {
      this._scene.remove(mesh);
      mesh.dispose();
    }
    this._scene.remove(this._selectionMesh);
    this._selectionMesh.geometry.dispose();
    (this._selectionMesh.material as THREE.Material).dispose();
    this._bodyGeometry.dispose();
    this._bodyMaterial.dispose();
    this._ringGeometry.dispose();
    this._perceptionMaterial.dispose();
    this._foodGeometry.dispose();
    this._foodMaterial.dispose();
  }

  /** ID в снимках идут по возрастанию, поэтому соответствие находится за один проход */
  private _matchPreviousIndices(): void {
    const currentIds = this._current!.organismIds;
    const previousIds = this._previous?.organismIds;

    if (this._previousIndex.length < currentIds.length) {
      this._previousIndex = new Int32Array(nextCapacity(currentIds.length));
    }

    let j = 0;
    for (let i = 0; i < currentIds.length; i++) {
      const id = currentIds[i]!;
      if (!previousIds) {
        this._previousIndex[i] = -1;
        continue;
      }
      while (j < previousIds.length && previousIds[j]! < id) {
        j++;
      }
      this._previousIndex[i] = j < previousIds.length && previousIds[j] === id ? j : -1;
    }
  }

  /** Двоичный поиск по возрастающим ID */
  private _findIndex(snapshot: SimulationSnapshot, id: number): number {
    const ids = snapshot.organismIds;
    let low = 0;
    let high = ids.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const value = ids[middle]!;
      if (value === id) {
        return middle;
      }
      if (value < id) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return -1;
  }

  private _updateColors(snapshot: SimulationSnapshot): void {
    const mode: ColorMode = this._settings.state.colorMode;
    const field = mode === 'energy' ? ORGANISM_FIELD.energyRatio : organismGeneField(mode);
    const colors = this._organismMesh.instanceColor!.array as Float32Array;

    for (let i = 0; i < snapshot.organismIds.length; i++) {
      const value = snapshot.organisms[i * ORGANISM_STRIDE + field]!;
      sequentialColor(mode === 'energy' ? value : normalizeGene(mode, value), this._color);
      colors[i * 3] = this._color.r;
      colors[i * 3 + 1] = this._color.g;
      colors[i * 3 + 2] = this._color.b;
    }
    this._organismMesh.instanceColor!.needsUpdate = true;
  }

  private _updateFood(snapshot: SimulationSnapshot): void {
    const count = snapshot.food.length / FOOD_STRIDE;
    if (count > this._foodMesh.instanceMatrix.count) {
      this._replaceMesh(this._foodMesh, (this._foodMesh = this._createFoodMesh(nextCapacity(count))));
    }

    const matrices = this._foodMesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < count; i++) {
      writeInstanceMatrix(matrices, i, snapshot.food[i * FOOD_STRIDE]!, LAYER_Y.food, snapshot.food[i * FOOD_STRIDE + 1]!, 0, 1);
    }
    this._foodMesh.count = count;
    this._foodMesh.instanceMatrix.needsUpdate = true;
  }

  private _ensureOrganismCapacity(count: number): void {
    if (count <= this._organismMesh.instanceMatrix.count) {
      return;
    }
    const capacity = nextCapacity(count);
    this._replaceMesh(this._organismMesh, (this._organismMesh = this._createOrganismMesh(capacity)));
    this._replaceMesh(this._perceptionMesh, (this._perceptionMesh = this._createPerceptionMesh(capacity)));
    this._colorsDirty = true;
  }

  private _replaceMesh(oldMesh: THREE.InstancedMesh, newMesh: THREE.InstancedMesh): void {
    this._scene.remove(oldMesh);
    oldMesh.dispose();
    this._scene.add(newMesh);
  }

  private _createOrganismMesh(capacity: number): THREE.InstancedMesh {
    const mesh = this._createInstancedMesh(this._bodyGeometry, this._bodyMaterial, capacity, 2);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this._renderPositions = new Float32Array(capacity * 2);
    return mesh;
  }

  private _createPerceptionMesh(capacity: number): THREE.InstancedMesh {
    return this._createInstancedMesh(this._ringGeometry, this._perceptionMaterial, capacity, 1);
  }

  private _createFoodMesh(capacity: number): THREE.InstancedMesh {
    return this._createInstancedMesh(this._foodGeometry, this._foodMaterial, capacity, 0);
  }

  private _createInstancedMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
    renderOrder: number,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    // Экземпляры постоянно перемещаются: общий ограничивающий объем не пересчитывается
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    this._scene.add(mesh);
    return mesh;
  }
}
