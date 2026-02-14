import * as THREE from 'three';

const COLOR_FULL = 0xa0825a;
const COLOR_DAMAGED = 0x7a6040;
const COLOR_CRITICAL = 0x503828;

const FENCE_WIDTH = 4;
const FENCE_HEIGHT = 1.8;
const BAR_COUNT = 7;
const BAR_RADIUS = 0.06;
const RAIL_HEIGHT = 0.08;
const RAIL_DEPTH = 0.1;

export class FenceSection {
  mesh: THREE.Group;
  hp: number;
  maxHp: number;
  index: number;

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

    this.mesh = new THREE.Group();

    // 세로 창살
    const barGeo = new THREE.CylinderGeometry(BAR_RADIUS, BAR_RADIUS, FENCE_HEIGHT, 6);
    const spacing = FENCE_WIDTH / (BAR_COUNT + 1);
    for (let i = 1; i <= BAR_COUNT; i++) {
      const bar = new THREE.Mesh(barGeo, this.material);
      bar.position.set(-FENCE_WIDTH / 2 + spacing * i, FENCE_HEIGHT / 2, 0);
      bar.castShadow = true;
      bar.receiveShadow = true;
      this.mesh.add(bar);
    }

    // 상단 가로 레일
    const topRailGeo = new THREE.BoxGeometry(FENCE_WIDTH, RAIL_HEIGHT, RAIL_DEPTH);
    const topRail = new THREE.Mesh(topRailGeo, this.material);
    topRail.position.set(0, FENCE_HEIGHT, 0);
    topRail.castShadow = true;
    this.mesh.add(topRail);

    // 중간 가로 레일
    const midRail = new THREE.Mesh(topRailGeo, this.material);
    midRail.position.set(0, FENCE_HEIGHT * 0.5, 0);
    midRail.castShadow = true;
    this.mesh.add(midRail);

    // 하단 가로 레일
    const bottomRail = new THREE.Mesh(topRailGeo, this.material);
    bottomRail.position.set(0, 0.05, 0);
    bottomRail.castShadow = true;
    this.mesh.add(bottomRail);

    this.mesh.position.copy(position);
    this.mesh.rotation.y = rotationY;
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
