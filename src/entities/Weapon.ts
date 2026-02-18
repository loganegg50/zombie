import * as THREE from 'three';
import type { WeaponConfig } from '../types';

const SKIN = 0xffccaa;
const SLEEVE = 0x3366cc;

export class Weapon {
  viewModel: THREE.Group;

  id: string;
  name: string;
  type: 'melee' | 'ranged';
  damage: number;
  range: number;
  swingSpeed: number;
  knockback: number;
  arc: number;
  pellets: number;

  isSwinging = false;
  swingProgress = 0;

  isShooting = false;
  shootProgress = 0;

  private idlePos = new THREE.Vector3();
  private idleRot = new THREE.Euler();
  private pivot: THREE.Group;

  constructor(config: WeaponConfig) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type ?? 'melee';
    this.damage = config.damage;
    this.range = config.range;
    this.swingSpeed = config.swingSpeed;
    this.knockback = config.knockback;
    this.arc = config.arc;
    this.pellets = config.pellets ?? 1;

    this.viewModel = new THREE.Group();
    this.pivot = new THREE.Group();
    this.viewModel.add(this.pivot);

    if (this.type === 'ranged') {
      this.buildGunModel(config.id);
      this.idlePos.set(0.3, -0.36, -0.56);
      this.idleRot.set(0, 0, 0.04);
    } else {
      this.buildMeleeModel(config.id);
      this.idlePos.set(0.45, -0.45, -0.65);
      this.idleRot.set(-0.3, -0.2, -0.15);
    }

