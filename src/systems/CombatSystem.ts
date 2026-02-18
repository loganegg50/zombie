import * as THREE from 'three';
import { ZombieState } from '../types';
import type { Player } from '../entities/Player';
import type { Weapon } from '../entities/Weapon';
import type { Zombie } from '../entities/Zombie';
import type { Input } from '../core/Input';
import { pointInSector } from '../utils/Hitbox';
import type { CameraShake } from '../effects/CameraShake';
import type { ParticleSystem } from '../effects/Particles';

export interface HitStopState {
  active: boolean;
  timer: number;
}

/** Ray-AABB 교차 테스트. 교차하면 교차 거리 t, 아니면 null */
function rayAABB(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  boxMin: THREE.Vector3,
  boxMax: THREE.Vector3,
): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  const axes = ['x', 'y', 'z'] as const;
  for (const ax of axes) {
    const d = dir[ax];
    if (Math.abs(d) < 1e-8) {
      if (origin[ax] < boxMin[ax] || origin[ax] > boxMax[ax]) return null;
    } else {
      const t1 = (boxMin[ax] - origin[ax]) / d;
      const t2 = (boxMax[ax] - origin[ax]) / d;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    }
  }
  if (tmax < Math.max(tmin, 0)) return null;
  return Math.max(tmin, 0);
}

export function updateCombat(
  player: Player,
  weapon: Weapon,
  zombies: Zombie[],
  input: Input,
  hitStop: HitStopState,
  cameraShake: CameraShake,
  particles: ParticleSystem,
  cameraPitch: number,
  dt: number,
): void {
  // 공격 시작
  if (input.mouseJustDown && player.attackCooldown <= 0 && !player.isCasting) {
    weapon.startAttack();
    player.attackCooldown = weapon.swingSpeed;
  }

  // 애니메이션 업데이트 + 히트 프레임 감지
  const isHitFrame = weapon.updateAttack(dt);

  if (!isHitFrame) return;

  const facingAngle = player.facingAngle;
  let hitCount = 0;

  if (weapon.type === 'ranged') {
    // ── 원거리: 3D 레이캐스트 + AABB 히트박스 ──
    // ADS 시 확산 80% 감소
    const spreadRad = (weapon.arc * (1 - weapon.aimRatio * 0.8) * Math.PI / 180) / 2;

    // 레이 시작점: 플레이어 눈 높이
    const EYE_H = 1.65;
    const rayOrigin = new THREE.Vector3(
      player.position.x,
      player.position.y + EYE_H,
      player.position.z,
    );

    // 탄환별 피해량 누적 (같은 좀비를 여러 탄이 맞출 수 있음)
    const hitMap = new Map<Zombie, number>();

    for (let p = 0; p < weapon.pellets; p++) {
      // 수평 확산 + pitch 포함 3D 발사 방향
      const angle = facingAngle + (Math.random() - 0.5) * spreadRad * 2;
      const cosPitch = Math.cos(cameraPitch);
      const dir = new THREE.Vector3(
        -Math.sin(angle) * cosPitch,
        Math.sin(cameraPitch),
        -Math.cos(angle) * cosPitch,
      ).normalize();

      let closestZ: Zombie | null = null;
      let closestT = weapon.range;

      for (const z of zombies) {
        if (!z.active || z.state === ZombieState.DYING) continue;

        // 좀비 AABB: 발(z.position.y)부터 머리(+1.9)까지, 너비 0.9×0.9
        const boxMin = new THREE.Vector3(z.position.x - 0.45, z.position.y,       z.position.z - 0.45);
        const boxMax = new THREE.Vector3(z.position.x + 0.45, z.position.y + 1.9, z.position.z + 0.45);

        const t = rayAABB(rayOrigin, dir, boxMin, boxMax);
        if (t !== null && t < closestT) {
          closestT = t;
          closestZ = z;
        }
      }

      if (closestZ) {
        hitMap.set(closestZ, (hitMap.get(closestZ) ?? 0) + weapon.damage);
      }

      // 총구 화염 파티클
      const muzzlePos = new THREE.Vector3(
        rayOrigin.x + dir.x * 0.6,
        rayOrigin.y + dir.y * 0.6,
        rayOrigin.z + dir.z * 0.6,
      );
      particles.burst(muzzlePos, 0xffcc44, 3);
    }

    // 피해 적용
    for (const [z, totalDmg] of hitMap) {
      z.hp -= totalDmg;
      const kbDir = new THREE.Vector3()
        .subVectors(z.position, player.position)
        .normalize();
      z.knockbackVel.copy(kbDir).multiplyScalar(weapon.knockback * 5);
      z.flashDamage();
      particles.burst(z.position.clone().setY(1), 0xff4400, 5);
      hitCount++;
      if (z.hp <= 0) {
        z.state = ZombieState.DYING;
        z.stateTimer = 0.4;
      }
    }

    if (hitCount > 0) {
      hitStop.active = true;
      hitStop.timer = 0.04;
      cameraShake.shake(0.28, 0.09);
    }
  } else {
    // ── 근접: 부채꼴 히트박스 ──
    for (const z of zombies) {
      if (!z.active || z.state === ZombieState.DYING) continue;

      if (pointInSector(z.position, player.position, facingAngle, weapon.range, weapon.arc)) {
        z.hp -= weapon.damage;
        hitCount++;

        const dir = new THREE.Vector3()
          .subVectors(z.position, player.position)
          .normalize();
        z.knockbackVel.copy(dir).multiplyScalar(weapon.knockback * 5);
        z.flashDamage();
        particles.burst(z.position.clone().setY(1), 0xff3333, 6);

        if (z.hp <= 0) {
          z.state = ZombieState.DYING;
          z.stateTimer = 0.4;
        }
      }
    }

    if (hitCount > 0) {
      hitStop.active = true;
      hitStop.timer = 0.06;
      cameraShake.shake(0.25, 0.12);
    }
  }
}
