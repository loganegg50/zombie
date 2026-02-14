import * as THREE from 'three';
import type { WeaponConfig } from '../types';

export class Weapon {
  /** FPS 뷰모델 — 카메라에 직접 부착 */
  viewModel: THREE.Group;

  id: string;
  name: string;
  damage: number;
  range: number;
  swingSpeed: number;
  knockback: number;
  arc: number;

  isSwinging = false;
  swingProgress = 0;

  // 기본 자세 (idle)
  private idlePos = new THREE.Vector3();
  private idleRot = new THREE.Euler();

  // 피벗 (회전 중심점)
  private pivot: THREE.Group;
  private swordGroup: THREE.Group;

  constructor(config: WeaponConfig) {
    this.id = config.id;
    this.name = config.name;
    this.damage = config.damage;
    this.range = config.range;
    this.swingSpeed = config.swingSpeed;
    this.knockback = config.knockback;
    this.arc = config.arc;

    this.viewModel = new THREE.Group();

    // 피벗: 손잡이 위치를 중심으로 회전
    this.pivot = new THREE.Group();
    this.swordGroup = new THREE.Group();

    // 무기별 크기/재질
    let bladeW = 0.07, bladeH = 1.0, bladeD = 0.04;
    let bladeColor = 0xccccdd;
    let bladeMetal = 0.8, bladeRough = 0.2;
    let guardW = 0.22, guardColor = 0x886633;
    let handleColor = 0x5a3318;

    if (config.id === 'wooden_sword') {
      bladeH = 0.85;
      bladeW = 0.08;
      bladeColor = 0x8b6914;
      bladeMetal = 0.0;
      bladeRough = 0.8;
      guardW = 0.16;
      guardColor = 0x6b4226;
      handleColor = 0x4a2f1a;
    } else if (config.id === 'great_sword') {
      bladeW = 0.14;
      bladeH = 1.4;
      bladeD = 0.06;
      bladeColor = 0x8888aa;
      bladeMetal = 0.9;
      bladeRough = 0.15;
      guardW = 0.3;
    }

    // 칼날
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(bladeW, bladeH, bladeD),
      new THREE.MeshStandardMaterial({ color: bladeColor, metalness: bladeMetal, roughness: bladeRough }),
    );
    blade.position.y = bladeH / 2 + 0.08;
    blade.castShadow = true;
    this.swordGroup.add(blade);

    // 가드 (십자 부분)
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(guardW, 0.05, 0.06),
      new THREE.MeshStandardMaterial({ color: guardColor, metalness: 0.5, roughness: 0.4 }),
    );
    guard.position.y = 0.05;
    this.swordGroup.add(guard);

    // 손잡이
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.28, 0.05),
      new THREE.MeshStandardMaterial({ color: handleColor }),
    );
    handle.position.y = -0.12;
    this.swordGroup.add(handle);

    // 손 (피부색)
    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.18, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xffccaa }),
    );
    hand.position.y = -0.12;
    hand.position.z = 0.02;
    this.swordGroup.add(hand);

    // 팔뚝
    const forearm = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.35, 0.11),
      new THREE.MeshStandardMaterial({ color: 0x3366cc }),
    );
    forearm.position.y = -0.38;
    forearm.position.z = 0.05;
    this.swordGroup.add(forearm);

    this.pivot.add(this.swordGroup);
    this.viewModel.add(this.pivot);

    // 화면 오른쪽 아래 위치 (카메라 로컬 좌표)
    this.idlePos.set(0.45, -0.45, -0.65);
    this.idleRot.set(-0.3, -0.2, -0.15);

    this.viewModel.position.copy(this.idlePos);
    this.pivot.rotation.copy(this.idleRot);
  }

  applyConfig(config: WeaponConfig, level: number): void {
    this.damage = config.damage;
    this.range = config.range;
    this.swingSpeed = config.swingSpeed;
    this.knockback = config.knockback;
    this.arc = config.arc;

    for (const upg of config.upgrades) {
      if (upg.level <= level) {
        this.damage = upg.damage;
        this.range = upg.range;
        if (upg.swingSpeed !== undefined) this.swingSpeed = upg.swingSpeed;
        if (upg.knockback !== undefined) this.knockback = upg.knockback;
        if (upg.arc !== undefined) this.arc = upg.arc;
      }
    }
  }

  startSwing(): void {
    if (this.isSwinging) return;
    this.isSwinging = true;
    this.swingProgress = 0;
  }

  updateSwing(dt: number): boolean {
    if (!this.isSwinging) {
      // idle 흔들림 (미세한 bob)
      const t = Date.now() * 0.002;
      this.viewModel.position.x = this.idlePos.x + Math.sin(t) * 0.008;
      this.viewModel.position.y = this.idlePos.y + Math.sin(t * 1.3) * 0.006;
      return false;
    }

    this.swingProgress += dt / this.swingSpeed;
    const t = Math.min(this.swingProgress, 1);

    // 3단계 스윙: 뒤로 들기 → 칼날로 베기 → 복귀
    if (t < 0.2) {
      // 뒤로 들기 (wind-up) — 칼날을 뒤로 젖힘
      const p = t / 0.2;
      this.pivot.rotation.set(
        this.idleRot.x + p * 0.5,   // 칼날 뒤로 (준비)
        this.idleRot.y + p * 0.6,   // 오른쪽으로
        this.idleRot.z - p * 0.3,   // 칼날 오른쪽 기울임
      );
      this.viewModel.position.set(
        this.idlePos.x + p * 0.08,
        this.idlePos.y + p * 0.1,
        this.idlePos.z,
      );
    } else if (t < 0.55) {
      // 빠르게 휘두르기 (slash) — 칼날이 앞으로 나오며 베기
      const p = (t - 0.2) / 0.35;
      const ease = 1 - (1 - p) * (1 - p); // ease-out
      this.pivot.rotation.set(
        this.idleRot.x + 0.5 - ease * 1.2,  // 칼날 앞으로 (베기)
        this.idleRot.y + 0.6 - ease * 1.5,   // 오른→왼
        this.idleRot.z - 0.3 + ease * 0.8,   // 칼날 베기 방향으로 기울임
      );
      this.viewModel.position.set(
        this.idlePos.x + 0.08 - ease * 0.25,
        this.idlePos.y + 0.1 - ease * 0.15,
        this.idlePos.z - ease * 0.12,
      );
    } else {
      // 복귀
      const p = (t - 0.55) / 0.45;
      const ease = p * p; // ease-in
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

    // 히트 프레임: 스윙 40% 지점
    const hitFrame = this.swingProgress >= 0.4 && this.swingProgress - (dt / this.swingSpeed) < 0.4;

    if (t >= 1) {
      this.isSwinging = false;
      this.swingProgress = 0;
      this.pivot.rotation.copy(this.idleRot);
      this.viewModel.position.copy(this.idlePos);
    }

    return hitFrame;
  }
}
