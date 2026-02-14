import * as THREE from 'three';
import { clamp } from '../utils/MathUtils';
import { TREE_POSITIONS, TREE_CANOPY_Y, TREE_CANOPY_RADIUS, TREE_TRUNK_RADIUS } from '../core/Scene';

const PARK_HALF = 15;
const GRAVITY = -20;
const JUMP_FORCE = 8;

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

  // 점프
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

    // 수직 (점프) 물리
    this.velocityY += GRAVITY * dt;
    this.mesh.position.y += this.velocityY * dt;

    // 나무 위 충돌 체크 — 나무 잎 위에 착지 가능
    let floorY = 0;
    for (const [tx, tz] of TREE_POSITIONS) {
      const dx = this.mesh.position.x - tx;
      const dz = this.mesh.position.z - tz;
      const distXZ = Math.sqrt(dx * dx + dz * dz);

      // 나무 줄기 충돌 (수평 밀어내기, 나무 위에 있지 않을 때만)
      if (distXZ < TREE_TRUNK_RADIUS + 0.3 && this.mesh.position.y < TREE_CANOPY_Y) {
        const pushDir = distXZ > 0.01
          ? new THREE.Vector3(dx / distXZ, 0, dz / distXZ)
          : new THREE.Vector3(1, 0, 0);
        const pushDist = (TREE_TRUNK_RADIUS + 0.3) - distXZ;
        this.mesh.position.x += pushDir.x * pushDist;
        this.mesh.position.z += pushDir.z * pushDist;
      }

      // 나무 잎 위에 올라서기
      if (distXZ < TREE_CANOPY_RADIUS * 0.85) {
        floorY = Math.max(floorY, TREE_CANOPY_Y);
      }
    }

    if (this.mesh.position.y <= floorY) {
      this.mesh.position.y = floorY;
      this.velocityY = 0;
      this.grounded = true;
    }

    // 넉백 적용
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
