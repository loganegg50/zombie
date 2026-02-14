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
  // Start swing on click
  if (input.mouseJustDown && player.attackCooldown <= 0 && !player.isCasting) {
    weapon.startSwing();
    player.attackCooldown = weapon.swingSpeed;
  }

  // Update swing animation; check hits on the hit frame
  const isHitFrame = weapon.updateSwing(dt);

  if (isHitFrame) {
    const facingAngle = player.facingAngle;
    let hitCount = 0;

    for (const z of zombies) {
      if (!z.active || z.state === ZombieState.DYING) continue;

      if (pointInSector(z.position, player.position, facingAngle, weapon.range, weapon.arc)) {
        z.hp -= weapon.damage;
        hitCount++;

        // Knockback
        const dir = new THREE.Vector3()
          .subVectors(z.position, player.position)
          .normalize();
        z.knockbackVel.copy(dir).multiplyScalar(weapon.knockback * 5);

        // Damage flash
        z.flashDamage();

        // Particles (red burst)
        particles.burst(z.position.clone().setY(1), 0xff3333, 6);

        // Check death
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
