import * as THREE from 'three';
import { ZombieState } from '../types';
import type { Zombie } from '../entities/Zombie';
import type { Player } from '../entities/Player';
import type { FenceSection } from '../entities/FenceSection';
import { distanceXZ, angleToward } from '../utils/MathUtils';
import { RAMP_ORIGIN, RAMP_DIR, RAMP_HORIZ_LEN, RAMP_RADIUS, RAMP_LEAF_SPHERES } from '../core/Scene';

// 경사로 입구 접근 지점 (경사로 시작 바로 앞)
const RAMP_ENTRY = new THREE.Vector3(RAMP_ORIGIN[0] - 1.0, 0, RAMP_ORIGIN[1]);

const FENCE_ATTACK_RANGE = 1.8;
const PLAYER_ATTACK_RANGE = 1.5;
// 갭(구멍)은 같은 거리의 온전한 울타리보다 이 비율만큼 가깝게 취급 (낮을수록 갭 선호)
const GAP_PREFER_FACTOR = 0.7;
// 이 거리 이내의 구멍만 탐지 (다른 좀비가 뚫은 구멍 반응 범위)
const GAP_DETECT_RANGE = 5;

export function updateZombieAI(
  zombie: Zombie,
  player: Player,
  fences: FenceSection[],
  dt: number,
): void {
  if (!zombie.active) return;

  zombie.updateFlash(dt);

  // DYING 상태는 별도 처리 (중력 + 쓰러짐)
  if (zombie.state === ZombieState.DYING) {
    handleDying(zombie, dt);
    return;
  }

  // 화상 데미지 틱
  if (zombie.updateBurn(dt)) {
    zombie.state = ZombieState.DYING;
    zombie.stateTimer = 1.5;
    zombie.startDying();
    return;
  }

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

      // 현재 목표가 온전한 울타리인데, 목표 근처(5칸)에 구멍이 생겼으면 경로 변경
      const tf = zombie.targetFence;
      if (!tf.isDestroyed) {
        const nearGap = findNearestGapNearFence(tf, fences);
        if (nearGap) {
          zombie.targetFence = nearGap; // 구멍으로 경로 전환
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
      } else if (zombie.canPassDamagedFence && zombie.targetFence.hpRatio <= 0.5) {
        // 돌격 좀비: 울타리 HP 50% 이하이면 통과
        if (dist < 2.0) {
          zombie.state = ZombieState.ENTERING;
          zombie.stateTimer = 1.0;
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
      // 플레이어가 나뭇잎 속에 있으면 인식 불가 — 멈춤
      if (isInLeaves(player.position)) break;
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
      // 플레이어가 나뭇잎 속으로 피신하면 놓침
      if (isInLeaves(player.position)) {
        zombie.state = ZombieState.CHASING;
        break;
      }
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
    let score: number;
    if (f.isDestroyed) {
      // 이 구멍 근처(5칸)에 온전한 울타리가 있으면 → 갭 선호 (거리에 0.7배 가중치)
      const nearIntact = fences.some(
        other => !other.isDestroyed && distanceXZ(f.worldPos, other.worldPos) <= GAP_DETECT_RANGE
      );
      score = nearIntact ? d * GAP_PREFER_FACTOR : d;
    } else {
      score = d;
    }
    if (score < bestScore) {
      bestScore = score;
      best = f;
    }
  }
  zombie.targetFence = best;
}

/** 기준 울타리 근처(5칸)의 구멍 중 가장 가까운 것 반환 */
function findNearestGapNearFence(ref: FenceSection, fences: FenceSection[]): FenceSection | null {
  let best: FenceSection | null = null;
  let bestDist = Infinity;
  for (const f of fences) {
    if (!f.isDestroyed) continue;
    // 기준 울타리와 구멍 사이 거리가 5칸 이내인지 체크
    if (distanceXZ(f.worldPos, ref.worldPos) > GAP_DETECT_RANGE) continue;
    const d = distanceXZ(f.worldPos, ref.worldPos);
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

/** 사망 애니메이션: 옆으로 쓰러지며 중력으로 낙하 */
function handleDying(zombie: Zombie, dt: number): void {
  zombie.stateTimer -= dt;

  // 옆으로 쓰러짐 (3.5 rad/s → ~0.45s 만에 완전히 눕힘)
  zombie.dyingTip = Math.min(Math.PI / 2, zombie.dyingTip + 3.5 * dt);
  zombie.mesh.rotation.z = zombie.dyingTipDir * zombie.dyingTip;

  // 중력 낙하 (경사로 위에 있던 좀비가 땅으로)
  zombie.dyingVelY -= 9.8 * dt;
  zombie.position.y = Math.max(0, zombie.position.y + zombie.dyingVelY * dt);

  if (zombie.stateTimer <= 0) {
    zombie.active = false;
    zombie.mesh.visible = false;
  }
}

/** 위치가 경사로 나뭇잎 구체 중 하나 안에 있으면 true */
function isInLeaves(pos: THREE.Vector3): boolean {
  for (const [lx, ly, lz, r] of RAMP_LEAF_SPHERES) {
    const dx = pos.x - lx;
    const dy = pos.y - ly;
    const dz = pos.z - lz;
    if (dx * dx + dy * dy + dz * dz < r * r) return true;
  }
  return false;
}
