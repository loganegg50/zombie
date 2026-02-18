import * as THREE from 'three';
import { clamp } from '../utils/MathUtils';
import {
  TREE_POSITIONS, TREE_CANOPY_Y, TREE_CANOPY_RADIUS, TREE_TRUNK_RADIUS,
  RAMP_ORIGIN, RAMP_DIR, RAMP_HORIZ_LEN, RAMP_RADIUS,
} from '../core/Scene';

const PARK_HALF = 15;
const GRAVITY = -20;
const JUMP_FORCE = 10; // 최대 높이 ≈ 2.5m (나무 캐노피 도달 가능)

export class Player {
  mesh: THREE.Group;
  hp = 100;
  maxHp = 100;
  speed = 6;
  coins = 0;
  isCasting = false;

  attackCooldown = 0;

  /** 카메라 yaw 값과 동기화 (전투 판정에 사용) */
  facingAngle = 0;

  private velocityY = 0;
  private grounded = true;

  private knockbackVel = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Group();
    this.mesh.position.set(0, 0, 0);
    scene.add(this.mesh);
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  jump(): void {
    if (!this.grounded) return;
    this.velocityY = JUMP_FORCE;
    this.grounded = false;
  }

  update(moveDir: THREE.Vector3, facingAngle: number, dt: number): void {
    this.facingAngle = facingAngle;

    // 수평 이동
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      this.mesh.position.x += moveDir.x * this.speed * dt;
      this.mesh.position.z += moveDir.z * this.speed * dt;
    }

    // 수직 물리 (중력 + 점프)
    this.velocityY += GRAVITY * dt;
    this.mesh.position.y += this.velocityY * dt;

    // ── 바닥 감지 (floorY) ──
    let floorY = 0;
    this.grounded = false;

    // 나무 줄기 충돌 (수평 밀어내기, 캐노피 아래일 때만)
    for (const [tx, tz] of TREE_POSITIONS) {
      const dx = this.mesh.position.x - tx;
      const dz = this.mesh.position.z - tz;
      const distXZ = Math.sqrt(dx * dx + dz * dz);

      if (distXZ < TREE_TRUNK_RADIUS + 0.3 && this.mesh.position.y < TREE_CANOPY_Y) {
        const pushDir = distXZ > 0.01
          ? new THREE.Vector3(dx / distXZ, 0, dz / distXZ)
          : new THREE.Vector3(1, 0, 0);
        const pushDist = (TREE_TRUNK_RADIUS + 0.3) - distXZ;
        this.mesh.position.x += pushDir.x * pushDist;
        this.mesh.position.z += pushDir.z * pushDist;
      }

      // 나무 캐노피 위에 착지 — 위에서 떨어질 때만 (땅에서 순간이동 방지)
      if (distXZ < TREE_CANOPY_RADIUS * 0.85 && this.mesh.position.y >= TREE_CANOPY_Y - 0.6) {
        floorY = Math.max(floorY, TREE_CANOPY_Y);
      }
    }

    // 45° 경사로 통나무 충돌
    {
      const toX = this.mesh.position.x - RAMP_ORIGIN[0];
      const toZ = this.mesh.position.z - RAMP_ORIGIN[1];

      // 진행 방향 투영
      const proj = toX * RAMP_DIR[0] + toZ * RAMP_DIR[1];

      // 수직 방향 거리 (경사로 축과의 XZ 거리)
      const perpX = toX - proj * RAMP_DIR[0];
      const perpZ = toZ - proj * RAMP_DIR[1];
      const perpDist = Math.sqrt(perpX * perpX + perpZ * perpZ);

      if (proj >= -0.2 && proj <= RAMP_HORIZ_LEN + 0.2 && perpDist < RAMP_RADIUS + 0.5) {
        // 45°이므로 높이 = 수평 투영 거리 (tan 45° = 1)
        const rampY = Math.max(0, Math.min(proj, RAMP_HORIZ_LEN));
        floorY = Math.max(floorY, rampY);
      }
    }

    // 바닥 착지 처리
    if (this.mesh.position.y <= floorY) {
      this.mesh.position.y = floorY;
      this.velocityY = 0;
      this.grounded = true;
    }

    // 넉백
    if (this.knockbackVel.lengthSq() > 0.001) {
      this.mesh.position.add(this.knockbackVel.clone().multiplyScalar(dt));
      this.knockbackVel.multiplyScalar(0.85);
    }

    // 공원 안으로 제한
    this.mesh.position.x = clamp(this.mesh.position.x, -PARK_HALF, PARK_HALF);
    this.mesh.position.z = clamp(this.mesh.position.z, -PARK_HALF, PARK_HALF);

    // 쿨다운
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
  }

  takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
  }

  applyKnockback(dir: THREE.Vector3, force: number): void {
    this.knockbackVel.copy(dir).multiplyScalar(force);
  }
}
