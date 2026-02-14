// ── Enums ──

export enum GamePhase {
  PREGAME = 'PREGAME',
  COMBAT = 'COMBAT',
  PAUSED = 'PAUSED',
  SHOP = 'SHOP',
  GAMEOVER = 'GAMEOVER',
}

export enum ZombieState {
  SPAWNING = 'SPAWNING',
  MOVING_TO_FENCE = 'MOVING_TO_FENCE',
  ATTACKING_FENCE = 'ATTACKING_FENCE',
  ENTERING = 'ENTERING',
  CHASING = 'CHASING',
  ATTACKING_PLAYER = 'ATTACKING_PLAYER',
  DYING = 'DYING',
}

// ── Config Interfaces ──

export interface WeaponUpgrade {
  level: number;
  cost: number;
  damage: number;
  range: number;
  swingSpeed?: number;
  knockback?: number;
  arc?: number;
}

export interface WeaponConfig {
  id: string;
  name: string;
  damage: number;
  range: number;
  swingSpeed: number;
  knockback: number;
  arc: number;
  cost: number;
  upgrades: WeaponUpgrade[];
}

export interface ZombieConfig {
  id: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  attackRate: number;
  fenceDamage: number;
  coinDrop: { min: number; max: number };
  bodyColor: string;
  scale: number;
}

export interface WaveConfig {
  wave: number;
  zombies: number;
  spawnInterval: number;
  speedMult: number;
  hpMult: number;
}

export interface EconomyConfig {
  coinPerZombie: number;
  coinVariance: number;
  absorbRadius: number;
  absorbSpeed: number;
}

// ── Runtime Interfaces ──

import type { Group } from 'three';

export interface Poolable {
  active: boolean;
  mesh: Group;
  reset(): void;
}
