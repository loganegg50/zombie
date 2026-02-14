import * as THREE from 'three';
import { ZombieState } from '../types';
import type { Zombie } from '../entities/Zombie';
import type { Player } from '../entities/Player';
import type { FenceSection } from '../entities/FenceSection';
import { distanceXZ, angleToward } from '../utils/MathUtils';

const FENCE_ATTACK_RANGE = 1.8;
const PLAYER_ATTACK_RANGE = 1.5;

export function updateZombieAI(
  zombie: Zombie,
  player: Player,
  fences: FenceSection[],
  dt: number,
): void {
  if (!zombie.active) return;

  zombie.updateFlash(dt);

  // Apply knockback
  if (zombie.knockbackVel.lengthSq() > 0.01) {
    zombie.position.add(zombie.knockbackVel.clone().multiplyScalar(dt));
    zombie.knockbackVel.multiplyScalar(0.82);
  }

  // Bob animation
  zombie.mesh.children[0].position.y = 0.75 + Math.sin(Date.now() * 0.005) * 0.05;

  switch (zombie.state) {
    case ZombieState.SPAWNING:
      zombie.stateTimer -= dt;
      if (zombie.stateTimer <= 0) {
        pickTargetFence(zombie, fences);
        zombie.state = zombie.targetFence ? ZombieState.MOVING_TO_FENCE : ZombieState.CHASING;
      }
      break;

    case ZombieState.MOVING_TO_FENCE: {
      if (!zombie.targetFence || zombie.targetFence.isDestroyed) {
        pickTargetFence(zombie, fences);
        if (!zombie.targetFence) {
          // All fences destroyed — go inside
          zombie.state = ZombieState.CHASING;
          break;
        }
      }
      const target = zombie.targetFence!.worldPos;
      moveToward(zombie, target, dt);
      if (distanceXZ(zombie.position, target) < FENCE_ATTACK_RANGE) {
        zombie.state = ZombieState.ATTACKING_FENCE;
        zombie.attackTimer = 0;
      }
      break;
    }

    case ZombieState.ATTACKING_FENCE: {
      if (!zombie.targetFence || zombie.targetFence.isDestroyed) {
        // 다른 멀쩡한 울타리를 찾아서 이동
        pickTargetFence(zombie, fences);
        if (!zombie.targetFence) {
          // 모든 울타리 파괴됨 → 바로 플레이어 추격
          zombie.state = ZombieState.CHASING;
        } else {
          zombie.state = ZombieState.MOVING_TO_FENCE;
        }
        break;
      }
      faceToward(zombie, zombie.targetFence.worldPos);
      zombie.attackTimer += dt;
      if (zombie.attackTimer >= zombie.attackRate) {
        zombie.attackTimer = 0;
        zombie.targetFence.takeDamage(zombie.fenceDamage);
      }
      break;
    }

    case ZombieState.ENTERING: {
      // Move inward past the fence line toward center
      const inward = new THREE.Vector3(0, 0, 0).sub(zombie.position).normalize();
      zombie.position.add(inward.multiplyScalar(zombie.speed * dt));
      zombie.stateTimer -= dt;
      if (zombie.stateTimer <= 0) {
        zombie.state = ZombieState.CHASING;
      }
      break;
    }

    case ZombieState.CHASING: {
      moveToward(zombie, player.position, dt);
      if (distanceXZ(zombie.position, player.position) < PLAYER_ATTACK_RANGE) {
        zombie.state = ZombieState.ATTACKING_PLAYER;
        zombie.attackTimer = 0;
      }
      break;
    }

    case ZombieState.ATTACKING_PLAYER: {
      faceToward(zombie, player.position);
      if (distanceXZ(zombie.position, player.position) > PLAYER_ATTACK_RANGE + 0.5) {
        zombie.state = ZombieState.CHASING;
        break;
      }
      zombie.attackTimer += dt;
      if (zombie.attackTimer >= zombie.attackRate) {
        zombie.attackTimer = 0;
        player.takeDamage(zombie.damage);
      }
      break;
    }

    case ZombieState.DYING:
      zombie.stateTimer -= dt;
      const s = Math.max(0, zombie.stateTimer / 0.4);
      zombie.mesh.scale.set(1, s, 1);
      if (zombie.stateTimer <= 0) {
        zombie.active = false;
        zombie.mesh.visible = false;
        zombie.mesh.scale.set(1, 1, 1);
      }
      break;
  }
}

function pickTargetFence(zombie: Zombie, fences: FenceSection[]): void {
  let best: FenceSection | null = null;
  let bestDist = Infinity;
  for (const f of fences) {
    if (f.isDestroyed) continue;
    const d = distanceXZ(zombie.position, f.worldPos);
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  zombie.targetFence = best;
}

function moveToward(zombie: Zombie, target: THREE.Vector3, dt: number): void {
  const dir = new THREE.Vector3(
    target.x - zombie.position.x,
    0,
    target.z - zombie.position.z,
  ).normalize();
  zombie.position.add(dir.multiplyScalar(zombie.speed * dt));
  faceToward(zombie, target);
}

function faceToward(zombie: Zombie, target: THREE.Vector3): void {
  zombie.mesh.rotation.y = angleToward(zombie.position, target);
}
