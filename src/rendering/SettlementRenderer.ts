import * as THREE from 'three';
import type { SettlementPoint, SettlementState } from '@/shared/settlement';

export class SettlementRenderer {
  private readonly _group = new THREE.Group();
  private readonly _meshes = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>();
  private _state: SettlementState | undefined;
  public selected = 'person';

  public constructor(scene: THREE.Scene) { scene.add(this._group); }

  public setState(state: SettlementState | undefined): void {
    this._state = state;
    this._group.visible = !!state;
    if (!state) return;
    const seen = new Set<string>();
    const draw = (id: string, point: SettlementPoint, color: number, size: number, square = false) => {
      seen.add(id);
      let mesh = this._meshes.get(id);
      if (!mesh) {
        const geometry = square ? new THREE.PlaneGeometry(1, 1) : new THREE.CircleGeometry(1, 20);
        mesh = new THREE.Mesh(geometry.rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial());
        this._meshes.set(id, mesh); this._group.add(mesh);
      }
      mesh.position.set(point.x, id === 'person' ? 0.12 : 0.08, point.z);
      mesh.scale.setScalar(size);
      mesh.material.color.setHex(color);
    };
    draw('store', state.store, 0x966437, 5, true);
    for (const bush of state.bushes) draw(`bush:${bush.id}`, bush, bush.berries ? 0x256f3d : 0x77715b, 1.8);
    draw('person', state.person, 0xffd45b, 1);
    const chosen = this.selected === 'person' ? state.person : this.selected === 'store' ? state.store
      : state.bushes.find((b) => `bush:${b.id}` === this.selected);
    if (chosen) draw('selection', chosen, 0xffffff, 3.2);
    const ring = this._meshes.get('selection');
    if (ring) {
      if (!(ring.geometry instanceof THREE.RingGeometry)) {
        ring.geometry.dispose(); ring.geometry = new THREE.RingGeometry(0.92, 1, 32).rotateX(-Math.PI / 2);
      }
      ring.position.y = 0.15;
    }
    for (const [id, mesh] of this._meshes) mesh.visible = seen.has(id);
  }

  public pick(point: SettlementPoint, tolerance: number): string | null {
    if (!this._state) return null;
    const { person, store, bushes } = this._state;
    const candidates = [
      { ...person, id: 'person', radius: 1 },
      { ...store, id: 'store', radius: 3 },
      ...bushes.map((b) => ({ ...b, id: `bush:${b.id}`, radius: 1.8 })),
    ];
    return candidates.find((p) => Math.hypot(point.x - p.x, point.z - p.z) <= p.radius + tolerance)?.id ?? null;
  }

  public dispose(): void {
    for (const mesh of this._meshes.values()) { mesh.geometry.dispose(); mesh.material.dispose(); }
    this._meshes.clear(); this._group.removeFromParent();
  }
}
