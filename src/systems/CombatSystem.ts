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

export function updateCombat(
  player: Player,
  weapon: Weapon,
  zombies: Zombie[],
  input: Input,
  hitStop: HitStopState,
  cameraShake: CameraShake,
  particles: ParticleSystem,
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
    // ── 원거리: 레이캐스트 (탄환별) ──
    // ADS 시 확산 80% 감소
    const spreadRad = (weapon.arc * (1 - weapon.aimRatio * 0.8) * Math.PI / 180) / 2;

    // 탄환별 피해량 누적 (같은 좀비를 여러 탄이 맞출 수 있음)
    const hitMap = new Map<Zombie, number>();

    for (let p = 0; p < weapon.pellets; p++) {
      // 확산 범위 내 랜덤 방향
      const angle = facingAngle + (Math.random() - 0.5) * spreadRad * 2;
      const dir = new THREE.Vector3(-Math.sin(angle), 0, -Math.cos(angle)).normalize();

      let closestZ: Zombie | null = null;
      let closestDist = weapon.range;

      for (const z of zombies) {
        if (!z.active || z.state === ZombieState.DYING) continue;

        // 좀비까지의 벡터를 발사 방향에 투영
        const toZ = new THREE.Vector3(
          z.position.x - player.position.x,
          0,
          z.position.z - player.position.z,
        );
        const proj = toZ.dot(dir);
        if (proj <= 0 || proj > weapon.range) continue;

        // 레이에서 좀비까지 최단 거리
        const closest = new THREE.Vector3(
          player.position.x + dir.x * proj,
          0,
          player.position.z + dir.z * proj,
        );
        const distToRay = Math.sqrt(
          (z.position.x - closest.x) ** 2 + (z.position.z - closest.z) ** 2,
        );

        if (distToRay < 0.65 && proj < closestDist) {
          closestDist = proj;
          closestZ = z;
        }
      }

      if (closestZ) {
        hitMap.set(closestZ, (hitMap.get(closestZ) ?? 0) + weapon.damage);
      }

      // 총구 화염 파티클
      const muzzlePos = new THREE.Vector3(
        player.position.x + dir.x * 0.6,
        player.position.y + 1.5,
        player.position.z + dir.z * 0.6,
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
