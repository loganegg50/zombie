import * as THREE from 'three';
import type { Coin } from '../entities/Coin';
import type { Player } from '../entities/Player';
import type { ObjectPool } from '../utils/ObjectPool';
import type { ParticleSystem } from '../effects/Particles';
import { distanceXZ } from '../utils/MathUtils';

const ABSORB_RADIUS = 4.5;

export function spawnCoin(
  pool: ObjectPool<Coin>,
  x: number,
  z: number,
  value: number,
): void {
  const coin = pool.acquire();
  coin.spawn(x, z, value);
}

export function updateCoins(
  pool: ObjectPool<Coin>,
  player: Player,
  particles: ParticleSystem,
  dt: number,
): void {
  for (const coin of pool.getActive()) {
    coin.update(dt);

    const dist = distanceXZ(coin.position, player.position);

    if (!coin.absorbing && dist < ABSORB_RADIUS) {
      coin.absorbing = true;
      coin.absorbSpeed = 3;
    }

    if (coin.absorbing) {
      coin.absorbSpeed += dt * 25; // accelerate
      const dir = new THREE.Vector3()
        .subVectors(player.position, coin.position)
        .normalize();
      coin.position.add(dir.multiplyScalar(coin.absorbSpeed * dt));
      coin.position.y = Math.max(0.3, coin.position.y - dt * 2);

      if (dist < 0.6) {
        player.coins += coin.value;
        particles.burst(coin.position.clone().setY(1), 0xffd700, 4);
        pool.release(coin);
      }
    }
  }
}
