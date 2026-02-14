import type { WaveConfig, ZombieConfig } from '../types';
import type { Zombie } from '../entities/Zombie';
import type { ObjectPool } from '../utils/ObjectPool';
import { randomRange } from '../utils/MathUtils';

export class WaveSystem {
  currentWave = 0;
  private waveConfigs: WaveConfig[];
  private zombieConfig: ZombieConfig;
  private spawnQueue = 0;
  private spawnTimer = 0;
  private spawnInterval = 1;
  private _totalSpawned = 0;
  waveActive = false;

  // Spawn ring radius (outside fence)
  private spawnRadius = 22;

  constructor(waveConfigs: WaveConfig[], zombieConfig: ZombieConfig) {
    this.waveConfigs = waveConfigs;
    this.zombieConfig = zombieConfig;
  }

  startWave(waveNumber: number): void {
    this.currentWave = waveNumber;
    const cfg = this.waveConfigs[waveNumber - 1];
    if (!cfg) return;

    this.spawnQueue = cfg.zombies;
    this._totalSpawned = 0;
    this.spawnInterval = cfg.spawnInterval;
    this.spawnTimer = 0;
    this.waveActive = true;
  }

  update(dt: number, pool: ObjectPool<Zombie>): void {
    if (!this.waveActive) return;
    if (this.spawnQueue <= 0) return;

    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer -= this.spawnInterval;
      this.spawnOne(pool);
    }
  }

  private spawnOne(pool: ObjectPool<Zombie>): void {
    if (this.spawnQueue <= 0) return;

    const cfg = this.waveConfigs[this.currentWave - 1];
    const zombie = pool.acquire();

    const angle = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * this.spawnRadius;
    const z = Math.sin(angle) * this.spawnRadius;

    const hp = Math.round(this.zombieConfig.hp * cfg.hpMult);
    const speed = this.zombieConfig.speed * cfg.speedMult;
    const coinValue = Math.round(
      randomRange(this.zombieConfig.coinDrop.min, this.zombieConfig.coinDrop.max),
    );

    zombie.spawn(x, z, hp, speed, coinValue);
    this.spawnQueue--;
    this._totalSpawned++;
  }

  /** Number of zombies remaining (alive + unspawned) */
  zombiesRemaining(activeZombies: number): number {
    return this.spawnQueue + activeZombies;
  }

  isWaveComplete(activeZombies: number): boolean {
    return this.waveActive && this.spawnQueue <= 0 && activeZombies === 0;
  }

  get isLastWave(): boolean {
    return this.currentWave >= this.waveConfigs.length;
  }

  get totalWaves(): number {
    return this.waveConfigs.length;
  }
}
