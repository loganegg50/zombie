import * as THREE from 'three';

const COLOR_FULL = 0xa0825a;
const COLOR_DAMAGED = 0x7a6040;
const COLOR_CRITICAL = 0x503828;

export class FenceSection {
  mesh: THREE.Mesh;
  hp: number;
  maxHp: number;
  index: number;

  // Centre position on the XZ plane
  readonly worldPos: THREE.Vector3;

  private material: THREE.MeshStandardMaterial;

  constructor(
    index: number,
    position: THREE.Vector3,
    rotationY: number,
    maxHp: number,
    scene: THREE.Scene,
  ) {
    this.index = index;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.worldPos = position.clone();

    this.material = new THREE.MeshStandardMaterial({ color: COLOR_FULL });
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(4, 1.8, 0.25),
      this.material,
    );
    this.mesh.position.copy(position);
    this.mesh.position.y = 0.9;
    this.mesh.rotation.y = rotationY;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  get hpRatio(): number {
    return this.hp / this.maxHp;
  }

  get isDestroyed(): boolean {
    return this.hp <= 0;
  }

  takeDamage(amount: number): boolean {
    if (this.hp <= 0) return true;
    this.hp = Math.max(0, this.hp - amount);
    this.updateVisual();
    return this.hp <= 0;
  }

  repair(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.updateVisual();
  }

  /** 세이브 복원용 — HP를 직접 설정하고 비주얼 갱신 */
  restoreHp(value: number): void {
    this.hp = Math.max(0, Math.min(this.maxHp, value));
    this.updateVisual();
  }

  private updateVisual(): void {
    const ratio = this.hpRatio;
    if (ratio <= 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    if (ratio > 0.6) {
      this.material.color.setHex(COLOR_FULL);
      this.mesh.scale.set(1, 1, 1);
    } else if (ratio > 0.3) {
      this.material.color.setHex(COLOR_DAMAGED);
      this.mesh.scale.set(1, 0.85, 1);
    } else {
      this.material.color.setHex(COLOR_CRITICAL);
      this.mesh.scale.set(1, 0.65, 1);
    }
  }
}
