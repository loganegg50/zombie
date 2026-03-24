import type { ZombieConfig } from '../types';
import type { Zombie } from '../entities/Zombie';
import type { ObjectPool } from '../utils/ObjectPool';
import { randomRange } from '../utils/MathUtils';

/**
 * 무한 웨이브 시스템
 * - 웨이브가 올라갈수록 좀비 수/HP/속도 증가
 * - 높은 웨이브에서 강한 좀비 타입 등장
 */

interface SpawnEntry {
  config: ZombieConfig;
  hpMult: number;
  speedMult: number;
}

export class WaveSystem {
  currentWave = 0;
  private zombieConfigs: ZombieConfig[];
  private spawnQueue: SpawnEntry[] = [];
  private spawnTimer = 0;
  private spawnInterval = 1;
  private _totalSpawned = 0;
  waveActive = false;

  private spawnRadius = 22;

  constructor(zombieConfigs: ZombieConfig[]) {
    this.zombieConfigs = zombieConfigs;
  }

  private getConfig(id: string): ZombieConfig {
    return this.zombieConfigs.find(c => c.id === id) ?? this.zombieConfigs[0];
  }

  startWave(waveNumber: number): void {
    this.currentWave = waveNumber;
    this._totalSpawned = 0;
    this.spawnTimer = 0;
    this.waveActive = true;

    // 웨이브별 스케일링
    const w = waveNumber;
    const hpMult = 1 + (w - 1) * 0.15;
    const speedMult = 1 + (w - 1) * 0.03;
    const totalZombies = Math.floor(5 + w * 3 + w * w * 0.3);
    this.spawnInterval = Math.max(0.3, 2.0 - w * 0.1);

    // 좀비 타입 분배
    const entries: SpawnEntry[] = [];
    const normal = this.getConfig('normal');
    const tank = this.getConfig('tank');
    const runner = this.getConfig('runner');
    const brute = this.getConfig('brute');
    const boss = this.getConfig('boss');

    for (let i = 0; i < totalZombies; i++) {
      const roll = Math.random();
      let picked: ZombieConfig;

      if (w >= 15 && roll < 0.05 + (w - 15) * 0.01) {
        picked = boss;
      } else if (w >= 8 && roll < 0.12 + (w - 8) * 0.015) {
        picked = brute;
      } else if (w >= 5 && roll < 0.18 + (w - 5) * 0.02) {
        picked = runner;
      } else if (w >= 3 && roll < 0.2 + (w - 3) * 0.02) {
        picked = tank;
      } else {
        picked = normal;
      }

      entries.push({ config: picked, hpMult, speedMult });
    }

    this.spawnQueue = entries;
  }

  update(dt: number, pool: ObjectPool<Zombie>): void {
    if (!this.waveActive) return;
    if (this.spawnQueue.length <= 0) return;

    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer -= this.spawnInterval;
      this.spawnOne(pool);
    }
  }

  private spawnOne(pool: ObjectPool<Zombie>): void {
    if (this.spawnQueue.length <= 0) return;

    const entry = this.spawnQueue.shift()!;
    const cfg = entry.config;
    const zombie = pool.acquire();

    const angle = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * this.spawnRadius;
    const z = Math.sin(angle) * this.spawnRadius;

    const hp = Math.round(cfg.hp * entry.hpMult);
    const speed = cfg.speed * entry.speedMult;
    const coinValue = Math.round(randomRange(cfg.coinDrop.min, cfg.coinDrop.max));

    zombie.spawn(x, z, hp, speed, coinValue, {
      id: cfg.id,
      damage: cfg.damage,
      fenceDamage: cfg.fenceDamage,
      attackRate: cfg.attackRate,
      bodyColor: cfg.bodyColor,
      headColor: cfg.headColor,
      scale: cfg.scale,
      canPassDamagedFence: cfg.canPassDamagedFence,
    });
    this._totalSpawned++;
  }

  zombiesRemaining(activeZombies: number): number {
    return this.spawnQueue.length + activeZombies;
  }

  isWaveComplete(activeZombies: number): boolean {
    return this.waveActive && this.spawnQueue.length <= 0 && activeZombies === 0;
  }

  /** 무한 웨이브이므로 항상 false */
  get isLastWave(): boolean {
    return false;
  }

  get totalWaves(): number {
    return Infinity;
  }
}
