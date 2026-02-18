import * as THREE from 'three';
import { ZombieState } from '../types';
import type { Zombie } from '../entities/Zombie';
import type { Player } from '../entities/Player';
import type { FenceSection } from '../entities/FenceSection';
import { distanceXZ, angleToward } from '../utils/MathUtils';
import { RAMP_ORIGIN, RAMP_DIR, RAMP_HORIZ_LEN, RAMP_RADIUS } from '../core/Scene';

// 경사로 입구 접근 지점 (경사로 시작 바로 앞)
const RAMP_ENTRY = new THREE.Vector3(RAMP_ORIGIN[0] - 1.0, 0, RAMP_ORIGIN[1]);

const FENCE_ATTACK_RANGE = 1.8;
const PLAYER_ATTACK_RANGE = 1.5;
// 갭(구멍)은 같은 거리의 온전한 울타리보다 이 비율만큼 가깝게 취급 (낮을수록 갭 선호)
const GAP_PREFER_FACTOR = 0.7;

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

  // 경사로 바닥 스냅 (경사면 위에 있으면 해당 높이로, 아니면 Y=0)
  const floorY = getZombieFloorY(zombie.position);
  if (zombie.position.y < floorY) {
    zombie.position.y = floorY;
  } else if (zombie.position.y > floorY + 0.05) {
    // 경사로에서 벗어나면 중력으로 바닥으로
    zombie.position.y = Math.max(floorY, zombie.position.y - 12 * dt);
  }

  // Bob animation
  zombie.mesh.children[0].position.y = 0.75 + Math.sin(Date.now() * 0.005) * 0.05;

  switch (zombie.state) {
    case ZombieState.SPAWNING:
      zombie.stateTimer -= dt;
      if (zombie.stateTimer <= 0) {
        // 구멍(갭)을 우선 탐색, 없으면 가장 가까운 울타리
        pickBestTarget(zombie, fences);
        zombie.state = zombie.targetFence ? ZombieState.MOVING_TO_FENCE : ZombieState.CHASING;
      }
      break;

    case ZombieState.MOVING_TO_FENCE: {
      if (!zombie.targetFence) {
        pickBestTarget(zombie, fences);
        if (!zombie.targetFence) {
          zombie.state = ZombieState.CHASING;
          break;
        }
      }

      // 현재 목표가 온전한 울타리인데, 더 가까운 구멍이 생겼으면 경로 변경
      const tf = zombie.targetFence;
      if (!tf.isDestroyed) {
        const nearGap = findNearestGap(zombie, fences);
        if (nearGap) {
          const gapDist = distanceXZ(zombie.position, nearGap.worldPos);
          const curDist = distanceXZ(zombie.position, tf.worldPos);
          if (gapDist < curDist * GAP_PREFER_FACTOR) {
            zombie.targetFence = nearGap; // 구멍으로 경로 전환
          }
        }
      }

      const target = zombie.targetFence.worldPos;
      moveToward(zombie, target, dt);
      const dist = distanceXZ(zombie.position, target);

      if (zombie.targetFence.isDestroyed) {
        // 구멍으로 이동 중 — 가까이 오면 안으로 진입
        if (dist < 2.0) {
          zombie.state = ZombieState.ENTERING;
          zombie.stateTimer = 1.5;
        }
      } else {
        // 온전한 울타리 — 가까이 오면 공격 시작
        if (dist < FENCE_ATTACK_RANGE) {
          zombie.state = ZombieState.ATTACKING_FENCE;
          zombie.attackTimer = 0;
        }
      }
      break;
    }

    case ZombieState.ATTACKING_FENCE: {
      if (!zombie.targetFence || zombie.targetFence.isDestroyed) {
        // 부수던 울타리가 무너짐 → 그 구멍으로 바로 진입
        zombie.state = ZombieState.ENTERING;
        zombie.stateTimer = 1.5;
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
      const chaseTarget = getChaseTarget(zombie, player);
      moveToward(zombie, chaseTarget, dt);
      const heightDiff = Math.abs(zombie.position.y - player.position.y);
      if (distanceXZ(zombie.position, player.position) < PLAYER_ATTACK_RANGE && heightDiff < 1.5) {
        zombie.state = ZombieState.ATTACKING_PLAYER;
        zombie.attackTimer = 0;
      }
      break;
    }

    case ZombieState.ATTACKING_PLAYER: {
      faceToward(zombie, player.position);
      const heightDiff = Math.abs(zombie.position.y - player.position.y);
      if (distanceXZ(zombie.position, player.position) > PLAYER_ATTACK_RANGE + 0.5 || heightDiff >= 1.5) {
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

/** 경사로 기준 좀비의 바닥 Y 값 반환 */
function getZombieFloorY(pos: THREE.Vector3): number {
  const toX = pos.x - RAMP_ORIGIN[0];
  const toZ = pos.z - RAMP_ORIGIN[1];
  const proj = toX * RAMP_DIR[0] + toZ * RAMP_DIR[1];
  const perpX = toX - proj * RAMP_DIR[0];
  const perpZ = toZ - proj * RAMP_DIR[1];
  const perpDist = Math.sqrt(perpX * perpX + perpZ * perpZ);

  if (proj >= 0 && proj <= RAMP_HORIZ_LEN && perpDist < RAMP_RADIUS + 0.5) {
    return Math.min(proj, RAMP_HORIZ_LEN);
  }
  return 0;
}

/** 플레이어가 높은 곳에 있을 때 경사로 입구를 경유해서 추격 */
function getChaseTarget(zombie: Zombie, player: Player): THREE.Vector3 {
  const playerElevated = player.position.y > 1.5;
  const zombieOnGround = zombie.position.y < 0.5;

  if (playerElevated && zombieOnGround) {
    const distToEntry = distanceXZ(zombie.position, RAMP_ENTRY);
    if (distToEntry > 1.5) {
      return RAMP_ENTRY;
    }
  }
  return player.position;
}

/** 구멍(파괴된 울타리)을 우선 탐색, 없으면 가장 가까운 온전한 울타리 */
function pickBestTarget(zombie: Zombie, fences: FenceSection[]): void {
  let best: FenceSection | null = null;
  let bestScore = Infinity;
  for (const f of fences) {
    const d = distanceXZ(zombie.position, f.worldPos);
    // 구멍은 GAP_PREFER_FACTOR 배 가깝게 취급 (더 매력적)
    const score = f.isDestroyed ? d * GAP_PREFER_FACTOR : d;
    if (score < bestScore) {
      bestScore = score;
      best = f;
    }
  }
  zombie.targetFence = best;
}

/** 가장 가까운 구멍(파괴된 울타리) 반환 */
function findNearestGap(zombie: Zombie, fences: FenceSection[]): FenceSection | null {
  let best: FenceSection | null = null;
  let bestDist = Infinity;
  for (const f of fences) {
    if (!f.isDestroyed) continue;
    const d = distanceXZ(zombie.position, f.worldPos);
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  return best;
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