    this.viewModel.position.copy(this.idlePos);
    this.pivot.rotation.copy(this.idleRot);
  }

  private mat(color: number, metalness = 0, roughness = 0.7): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness });
  }

  private buildMeleeModel(id: string): void {
    const g = new THREE.Group();

    if (id === 'axe') {
      // 도끼머리 (넓고 납작한 금속판)
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.46, 0.05),
        this.mat(0x8899aa, 0.85, 0.2),
      );
      head.position.set(0.06, 0.62, 0);
      g.add(head);
      // 날 끝 (약간 더 밝게)
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.44, 0.03),
        this.mat(0xaabbcc, 0.95, 0.1),
      );
      edge.position.set(0.32, 0.62, 0);
      g.add(edge);
      // 자루
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 1.0, 0.06),
        this.mat(0x5a3318),
      );
      pole.position.y = 0.05;
      g.add(pole);
    } else if (id === 'spear') {
      // 자루 (길고 얇음)
      const shaft = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 1.6, 0.05),
        this.mat(0x6b4226),
      );
      shaft.position.y = 0.3;
      g.add(shaft);
      // 촉 (원뿔형 팁)
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.05, 0.28, 4),
        this.mat(0xccddee, 0.9, 0.1),
      );
      tip.position.y = 1.24;
      g.add(tip);
    } else {
      // 일반 칼날 무기 (나무검, 단검, 철검, 대검)
      let bladeW = 0.07, bladeH = 1.0, bladeD = 0.04;
      let bladeColor = 0xccccdd, bladeMetal = 0.8, bladeRough = 0.2;
      let guardW = 0.22, guardColor = 0x886633;
      let handleColor = 0x5a3318;

      switch (id) {
        case 'wooden_sword':
          bladeH = 0.85; bladeW = 0.08; bladeColor = 0x8b6914;
          bladeMetal = 0.0; bladeRough = 0.8;
          guardW = 0.16; guardColor = 0x6b4226; handleColor = 0x4a2f1a;
          break;
        case 'dagger':
          bladeH = 0.55; bladeW = 0.05; bladeD = 0.025;
          bladeColor = 0xdde0ee; bladeMetal = 0.95; bladeRough = 0.05;
          guardW = 0.12; guardColor = 0x888899;
          break;
        case 'great_sword':
          bladeW = 0.14; bladeH = 1.4; bladeD = 0.06;
          bladeColor = 0x8888aa; bladeMetal = 0.9; bladeRough = 0.15;
          guardW = 0.3;
          break;
      }

      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(bladeW, bladeH, bladeD),
        this.mat(bladeColor, bladeMetal, bladeRough),
      );
      blade.position.y = bladeH / 2 + 0.08;
      g.add(blade);

      const guard = new THREE.Mesh(
        new THREE.BoxGeometry(guardW, 0.05, 0.06),
        this.mat(guardColor, 0.5, 0.4),
      );
      guard.position.y = 0.05;
      g.add(guard);

      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.28, 0.05),
        this.mat(handleColor),
      );
      handle.position.y = -0.12;
      g.add(handle);
    }

    // 손 + 팔뚝 (모든 근접 무기 공통)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.14), this.mat(SKIN));
    hand.position.set(0, -0.12, 0.02);
    g.add(hand);

    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.35, 0.11), this.mat(SLEEVE));
    forearm.position.set(0, -0.38, 0.05);
    g.add(forearm);

    this.pivot.add(g);
  }

  private buildGunModel(id: string): void {
    const g = new THREE.Group();

    let bodyL = 0.30, bodyH = 0.11, bodyW = 0.075;
    let barrelL = 0.20, barrelD = 0.038;
    let gripH = 0.20;
    let bodyColor = 0x282828;
    let barrelColor = 0x1a1a1a;
    let hasScope = false;
    let hasPump = false;

    switch (id) {
      case 'pistol':
        bodyL = 0.26; bodyH = 0.10; bodyW = 0.068;
        barrelL = 0.16; barrelD = 0.032;
        gripH = 0.17;
        bodyColor = 0x252525;
        break;
      case 'shotgun':
        bodyL = 0.36; bodyH = 0.13; bodyW = 0.1;
        barrelL = 0.30; barrelD = 0.055;
        gripH = 0.22;
        bodyColor = 0x5c3a1e;  // 목재 색
        barrelColor = 0x2a2a2a;
        hasPump = true;
        break;
      case 'sniper':
        bodyL = 0.44; bodyH = 0.10; bodyW = 0.07;
        barrelL = 0.48; barrelD = 0.032;
        gripH = 0.22;
        bodyColor = 0x1e1e1e;
        hasScope = true;
        break;
    }

    // 총몸 (body / slide) — -Z 방향이 앞
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(bodyW, bodyH, bodyL),
      this.mat(bodyColor, 0.7, 0.3),
    );
    body.position.set(0, 0, -bodyL / 2);
    g.add(body);

    // 총열 (barrel)
    const barrel = new THREE.Mesh(
      new THREE.BoxGeometry(barrelD, barrelD, barrelL),
      this.mat(barrelColor, 0.8, 0.2),
    );
    barrel.position.set(0, bodyH * 0.1, -bodyL - barrelL / 2);
    g.add(barrel);

    // 손잡이 (grip)
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(bodyW * 0.85, gripH, 0.08),
      this.mat(id === 'shotgun' ? 0x4a2f1a : 0x161616),
    );
    grip.position.set(0, -gripH / 2 - bodyH * 0.15, -bodyL * 0.35);
    grip.rotation.x = -0.12;
    g.add(grip);

    // 방아쇠울
    const tg = new THREE.Mesh(
      new THREE.BoxGeometry(bodyW * 0.6, 0.012, 0.09),
      this.mat(barrelColor),
    );
    tg.position.set(0, -bodyH * 0.5 - 0.015, -bodyL * 0.42);
    g.add(tg);

    // 스코프 (저격총)
    if (hasScope) {
      const scopeTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.024, 0.24, 8),
        this.mat(0x111111, 0.7, 0.3),
      );
      scopeTube.rotation.x = Math.PI / 2;
      scopeTube.position.set(0, bodyH * 0.75, -bodyL * 0.52);
      g.add(scopeTube);

      // 스코프 마운트 2개
      for (const zOff of [-0.07, 0.07]) {
        const mount = new THREE.Mesh(
          new THREE.BoxGeometry(bodyW * 0.45, bodyH * 0.75, 0.025),
          this.mat(0x222222),
        );
        mount.position.set(0, bodyH * 0.38, -bodyL * 0.52 + zOff);
        g.add(mount);
      }
    }

    // 펌프 (샷건)
    if (hasPump) {
      const pump = new THREE.Mesh(
        new THREE.BoxGeometry(barrelD + 0.045, barrelD + 0.045, 0.12),
        this.mat(0x5c3a1e),
      );
      pump.position.set(0, bodyH * 0.1, -bodyL - barrelL * 0.38);
      g.add(pump);
    }

    // 손 + 팔뚝
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.14), this.mat(SKIN));
    hand.position.set(0, -gripH * 0.28, -bodyL * 0.35);
    g.add(hand);

    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.35, 0.11), this.mat(SLEEVE));
    forearm.position.set(0, -gripH * 0.28 - 0.26, -bodyL * 0.30);
    g.add(forearm);

    this.pivot.add(g);
  }

  applyConfig(config: WeaponConfig, level: number): void {
    this.damage = config.damage;
    this.range = config.range;
    this.swingSpeed = config.swingSpeed;
    this.knockback = config.knockback;
    this.arc = config.arc;
    this.pellets = config.pellets ?? 1;

    for (const upg of config.upgrades) {
      if (upg.level <= level) {
        this.damage = upg.damage;
        this.range = upg.range;
        if (upg.swingSpeed !== undefined) this.swingSpeed = upg.swingSpeed;
        if (upg.knockback !== undefined) this.knockback = upg.knockback;
        if (upg.arc !== undefined) this.arc = upg.arc;
        if (upg.pellets !== undefined) this.pellets = upg.pellets;
      }
    }
  }

  // ── 통합 공격 API ──

  startAttack(): void {
    if (this.type === 'ranged') {
      this.startShoot();
    } else {
      this.startSwing();
    }
  }

  /** 공격 애니메이션 업데이트. 히트 프레임에서 true 반환 */
  updateAttack(dt: number): boolean {
    if (this.type === 'ranged') {
      return this.updateShoot(dt);
    } else {
      return this.updateSwing(dt);
    }
  }

  // ── 근접: 스윙 ──

  startSwing(): void {
    if (this.isSwinging) return;
    this.isSwinging = true;
    this.swingProgress = 0;
  }

  updateSwing(dt: number): boolean {
    if (!this.isSwinging) {
      const t = Date.now() * 0.002;
      this.viewModel.position.x = this.idlePos.x + Math.sin(t) * 0.008;
      this.viewModel.position.y = this.idlePos.y + Math.sin(t * 1.3) * 0.006;
      return false;
    }

    this.swingProgress += dt / this.swingSpeed;
    const t = Math.min(this.swingProgress, 1);

    if (t < 0.2) {
      const p = t / 0.2;
      this.pivot.rotation.set(
        this.idleRot.x + p * 0.5,
        this.idleRot.y + p * 0.6,
        this.idleRot.z - p * 0.3,
      );
      this.viewModel.position.set(
        this.idlePos.x + p * 0.08,
        this.idlePos.y + p * 0.1,
        this.idlePos.z,
      );
    } else if (t < 0.55) {
      const p = (t - 0.2) / 0.35;
      const ease = 1 - (1 - p) * (1 - p);
      this.pivot.rotation.set(
        this.idleRot.x + 0.5 - ease * 1.2,
        this.idleRot.y + 0.6 - ease * 1.5,
        this.idleRot.z - 0.3 + ease * 0.8,
      );
      this.viewModel.position.set(
        this.idlePos.x + 0.08 - ease * 0.25,
        this.idlePos.y + 0.1 - ease * 0.15,
        this.idlePos.z - ease * 0.12,
      );
    } else {
      const p = (t - 0.55) / 0.45;
      const ease = p * p;
      this.pivot.rotation.set(
        this.idleRot.x - 0.7 * (1 - ease),
        this.idleRot.y - 0.9 * (1 - ease),
        this.idleRot.z + 0.5 * (1 - ease),
      );
      this.viewModel.position.set(
        this.idlePos.x - 0.17 * (1 - ease),
        this.idlePos.y - 0.05 * (1 - ease),
        this.idlePos.z - 0.12 * (1 - ease),
      );
    }

    const hitFrame = this.swingProgress >= 0.4 && this.swingProgress - dt / this.swingSpeed < 0.4;

    if (t >= 1) {
      this.isSwinging = false;
      this.swingProgress = 0;
      this.pivot.rotation.copy(this.idleRot);
      this.viewModel.position.copy(this.idlePos);
    }

    return hitFrame;
  }

  // ── 원거리: 발사 (반동) ──

  startShoot(): void {
    if (this.isShooting) return;
    this.isShooting = true;
    this.shootProgress = 0;
  }

  updateShoot(dt: number): boolean {
    if (!this.isShooting) {
      const t = Date.now() * 0.002;
      this.viewModel.position.x = this.idlePos.x + Math.sin(t) * 0.005;
      this.viewModel.position.y = this.idlePos.y + Math.sin(t * 1.3) * 0.004;
      return false;
    }

    this.shootProgress += dt / this.swingSpeed;
    const t = Math.min(this.shootProgress, 1);

    // 빠른 반동 후 복귀
    if (t < 0.12) {
      const p = t / 0.12;
      this.viewModel.position.set(
        this.idlePos.x,
        this.idlePos.y + p * 0.04,
        this.idlePos.z + p * 0.13,
      );
      this.pivot.rotation.set(
        this.idleRot.x - p * 0.14,
        this.idleRot.y,
        this.idleRot.z,
      );
    } else {
      const p = (t - 0.12) / 0.88;
      const ease = p * p;
      this.viewModel.position.set(
        this.idlePos.x,
        this.idlePos.y + 0.04 * (1 - ease),
        this.idlePos.z + 0.13 * (1 - ease),
      );
      this.pivot.rotation.set(
        this.idleRot.x - 0.14 * (1 - ease),
        this.idleRot.y,
        this.idleRot.z,
      );
    }

    // 발사 직후 히트 프레임 (t = 0.03)
    const hitFrame = this.shootProgress >= 0.03 && this.shootProgress - dt / this.swingSpeed < 0.03;

    if (t >= 1) {
      this.isShooting = false;
      this.shootProgress = 0;
      this.pivot.rotation.copy(this.idleRot);
      this.viewModel.position.copy(this.idlePos);
    }

    return hitFrame;
  }
}
