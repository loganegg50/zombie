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

// 막대 제거 순서: 양쪽 끝에서 안쪽으로
const REMOVAL_ORDER = [0, 6, 1, 5, 2, 4, 3];

export class FenceSection {
  mesh: THREE.Group;
  hp: number;
  maxHp: number;
  index: number;

  readonly worldPos: THREE.Vector3;

  private material: THREE.MeshStandardMaterial;
  private bars: THREE.Mesh[] = [];

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
      this.mesh.add(bar);
      this.bars.push(bar);
    }

    // 가로 레일 (상단, 중간, 하단)
    const railGeo = new THREE.BoxGeometry(FENCE_WIDTH, RAIL_HEIGHT, RAIL_DEPTH);
    for (const yPos of [FENCE_HEIGHT, FENCE_HEIGHT * 0.5, 0.05]) {
      const rail = new THREE.Mesh(railGeo, this.material);
      rail.position.set(0, yPos, 0);
      rail.castShadow = true;
      this.mesh.add(rail);
    }

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

    // 색상 업데이트
    if (ratio > 0.6) {
      this.material.color.setHex(COLOR_FULL);
    } else if (ratio > 0.3) {
      this.material.color.setHex(COLOR_DAMAGED);
    } else {
      this.material.color.setHex(COLOR_CRITICAL);
    }

    // 막대기 개수: HP 비율에 따라 줄어듦 (최소 1개, 0이면 전체 숨김)
    const barsToShow = Math.max(1, Math.ceil(ratio * BAR_COUNT));
    const barsToHide = BAR_COUNT - barsToShow;

    // REMOVAL_ORDER 순서대로 앞에서부터 숨기고, 나머지는 보임
    for (let i = 0; i < BAR_COUNT; i++) {
      this.bars[REMOVAL_ORDER[i]].visible = i >= barsToHide;
    }
  }
}
