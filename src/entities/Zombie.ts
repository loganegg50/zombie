import * as THREE from 'three';
import { ZombieState, type Poolable } from '../types';
import type { FenceSection } from './FenceSection';

export class Zombie implements Poolable {
  mesh: THREE.Group;
  active = false;

  // Stats (set on spawn from config * wave multipliers)
  hp = 30;
  maxHp = 30;
  speed = 1.5;
  damage = 5;       // damage to player
  fenceDamage = 10;  // damage to fence
  attackRate = 1.5;
  coinValue = 10;
  zombieType = 'normal';
  canPassDamagedFence = false;

  // AI
  state = ZombieState.SPAWNING;
  targetFence: FenceSection | null = null;
  attackTimer = 0;
  stateTimer = 0;

  // Knockback
  knockbackVel = new THREE.Vector3();

  // Death fall
  dyingVelY = 0;
  dyingTip = 0;       // 현재 기울기 [0, PI/2]
  dyingTipDir = 1;    // 쓰러지는 방향 (+1 왼쪽, -1 오른쪽)

  // Burn (발화 인첸트)
  burnTimer = 0;
  burnDps = 0;

  // Visual
  private bodyMesh: THREE.Mesh;
  private bodyMat: THREE.MeshStandardMaterial;
  private originalColor = 0x556b2f;
  private flashTimer = 0;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Group();

    // Body
    this.bodyMat = new THREE.MeshStandardMaterial({ color: this.originalColor });
    this.bodyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 1.3, 0.4),
      this.bodyMat,
    );
    this.bodyMesh.position.y = 0.75;
    this.bodyMesh.castShadow = true;
    this.mesh.add(this.bodyMesh);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b7a3f }),
    );
    head.position.y = 1.65;
    head.castShadow = true;
    this.mesh.add(head);

    // Arms
    const armMat = new THREE.MeshStandardMaterial({ color: 0x556b2f });
    const armGeo = new THREE.BoxGeometry(0.14, 0.6, 0.14);
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.45, 0.9, -0.2);
    leftArm.rotation.x = -0.5;
    this.mesh.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.45, 0.9, -0.2);
    rightArm.rotation.x = -0.5;
    this.mesh.add(rightArm);

    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  reset(): void {
    this.hp = this.maxHp;
    this.state = ZombieState.SPAWNING;
    this.targetFence = null;
    this.attackTimer = 0;
    this.stateTimer = 0;
    this.knockbackVel.set(0, 0, 0);
    this.flashTimer = 0;
    this.bodyMat.color.setHex(this.originalColor);
    this.dyingVelY = 0;
    this.dyingTip = 0;
    this.dyingTipDir = 1;
    this.burnTimer = 0;
    this.burnDps = 0;
    this.zombieType = 'normal';
    this.canPassDamagedFence = false;
    this.mesh.rotation.x = 0;
    this.mesh.rotation.z = 0;
    this.mesh.scale.set(1, 1, 1);
  }

  startDying(): void {
    this.dyingVelY = 0;
    this.dyingTip = 0;
    this.dyingTipDir = Math.random() > 0.5 ? 1 : -1;
  }

  spawn(
    x: number, z: number, hp: number, speed: number, coinValue: number,
    config?: { id: string; damage: number; fenceDamage: number; attackRate: number; bodyColor: string; headColor?: string; scale: number; canPassDamagedFence?: boolean },
  ): void {
    this.mesh.position.set(x, 0, z);
    this.maxHp = hp;
    this.hp = hp;
    this.speed = speed;
    this.coinValue = coinValue;
    this.state = ZombieState.SPAWNING;
    this.stateTimer = 0.5;

    if (config) {
      this.zombieType = config.id;
      this.damage = config.damage;
      this.fenceDamage = config.fenceDamage;
      this.attackRate = config.attackRate;
      this.canPassDamagedFence = config.canPassDamagedFence ?? false;
      const scale = config.scale;
      this.mesh.scale.set(scale, scale, scale);
      const bodyColor = parseInt(config.bodyColor);
      const headColor = parseInt(config.headColor ?? config.bodyColor);
      this.originalColor = bodyColor;
      this.bodyMat.color.setHex(bodyColor);
      // head (index 1) 색상
      const headMesh = this.mesh.children[1] as THREE.Mesh;
      if (headMesh) (headMesh.material as THREE.MeshStandardMaterial).color.setHex(headColor);
      // arm 색상 (index 2, 3)
      for (let i = 2; i <= 3; i++) {
        const arm = this.mesh.children[i] as THREE.Mesh;
        if (arm) (arm.material as THREE.MeshStandardMaterial).color.setHex(bodyColor);
      }
    }
  }

  flashDamage(): void {
    this.flashTimer = 0.1;
    this.bodyMat.color.setHex(0xff2222);
  }

  updateFlash(dt: number): void {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.bodyMat.color.setHex(
          this.burnTimer > 0 ? 0xff6600 : this.originalColor,
        );
      }
    }
  }

  /** 화상 데미지 틱. 사망 시 true 반환 */
  updateBurn(dt: number): boolean {
    if (this.burnTimer <= 0) return false;
    this.burnTimer -= dt;
    this.hp -= this.burnDps * dt;
    // 오렌지 플래시 (flashTimer가 없을 때만)
    if (this.flashTimer <= 0) {
      this.bodyMat.color.setHex(0xff6600);
    }
    if (this.burnTimer <= 0) {
      this.burnTimer = 0;
      this.burnDps = 0;
      if (this.flashTimer <= 0) {
        this.bodyMat.color.setHex(this.originalColor);
      }
    }
    return this.hp <= 0;
  }
}
