import * as THREE from 'three';
import { GamePhase } from './types';
import { CoopSystem } from './systems/CoopSystem';
import type { WeaponConfig, ZombieConfig, Enchant, WeaponState } from './types';
import { SceneManager } from './core/Scene';
import { FPSCamera } from './core/Camera';
import { Input } from './core/Input';
import { Player } from './entities/Player';
import { Zombie } from './entities/Zombie';
import { Coin } from './entities/Coin';
import { FenceSection } from './entities/FenceSection';
import { Weapon } from './entities/Weapon';
import { ObjectPool } from './utils/ObjectPool';
import { distanceXZ } from './utils/MathUtils';
import { updateZombieAI } from './systems/ZombieAISystem';
import { updateCombat, type HitStopState } from './systems/CombatSystem';
import { WaveSystem } from './systems/WaveSystem';
import { spawnCoin, updateCoins } from './systems/CoinSystem';
import { RepairSystem } from './systems/RepairSystem';
import { CameraShake } from './effects/CameraShake';
import { ParticleSystem } from './effects/Particles';
import { HUD } from './ui/HUD';
import { WaveAnnouncement } from './ui/WaveAnnouncement';
import { GameOverUI } from './ui/GameOverUI';

import weaponsData from './config/weapons.json';
import zombiesData from './config/zombies.json';

const FENCE_MAX_HP = 100;
const saveKey = () => window.GameAccount.key('zombie-defense-save');
const progressKey = () => window.GameAccount.key('zombie-defense-progress');
const ENCHANT_COST = 1000;
const ENCHANT_INFO: { id: Enchant; name: string; icon: string; desc: string; color: string; rangedOnly?: boolean }[] = [
  { id: 'sharpness', name: '날카로움', icon: '🗡️', desc: '데미지 ×1.5', color: '#ff6b6b' },
  { id: 'knockback', name: '밀치기', icon: '💨', desc: '넉백 ×2', color: '#a29bfe' },
  { id: 'fire', name: '발화', icon: '🔥', desc: '3초간 화상 DOT', color: '#ff9f43' },
  { id: 'multi_shot', name: '다중 발사', icon: '🎯', desc: '탄환 +2', color: '#69d5ff', rangedOnly: true },
  { id: 'fast_reload', name: '빠른 장전', icon: '⚡', desc: '공격속도 ×0.7', color: '#f9ca24', rangedOnly: true },
  { id: 'pierce', name: '관통', icon: '🔱', desc: '탄환이 좀비를 관통', color: '#00e676', rangedOnly: true },
];

export class Game {
  private coop!: CoopSystem;
  private coopPeers = new Map<string, { player: Player; weapon: Weapon; pitch: number; attack: boolean; seen: number; name: string }>();
  private coopZombies = new Map<number, Zombie>();
  private coopHostPhase = GamePhase.COMBAT;

  coopStatus() {
    return { playing: [GamePhase.COMBAT, GamePhase.SHOP, GamePhase.PAUSED].includes(this.phase), wave: this.waveSystem.currentWave };
  }

  coopLocalPlayer() {
    const p = this.player.position;
    return { x: p.x, y: p.y, z: p.z, yaw: this.fpsCamera.yaw, pitch: this.fpsCamera.pitch, weapon: this.weapon.id, hp: this.player.hp };
  }

  private makeCoopPeer(id: string, name: string) {
    const player = new Player(this.sceneManager.scene);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.4), new THREE.MeshStandardMaterial({ color: 0x43c9ed }));
    body.position.y = 0.8;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd4a8 }));
    head.position.y = 1.6;
    player.mesh.add(body, head);
    const peer = { player, weapon: new Weapon(this.weaponConfigs[0]), pitch: 0, attack: false, seen: performance.now(), name };
    this.coopPeers.set(id, peer);
    return peer;
  }

  receiveCoopPeer(p: any): boolean {
    if (!/^[\w-]{1,64}$/.test(p.id) || ![p.x, p.y, p.z, p.yaw, p.pitch].every(Number.isFinite)
      || Math.abs(p.x) > 16 || Math.abs(p.z) > 16 || p.y < -1 || p.y > 12) return false;
    let peer = this.coopPeers.get(p.id);
    if (!peer && this.coopPeers.size >= 3) return false;
    peer ??= this.makeCoopPeer(p.id, String(p.name).slice(0, 24));
    const elapsed = Math.min(2, (performance.now() - peer.seen) / 1000);
    const target = new THREE.Vector3(p.x, p.y, p.z);
    if (peer.player.position.distanceTo(target) <= 3 + elapsed * 15 && peer.player.hp > 0) peer.player.position.copy(target);
    peer.player.facingAngle = p.yaw;
    peer.player.mesh.rotation.y = p.yaw;
    peer.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, p.pitch));
    peer.attack ||= p.attack === true;
    peer.seen = performance.now();
    return true;
  }

  removeCoopPeer(id: string): void {
    const peer = this.coopPeers.get(id);
    if (peer) {
      this.sceneManager.scene.remove(peer.player.mesh);
      peer.player.mesh.traverse(obj => {
        if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); const mats = Array.isArray(obj.material) ? obj.material : [obj.material]; mats.forEach(m => m.dispose()); }
      });
      this.coopPeers.delete(id);
    }
  }

  coopSnapshot(host: string) {
    return { host, phase: this.phase, wave: this.waveSystem.currentWave,
      players: [{ ...this.coopLocalPlayer(), id: host, name: window.GameAuth.getDisplayName(window.GameAccount.user) },
        ...Array.from(this.coopPeers, ([id, p]) => ({ id, name: p.name, x: p.player.position.x, y: p.player.position.y, z: p.player.position.z, yaw: p.player.facingAngle, hp: p.player.hp }))],
      zombies: this.zombiePool.all.flatMap((z, id) => z.active ? [{ id, type: z.zombieType, x: z.position.x, y: z.position.y, z: z.position.z, yaw: z.mesh.rotation.y, roll: z.mesh.rotation.z, hp: z.hp, maxHp: z.maxHp }] : []),
      fences: this.fences.map(f => f.hp) };
  }

  validCoopSnapshot(s: any): boolean {
    const position = (p: any) => p && [p.x, p.y, p.z, p.yaw, p.hp].every(Number.isFinite)
      && Math.abs(p.x) < 100 && Math.abs(p.z) < 100 && Math.abs(p.y) < 100;
    return Object.values(GamePhase).includes(s.phase) && Number.isInteger(s.wave) && s.wave >= 0 && s.wave < 10000
      && Array.isArray(s.players) && s.players.length <= 4 && s.players.every((p: any) => position(p) && typeof p.id === 'string' && p.id.length <= 64 && p.hp >= 0 && p.hp <= 100)
      && Array.isArray(s.zombies) && s.zombies.length <= 500 && s.zombies.every((z: any) => position(z) && Number.isInteger(z.id) && z.id >= 0 && Number.isFinite(z.roll) && Number.isFinite(z.maxHp) && z.maxHp > 0 && this.zombieConfigs.some(c => c.id === z.type))
      && Array.isArray(s.fences) && s.fences.length === this.fences.length && s.fences.every((hp: any) => Number.isFinite(hp) && hp >= 0 && hp <= FENCE_MAX_HP);
  }

  enterCoopGuest(): void {
    this.titleOverlay.style.display = 'none';
    this.pauseOverlay.style.display = 'none';
    this.betweenWaveOverlay?.remove();
    this.zombiePool.all.forEach(z => this.zombiePool.release(z));
    this.phase = GamePhase.COMBAT;
    this.player.hp = this.player.maxHp;
    this.player.position.set(0, 0, 0);
    this.hud.show(); this.crosshair.style.display = 'block';
    this.input.showMobileControls(true);
    // Joining uses the starter sword, matching the host's authoritative loadout.
    this.fpsCamera.camera.remove(this.weapon.viewModel);
    this.weapon = new Weapon(this.weaponConfigs[0]);
    this.fpsCamera.camera.add(this.weapon.viewModel);
  }

  applyCoopSnapshot(s: any, ownId: string): void {
    this.coopHostPhase = s.phase;
    this.waveSystem.currentWave = s.wave;
    for (const p of s.players) {
      if (p.id === ownId) { this.player.hp = p.hp; continue; }
      const peer = this.coopPeers.get(p.id) ?? this.makeCoopPeer(p.id, String(p.name).slice(0, 24));
      peer.player.position.set(p.x, p.y, p.z); peer.player.mesh.rotation.y = p.yaw;
      peer.player.mesh.visible = p.hp > 0;
    }
    for (const id of this.coopPeers.keys()) if (!s.players.some((p: any) => p.id === id)) this.removeCoopPeer(id);
    for (const [id, z] of this.coopZombies) if (!s.zombies.some((p: any) => p.id === id)) { this.zombiePool.release(z); this.coopZombies.delete(id); }
    for (const p of s.zombies) {
      let z = this.coopZombies.get(p.id);
      if (!z) { z = this.zombiePool.acquire(); z.spawn(p.x, p.z, p.maxHp, 0, 0, this.zombieConfigs.find(c => c.id === p.type)); this.coopZombies.set(p.id, z); }
      z.position.set(p.x, p.y, p.z); z.mesh.rotation.set(0, p.yaw, p.roll); z.hp = p.hp;
    }
    s.fences.forEach((hp: number, i: number) => this.fences[i].restoreHp(hp));
    this.hud.update(this.player.hp, this.player.maxHp, 0, s.wave, 0, s.zombies.length, this.weapon.name, 0, false, this.player.attackCooldown, this.player.attackCooldownMax);
  }
  // Core
  private sceneManager!: SceneManager;
  private fpsCamera!: FPSCamera;
  private input!: Input;
  private clock = new THREE.Clock();

  // Entities
  private player!: Player;
  private weapon!: Weapon;
  private fences: FenceSection[] = [];
  private zombiePool!: ObjectPool<Zombie>;
  private coinPool!: ObjectPool<Coin>;

  // Systems
  private waveSystem!: WaveSystem;
  private repairSystem = new RepairSystem();
  private hitStop: HitStopState = { active: false, timer: 0 };

  // Effects
  private cameraShake = new CameraShake();
  private particles!: ParticleSystem;

  // UI
  private hud!: HUD;
  private waveAnnounce!: WaveAnnouncement;
  private gameOverUI!: GameOverUI;
  private crosshair!: HTMLDivElement;
  private betweenWaveOverlay: HTMLDivElement | null = null;
  private betweenWaveTimer = 0;

  // State
  phase = GamePhase.PREGAME;
  private weaponConfigs = weaponsData as WeaponConfig[];
  private zombieConfigs = zombiesData as ZombieConfig[];
  private totalKills = 0;
  private totalCoinsEarned = 0;

  // Persistent (across games)
  private persistentCoins = 0;
  private weaponStates = new Map<string, WeaponState>();

  private titleOverlay!: HTMLDivElement;
  private pauseOverlay!: HTMLDivElement;
  private mobilePauseBtn: HTMLDivElement | null = null;

  // 히트박스 디버그
  private debugHitboxes = false;
  private debugGroup!: THREE.Group;
  private debugSector!: THREE.Mesh;
  private debugSectorEdge!: THREE.Line;
  private debugZombieCircles: THREE.Line[] = [];
  private debugZombieBoxes: THREE.LineSegments[] = [];
  private debugSectorRange = 0;
  private debugSectorArc = 0;

  init(): void {
    this.sceneManager = new SceneManager();
    this.fpsCamera = new FPSCamera();
    this.sceneManager.scene.add(this.fpsCamera.camera);
    this.input = new Input(this.sceneManager.canvas);

    this.player = new Player(this.sceneManager.scene);

    // 기본 무기 (나무검) — 게임 시작 전 선택 화면에서 교체됨
    const defaultWeapon = this.weaponConfigs[0];
    this.weapon = new Weapon(defaultWeapon);
    this.fpsCamera.camera.add(this.weapon.viewModel);
    const viewLight = new THREE.PointLight(0xffffff, 0.6, 3);
    viewLight.position.set(0.3, -0.2, -0.5);
    this.fpsCamera.camera.add(viewLight);

    this.buildFences();

    this.zombiePool = new ObjectPool<Zombie>(
      () => new Zombie(this.sceneManager.scene),
      10,
    );
    this.coinPool = new ObjectPool<Coin>(
      () => new Coin(this.sceneManager.scene),
      20,
    );

    this.waveSystem = new WaveSystem(this.zombieConfigs);
    this.particles = new ParticleSystem(this.sceneManager.scene);

    this.hud = new HUD();
    this.hud.hide();
    this.waveAnnounce = new WaveAnnouncement();
    this.gameOverUI = new GameOverUI();

    // 크로스헤어
    this.crosshair = document.createElement('div');
    this.crosshair.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 20px; height: 20px; pointer-events: none; z-index: 11;
    `;
    this.crosshair.innerHTML = `
      <div style="position:absolute; top:50%; left:0; right:0; height:2px; background:rgba(255,255,255,0.7); transform:translateY(-50%);"></div>
      <div style="position:absolute; left:50%; top:0; bottom:0; width:2px; background:rgba(255,255,255,0.7); transform:translateX(-50%);"></div>
    `;
    document.getElementById('ui-layer')!.appendChild(this.crosshair);
    this.crosshair.style.display = 'none';

    // 포인터 락 해제 시 → 전투 중이면 자동 일시정지
    this.input.onPointerLockExit = () => {
      if (this.phase === GamePhase.COMBAT) {
        this.phase = GamePhase.PAUSED;
        this.renderPauseContent();
        this.pauseOverlay.style.display = 'flex';
        this.crosshair.style.display = 'none';
      }
    };

    // 일시정지 오버레이
    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.style.cssText = `
      position: fixed; inset: 0; z-index: 25;
      background: rgba(0,0,0,0.75);
      display: none; flex-direction: column; align-items: center;
      justify-content: center; font-family: 'Segoe UI', Arial, sans-serif;
      color: #fff;
    `;
    this.pauseOverlay.addEventListener('click', (e) => {
      if (e.target === this.pauseOverlay && this.phase === GamePhase.PAUSED) {
        this.togglePause();
      }
    });
    document.getElementById('ui-layer')!.appendChild(this.pauseOverlay);

    // 히트박스 디버그 그룹
    this.debugGroup = new THREE.Group();
    this.debugGroup.visible = false;
    this.sceneManager.scene.add(this.debugGroup);

    // 모바일 일시정지 버튼
    if (this.input.isMobile) {
      this.mobilePauseBtn = document.createElement('div');
      this.mobilePauseBtn.style.cssText = `
        position:fixed; top:12px; right:12px; z-index:50;
        width:40px; height:40px; border-radius:50%;
        background:rgba(0,0,0,0.5); border:2px solid rgba(255,255,255,0.3);
        display:none; align-items:center; justify-content:center;
        font-size:20px; color:#fff; cursor:pointer; pointer-events:auto;
        user-select:none; touch-action:none;
      `;
      this.mobilePauseBtn.textContent = '⏸';
      this.mobilePauseBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (this.phase === GamePhase.COMBAT) this.togglePause();
      }, { passive: false });
      document.getElementById('ui-layer')!.appendChild(this.mobilePauseBtn);
    }

    this.loadPersistent();
    this.showTitle();
    this.coop = new CoopSystem(this);
  }

  private buildFences(): void {
    const half = 16;
    const sectionWidth = 4;
    const sections: { x: number; z: number; rot: number }[] = [];

    for (let i = -4; i < 4; i++) {
      sections.push({ x: i * sectionWidth + sectionWidth / 2, z: -half, rot: 0 });
    }
    for (let i = -4; i < 4; i++) {
      sections.push({ x: i * sectionWidth + sectionWidth / 2, z: half, rot: 0 });
    }
    for (let i = -4; i < 4; i++) {
      sections.push({ x: -half, z: i * sectionWidth + sectionWidth / 2, rot: Math.PI / 2 });
    }
    for (let i = -4; i < 4; i++) {
      sections.push({ x: half, z: i * sectionWidth + sectionWidth / 2, rot: Math.PI / 2 });
    }

    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      this.fences.push(
        new FenceSection(
          i,
          new THREE.Vector3(s.x, 0, s.z),
          s.rot,
          FENCE_MAX_HP,
          this.sceneManager.scene,
        ),
      );
    }
  }

  // ── 타이틀 화면 ──

  private showTitle(): void {
    let saveWave = 0;
    const saveRaw = localStorage.getItem(saveKey());
    if (saveRaw) {
      try { saveWave = JSON.parse(saveRaw).completedWave ?? 0; } catch { /* ignore */ }
    }

    this.titleOverlay = document.createElement('div');
    this.titleOverlay.style.cssText = `
      position: fixed; inset: 0; z-index: 30;
      background: rgba(0,0,0,0.88);
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; font-family: 'Segoe UI', Arial, sans-serif;
      color: #fff;
    `;

    const continueBtn = saveWave > 0 ? `
      <button id="continue-btn" style="
        padding: 16px 56px; background: #4caf50; color: #fff;
        border: none; border-radius: 8px; cursor: pointer;
        font-size: 20px; font-weight: 700; margin-bottom: 12px;
      ">계속하기 (Wave ${saveWave})</button><br>
    ` : '';

    this.titleOverlay.innerHTML = `
      <h1 style="font-size: 52px; margin-bottom: 8px; text-shadow: 0 0 30px rgba(229,57,53,0.6);">
        ZOMBIE DEFENSE
      </h1>
      <p style="font-size: 16px; color: #aaa; margin-bottom: 8px;">
        울타리를 지켜라. 좀비를 베어라.
      </p>
      <p id="title-coins" style="font-size: 15px; color: #ffd700; margin-bottom: 24px;">
        💰 ${this.persistentCoins} Gold
      </p>
      <div style="font-size: 13px; color: #888; line-height: 2; margin-bottom: 32px; text-align: center;">
        WASD - 이동 &nbsp;|&nbsp; 마우스 - 시점 회전 &nbsp;|&nbsp; 좌클릭 - 공격<br>
        스페이스 - 점프 &nbsp;|&nbsp; R (울타리 근처에서 홀드) - 수리<br>
        ESC - 일시정지 &nbsp;|&nbsp; H - 히트박스 표시
      </div>
      <div style="display: flex; flex-direction: column; align-items: center;">
        ${continueBtn}
        <button id="start-btn" style="
          padding: 16px 56px; background: #e53935; color: #fff;
          border: none; border-radius: 8px; cursor: pointer;
          font-size: 20px; font-weight: 700; margin-bottom: 10px;
        ">${saveWave > 0 ? '새 게임' : '게임 시작'}</button>
        <button id="weapon-select-btn" style="
          padding: 10px 40px; background: #e67e22; color: #fff;
          border: none; border-radius: 8px; cursor: pointer;
          font-size: 15px; font-weight: 600;
        ">⚔️ 무기 선택 (현재: ${this.weapon.name})</button>
      </div>
    `;
    document.getElementById('ui-layer')!.appendChild(this.titleOverlay);

    document.getElementById('start-btn')!.addEventListener('click', () => {
      this.titleOverlay.remove();
      this.startGame();
    });

    document.getElementById('weapon-select-btn')!.addEventListener('click', () => {
      this.showWeaponSelect(this.weapon.id, (cfg) => {
        const ws = this.getWeaponState(cfg.id);
        this.equipWeapon(cfg, ws.level);
        this.weapon.enchants = [...ws.enchants];
        // 선택 완료 후 타이틀 갱신
        const btn = document.getElementById('weapon-select-btn');
        if (btn) btn.textContent = `⚔️ 무기 선택 (현재: ${cfg.name})`;
        const coinsEl = document.getElementById('title-coins');
        if (coinsEl) coinsEl.textContent = `💰 ${this.persistentCoins} Gold`;
      }, '선택 완료');
    });

    if (saveWave > 0) {
      document.getElementById('continue-btn')!.addEventListener('click', () => {
        this.titleOverlay.remove();
        this.continueGame();
      });
    }
  }

  // ── 게임 시작 & 무기 선택 ──

  private startGame(): void {
    this.deleteSave();
    this.totalKills = 0;
    this.totalCoinsEarned = 0;
    this.player.coins = 0;
    this.player.hp = this.player.maxHp;
    for (const f of this.fences) f.repair(f.maxHp);

    this.showWeaponSelect(this.weapon.id, (cfg) => {
      const ws = this.getWeaponState(cfg.id);
      this.equipWeapon(cfg, ws.level);
      this.weapon.enchants = [...ws.enchants];
      this.beginCombat(1);
    });
  }

  private continueGame(): void {
    if (!this.loadSave()) {
      this.startGame();
      return;
    }
    const savedId = this.weapon.id;
    this.showWeaponSelect(savedId, (cfg) => {
      const ws = this.getWeaponState(cfg.id);
      this.equipWeapon(cfg, ws.level);
      this.weapon.enchants = [...ws.enchants];
      this.beginCombat(this.waveSystem.currentWave + 1);
    });
  }

  /** 무기 선택 화면: 강화/인첸트 포함 */
  private showWeaponSelect(defaultId: string, onConfirm: (cfg: WeaponConfig) => void, buttonLabel = '게임 시작'): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 35;
      background: rgba(0,0,0,0.92);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Segoe UI', Arial, sans-serif; color: #fff;
    `;

    overlay.innerHTML = `
      <div style="display: flex; width: 720px; height: 580px; background: rgba(30,30,40,0.97);
        border-radius: 14px; overflow: hidden; border: 1px solid #444; flex-direction: column;">
        <div style="padding: 14px 24px; border-bottom: 1px solid #333; flex-shrink: 0;
          display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2 style="margin: 0; font-size: 20px;">무기 선택</h2>
            <p style="margin: 2px 0 0; font-size: 12px; color: #888;">강화 및 인첸트 적용 가능</p>
          </div>
          <div id="ws-coins" style="font-size: 16px; color: #ffd700; font-weight: 700;">
            💰 ${this.persistentCoins}
          </div>
        </div>
        <div style="display: flex; flex: 1; min-height: 0;">
          <div id="ws-list" style="width: 190px; border-right: 1px solid #333;
            display: flex; flex-direction: column; overflow-y: auto; padding: 6px 0;">
            ${this.weaponConfigs.map((w) => {
              const icon = w.type === 'ranged' ? '🔫' : '⚔️';
              const ws = this.getWeaponState(w.id);
              const lvl = ws.level > 1 ? ` <span style="color:#ffd93d;font-size:11px;">Lv${ws.level}</span>` : '';
              return `<div class="ws-item" data-id="${w.id}" style="
                padding: 9px 14px; cursor: pointer; font-size: 14px;
                border-left: 3px solid transparent; transition: background 0.12s;
                display: flex; align-items: center; gap: 6px;
              "><span>${icon}</span><span>${w.name}${lvl}</span></div>`;
            }).join('')}
          </div>
          <div id="ws-detail" style="flex: 1; padding: 16px 20px; display: flex;
            flex-direction: column; align-items: center; overflow-y: auto;">
            <p style="color: #555; font-size: 14px;">← 무기를 선택하세요</p>
          </div>
        </div>
        <div style="padding: 12px 24px; border-top: 1px solid #333; flex-shrink: 0; text-align: center;">
          <button id="ws-start" style="
            padding: 10px 56px; background: #e53935; color: #fff;
            border: none; border-radius: 8px; cursor: pointer;
            font-size: 16px; font-weight: 700; opacity: 0.5; pointer-events: none;
          " disabled>${buttonLabel}</button>
        </div>
      </div>
    `;
    document.getElementById('ui-layer')!.appendChild(overlay);

    let selectedCfg: WeaponConfig | null = null;
    const items = overlay.querySelectorAll('.ws-item');
    const detail = overlay.querySelector('#ws-detail')!;
    const startBtn = overlay.querySelector('#ws-start') as HTMLButtonElement;
    const coinsEl = overlay.querySelector('#ws-coins')!;

    const updateCoinsDisplay = (): void => {
      coinsEl.textContent = `💰 ${this.persistentCoins}`;
    };

    const renderDetail = (cfg: WeaponConfig): void => {
      const ws = this.getWeaponState(cfg.id);
      const isRanged = cfg.type === 'ranged';
      const typeLabel = isRanged ? '🔫 원거리' : '⚔️ 근접';
      const typeColor = isRanged ? '#69d5ff' : '#ff9866';

      // 현재 레벨 스탯 계산
      let dmg = cfg.damage, rng = cfg.range, spd = cfg.swingSpeed, kb = cfg.knockback, arc = cfg.arc, pellets = cfg.pellets ?? 1;
      for (const upg of cfg.upgrades) {
        if (upg.level <= ws.level) {
          dmg = upg.damage; rng = upg.range;
          if (upg.swingSpeed !== undefined) spd = upg.swingSpeed;
          if (upg.knockback !== undefined) kb = upg.knockback;
          if (upg.arc !== undefined) arc = upg.arc;
          if (upg.pellets !== undefined) pellets = upg.pellets;
        }
      }

      const pelletsRow = isRanged && pellets > 1
        ? `<div style="display:flex;justify-content:space-between;"><span>발사 탄수</span><span style="color:#f9ca24;">${pellets}</span></div>` : '';

      // 강화 버튼
      const nextUpg = cfg.upgrades.find((u) => u.level === ws.level + 1);
      let upgradeHtml = '';
      if (nextUpg) {
        const canAfford = this.persistentCoins >= nextUpg.cost;
        upgradeHtml = `
          <button id="ws-upgrade" style="
            width: 100%; padding: 8px; margin-top: 10px;
            background: ${canAfford ? '#4caf50' : '#444'}; color: ${canAfford ? '#fff' : '#888'};
            border: none; border-radius: 6px; cursor: ${canAfford ? 'pointer' : 'default'};
            font-size: 13px; font-weight: 700;
          " ${canAfford ? '' : 'disabled'}>⬆ 강화 Lv${ws.level} → Lv${nextUpg.level} (${nextUpg.cost}G)</button>
        `;
      } else {
        upgradeHtml = `<div style="color:#4caf50;font-size:12px;margin-top:10px;font-weight:700;">✓ 최대 레벨</div>`;
      }

      // 인첸트: 보유 목록 + 랜덤 뽑기 버튼
      const isRangedWeapon = cfg.type === 'ranged';
      const availableEnchants = ENCHANT_INFO.filter((e) => !ws.enchants.includes(e.id) && (!e.rangedOnly || isRangedWeapon));
      const ownedHtml = ws.enchants.map((eid) => {
        const info = ENCHANT_INFO.find((e) => e.id === eid);
        return info ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;background:rgba(76,175,80,0.15);border:1px solid #4caf50;border-radius:4px;font-size:11px;color:#4caf50;">${info.icon} ${info.name}</span>` : '';
      }).join('');
      const canDrawEnchant = availableEnchants.length > 0 && this.persistentCoins >= ENCHANT_COST;
      const drawBtnHtml = availableEnchants.length > 0 ? `
        <button id="ws-draw-ench" style="
          width: 100%; padding: 8px; margin-top: 6px;
          background: ${canDrawEnchant ? '#e67e22' : '#444'}; color: ${canDrawEnchant ? '#fff' : '#888'};
          border: none; border-radius: 6px; cursor: ${canDrawEnchant ? 'pointer' : 'default'};
          font-size: 13px; font-weight: 700;
        " ${canDrawEnchant ? '' : 'disabled'}>🎲 인첸트 뽑기 (${ENCHANT_COST}G)</button>
      ` : `<div style="color:#4caf50;font-size:11px;margin-top:6px;font-weight:700;">✓ 모든 인첸트 보유</div>`;

      detail.innerHTML = `
        <h2 style="font-size: 20px; margin: 0 0 2px;">${cfg.name}</h2>
        <div style="font-size: 11px; color: ${typeColor}; font-weight: 700; margin-bottom: 4px;">${typeLabel} · Lv ${ws.level}</div>
        <div style="width: 100%; font-size: 13px; line-height: 1.8; color: #ddd;">
          <div style="display:flex;justify-content:space-between;"><span>공격력</span><span style="color:#ff6b6b;">${dmg}</span></div>
          <div style="display:flex;justify-content:space-between;"><span>사거리</span><span style="color:#69b3ff;">${rng}</span></div>
          ${pelletsRow}
          <div style="display:flex;justify-content:space-between;"><span>속도</span><span style="color:#ffd93d;">${spd.toFixed(2)}s</span></div>
          <div style="display:flex;justify-content:space-between;"><span>넉백</span><span style="color:#a29bfe;">${kb.toFixed(1)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span>범위각</span><span style="color:#81ecec;">${arc}°</span></div>
        </div>
        ${upgradeHtml}
        <div style="width:100%;margin-top:12px;border-top:1px solid #333;padding-top:10px;">
          <div style="font-size:12px;color:#aaa;margin-bottom:6px;font-weight:600;">인첸트</div>
          ${ownedHtml ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">${ownedHtml}</div>` : ''}
          ${drawBtnHtml}
        </div>
      `;

      // 강화 버튼 이벤트
      const upgBtn = detail.querySelector('#ws-upgrade') as HTMLButtonElement | null;
      if (upgBtn && nextUpg) {
        upgBtn.addEventListener('click', () => {
          if (this.persistentCoins < nextUpg.cost) return;
          this.persistentCoins -= nextUpg.cost;
          ws.level = nextUpg.level;
          this.savePersistent();
          updateCoinsDisplay();
          renderDetail(cfg);
          refreshListLevels();
        });
      }

      // 인첸트 뽑기 버튼 이벤트
      const drawBtn = detail.querySelector('#ws-draw-ench') as HTMLButtonElement | null;
      if (drawBtn && availableEnchants.length > 0) {
        drawBtn.addEventListener('click', () => {
          if (this.persistentCoins < ENCHANT_COST) return;
          const pick = availableEnchants[Math.floor(Math.random() * availableEnchants.length)];
          this.persistentCoins -= ENCHANT_COST;
          ws.enchants.push(pick.id);
          this.savePersistent();
          updateCoinsDisplay();
          renderDetail(cfg);
          // 뽑기 결과 알림
          const toast = document.createElement('div');
          toast.style.cssText = `
            position:fixed;top:20%;left:50%;transform:translateX(-50%);z-index:99;
            background:rgba(0,0,0,0.9);border:2px solid ${pick.color};border-radius:10px;
            padding:16px 28px;text-align:center;color:#fff;font-family:'Segoe UI',Arial,sans-serif;
            animation:fadeInOut 2s forwards;pointer-events:none;
          `;
          toast.innerHTML = `<div style="font-size:28px;">${pick.icon}</div><div style="font-size:15px;font-weight:700;margin-top:4px;color:${pick.color};">${pick.name} 획득!</div><div style="font-size:11px;color:#aaa;margin-top:2px;">${pick.desc}</div>`;
          const style = document.createElement('style');
          style.textContent = `@keyframes fadeInOut{0%{opacity:0;transform:translateX(-50%) scale(0.8)}15%{opacity:1;transform:translateX(-50%) scale(1.05)}25%{transform:translateX(-50%) scale(1)}80%{opacity:1}100%{opacity:0}}`;
          document.head.appendChild(style);
          document.body.appendChild(toast);
          setTimeout(() => { toast.remove(); style.remove(); }, 2000);
        });
      }
    };

    const refreshListLevels = (): void => {
      items.forEach((el) => {
        const id = (el as HTMLElement).dataset.id!;
        const ws = this.getWeaponState(id);
        const nameSpan = el.querySelectorAll('span')[1];
        if (nameSpan) {
          const cfg = this.weaponConfigs.find((w) => w.id === id)!;
          const lvl = ws.level > 1 ? ` <span style="color:#ffd93d;font-size:11px;">Lv${ws.level}</span>` : '';
          nameSpan.innerHTML = `${cfg.name}${lvl}`;
        }
      });
    };

    const selectItem = (item: Element): void => {
      const id = (item as HTMLElement).dataset.id!;
      selectedCfg = this.weaponConfigs.find((w) => w.id === id) ?? null;
      if (!selectedCfg) return;

      items.forEach((el) => {
        (el as HTMLElement).style.borderLeftColor = 'transparent';
        (el as HTMLElement).style.background = 'transparent';
        (el as HTMLElement).style.color = '#ccc';
      });
      (item as HTMLElement).style.borderLeftColor = '#e53935';
      (item as HTMLElement).style.background = 'rgba(229,57,53,0.12)';
      (item as HTMLElement).style.color = '#fff';

      renderDetail(selectedCfg);

      startBtn.disabled = false;
      startBtn.style.opacity = '1';
      startBtn.style.pointerEvents = 'auto';
    };

    items.forEach((item) => {
      item.addEventListener('click', () => selectItem(item));
    });

    const defaultItem = overlay.querySelector(`.ws-item[data-id="${defaultId}"]`);
    if (defaultItem) selectItem(defaultItem);

    startBtn.addEventListener('click', () => {
      if (!selectedCfg) return;
      overlay.remove();
      onConfirm(selectedCfg);
    });
  }

  /** 실제 전투 시작 */
  private beginCombat(wave: number): void {
    this.phase = GamePhase.COMBAT;
    this.hud.show();
    this.crosshair.style.display = 'block';
    this.input.showMobileControls(true);
    if (this.mobilePauseBtn) this.mobilePauseBtn.style.display = 'flex';
    this.input.requestPointerLock();
    this.waveSystem.startWave(wave);
    this.waveAnnounce.show(wave);
  }

  // ── 웨이브 사이 대기 ──

  private showBetweenWaveOverlay(completedWave: number): void {
    this.betweenWaveTimer = 5;
    this.betweenWaveOverlay = document.createElement('div');
    this.betweenWaveOverlay.style.cssText = `
      position: fixed; inset: 0; z-index: 20;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Segoe UI', Arial, sans-serif; color: #fff; pointer-events: none;
    `;
    this.betweenWaveOverlay.innerHTML = `
      <div style="text-align: center; pointer-events: auto;">
        <h1 style="font-size: 42px; margin: 0 0 8px;
          text-shadow: 0 0 20px rgba(76,175,80,0.8);">Wave ${completedWave} 클리어!</h1>
        <p style="font-size: 18px; color: #aaa; margin: 0 0 24px;">
          다음 웨이브가 <span id="bw-countdown" style="color:#fff; font-weight:700;">5</span>초 후 시작됩니다
        </p>
        <button id="bw-next" style="
          padding: 12px 48px; background: #4caf50; color: #fff;
          border: none; border-radius: 8px; cursor: pointer;
          font-size: 16px; font-weight: 700;
        ">바로 시작</button>
      </div>
    `;
    document.getElementById('ui-layer')!.appendChild(this.betweenWaveOverlay);

    document.getElementById('bw-next')!.addEventListener('click', () => {
      if (this.phase !== GamePhase.SHOP) return;
      this.betweenWaveTimer = Infinity;
      this.startNextWave();
    });
  }

  private startNextWave(): void {
    this.betweenWaveOverlay?.remove();
    this.betweenWaveOverlay = null;
    this.crosshair.style.display = 'block';
    const nextWave = this.waveSystem.currentWave + 1;
    this.waveSystem.startWave(nextWave);
    this.waveAnnounce.show(nextWave);
    this.phase = GamePhase.COMBAT;
    this.input.requestPointerLock();
  }

  // ── 게임 루프 ──

  start(): void {
    const loop = (): void => {
      requestAnimationFrame(loop);
      let dt = this.clock.getDelta();
      dt = Math.min(dt, 0.1);

      if (this.hitStop.active) {
        this.hitStop.timer -= dt;
        if (this.hitStop.timer <= 0) this.hitStop.active = false;
        dt *= 0.05;
      }

      this.update(dt);
      this.render();
      this.input.endFrame();
    };
    loop();
  }

  private togglePause(): void {
    if (this.phase === GamePhase.COMBAT) {
      this.phase = GamePhase.PAUSED;
      this.renderPauseContent();
      this.pauseOverlay.style.display = 'flex';
      this.crosshair.style.display = 'none';
      this.input.showMobileControls(false);
      if (this.mobilePauseBtn) this.mobilePauseBtn.style.display = 'none';
      if (!this.input.isMobile) document.exitPointerLock();
    } else if (this.phase === GamePhase.PAUSED) {
      this.phase = GamePhase.COMBAT;
      this.pauseOverlay.style.display = 'none';
      this.crosshair.style.display = 'block';
      this.input.showMobileControls(true);
      if (this.mobilePauseBtn) this.mobilePauseBtn.style.display = 'flex';
      this.input.requestPointerLock();
    }
  }

  private update(dt: number): void {
    this.coop.tick(this.input.mouseJustDown && this.phase === GamePhase.COMBAT);
    if (this.input.justPressed('escape') && this.phase === GamePhase.PAUSED) {
      this.togglePause();
    }

    if (this.phase === GamePhase.PAUSED) {
      this.fpsCamera.update(this.player.position);
      return;
    }

    if (this.input.pointerLocked) {
      this.fpsCamera.applyMouseDelta(this.input.mouseDX, this.input.mouseDY);
    }

    if (this.coop.isGuest) {
      if (this.player.hp > 0 && this.coopHostPhase === GamePhase.COMBAT) {
        const move = new THREE.Vector3();
        if (this.input.isDown('w') || this.input.isDown('arrowup')) move.add(this.fpsCamera.getForward());
        if (this.input.isDown('s') || this.input.isDown('arrowdown')) move.sub(this.fpsCamera.getForward());
        if (this.input.isDown('d') || this.input.isDown('arrowright')) move.add(this.fpsCamera.getRight());
        if (this.input.isDown('a') || this.input.isDown('arrowleft')) move.sub(this.fpsCamera.getRight());
        if (this.input.justPressed(' ')) this.player.jump();
        this.player.update(move, this.fpsCamera.yaw, dt);
        updateCombat(this.player, this.weapon, [], this.input, this.hitStop, this.cameraShake, this.particles, this.fpsCamera.pitch, dt);
      }
      this.fpsCamera.update(this.player.position);
      this.particles.update(dt);
      return;
    }

    if (this.input.justPressed('h')) {
      this.debugHitboxes = !this.debugHitboxes;
      this.debugGroup.visible = this.debugHitboxes;
    }

    this.waveAnnounce.update(dt);

    switch (this.phase) {
      case GamePhase.COMBAT:
        this.updateCombatPhase(dt);
        break;
      case GamePhase.SHOP: {
        // 웨이브 사이 카운트다운
        this.betweenWaveTimer -= dt;
        const el = document.getElementById('bw-countdown');
        if (el) el.textContent = String(Math.ceil(Math.max(0, this.betweenWaveTimer)));
        if (this.betweenWaveTimer <= 0) {
          this.startNextWave();
        }
        break;
      }
    }

    this.fpsCamera.update(this.player.position);
    this.cameraShake.update(dt);
    this.fpsCamera.camera.position.add(this.cameraShake.offset);
    this.particles.update(dt);
  }

  private updateCombatPhase(dt: number): void {
    const forward = this.fpsCamera.getForward();
    const right = this.fpsCamera.getRight();
    const moveDir = new THREE.Vector3();

    if (this.input.isDown('w') || this.input.isDown('arrowup')) moveDir.add(forward);
    if (this.input.isDown('s') || this.input.isDown('arrowdown')) moveDir.sub(forward);
    if (this.input.isDown('d') || this.input.isDown('arrowright')) moveDir.add(right);
    if (this.input.isDown('a') || this.input.isDown('arrowleft')) moveDir.sub(right);

    if (this.input.justPressed(' ')) {
      this.player.jump();
    }

    const facingAngle = this.fpsCamera.yaw;
    this.player.update(moveDir, facingAngle, dt);

    // ADS: 원거리 무기는 우클릭 조준 가능
    const canADS = this.weapon.type === 'ranged';
    const isADS = canADS && this.input.mouseRightDown;
    const adsFov = this.weapon.id === 'sniper' ? 25 : this.weapon.id === 'shotgun' ? 62 : 50;
    this.fpsCamera.lerpFov(isADS ? adsFov : 75, dt);
    this.fpsCamera.setSensitivity(isADS ? 0.0008 : 0.002);
    this.weapon.updateAim(isADS, dt);

    const activeZombies = this.zombiePool.getActive();
    for (const peer of this.coopPeers.values()) {
      peer.player.attackCooldown = Math.max(0, peer.player.attackCooldown - dt);
      if (peer.player.hp > 0) updateCombat(peer.player, peer.weapon, activeZombies,
        { mouseJustDown: peer.attack } as Input, { active: false, timer: 0 },
        this.cameraShake, this.particles, peer.pitch, dt);
      peer.attack = false;
    }
    updateCombat(
      this.player,
      this.weapon,
      activeZombies,
      this.input,
      this.hitStop,
      this.cameraShake,
      this.particles,
      this.fpsCamera.pitch,
      dt,
    );

    for (const z of activeZombies) {
      let target = this.player;
      for (const peer of this.coopPeers.values()) {
        if (peer.player.hp > 0 && peer.player.position.distanceToSquared(z.position) < target.position.distanceToSquared(z.position)) target = peer.player;
      }
      updateZombieAI(z, target, this.fences, dt);
    }

    // 죽은 좀비에서 코인 스폰
    for (const z of this.zombiePool.all) {
      if (z.active && z.state === 'DYING' && z.stateTimer > 0.38) {
        spawnCoin(this.coinPool, z.position.x, z.position.z, z.coinValue);
        this.totalKills++;
        this.totalCoinsEarned += z.coinValue;
      }
    }

    this.waveSystem.update(dt, this.zombiePool);
    const coinsBefore = this.player.coins;
    updateCoins(this.coinPool, this.player, this.particles, dt);
    const coinsGained = this.player.coins - coinsBefore;
    if (coinsGained > 0) {
      this.persistentCoins += coinsGained;
      this.savePersistent();
    }
    this.repairSystem.update(this.player, this.fences, this.input, dt);

    const zombiesLeft = this.waveSystem.zombiesRemaining(
      this.zombiePool.getActive().filter((z) => z.state !== 'DYING').length,
    );
    const nearFence = this.fences.some(
      (f) => f.hp < f.maxHp && distanceXZ(this.player.position, f.worldPos) < 3.5,
    );
    this.hud.update(
      this.player.hp,
      this.player.maxHp,
      this.player.coins,
      this.waveSystem.currentWave,
      this.waveSystem.totalWaves,
      zombiesLeft,
      this.weapon.name,
      this.repairSystem.castProgress,
      nearFence,
      this.player.attackCooldown,
      this.player.attackCooldownMax,
    );

    // 웨이브 완료 체크
    const activeNonDying = this.zombiePool.getActive().filter((z) => z.state !== 'DYING').length;
    if (this.waveSystem.isWaveComplete(activeNonDying)) {
      const bonus = 20 + this.waveSystem.currentWave * 10;
      this.player.coins += bonus;
      this.totalCoinsEarned += bonus;
      this.persistentCoins += bonus;
      this.savePersistent();
      this.player.hp = this.player.maxHp;

      this.phase = GamePhase.SHOP;
      this.crosshair.style.display = 'none';
      this.saveGame();
      if (!this.input.isMobile) document.exitPointerLock();
      this.showBetweenWaveOverlay(this.waveSystem.currentWave);
    }

    if (this.debugHitboxes) {
      this.updateDebugVisuals();
    }

    // 플레이어 사망 체크
    if (this.player.hp <= 0) {
      this.phase = GamePhase.GAMEOVER;
      this.deleteSave();
      this.crosshair.style.display = 'none';
      this.input.showMobileControls(false);
      if (this.mobilePauseBtn) this.mobilePauseBtn.style.display = 'none';
      if (!this.input.isMobile) document.exitPointerLock();
      this.gameOverUI.show(false, this.waveSystem.currentWave, this.totalKills, this.totalCoinsEarned);
      this.hud.hide();
    }
  }

  private render(): void {
    this.sceneManager.renderer.render(this.sceneManager.scene, this.fpsCamera.camera);
  }

  // ── 무기 장착 ──

  private equipWeapon(cfg: WeaponConfig, level: number): void {
    this.fpsCamera.camera.remove(this.weapon.viewModel);
    this.weapon = new Weapon(cfg);
    this.weapon.applyConfig(cfg, level);
    const ws = this.getWeaponState(cfg.id);
    this.weapon.enchants = [...ws.enchants];
    this.fpsCamera.camera.add(this.weapon.viewModel);
  }

  // ── 일시정지 UI ──

  private renderPauseContent(): void {
    const cardsHtml = this.weaponConfigs.map((w) => {
      const isEquipped = w.id === this.weapon.id;
      const typeLabel = w.type === 'ranged' ? '🔫' : '⚔️';
      const ws = this.getWeaponState(w.id);
      const lvl = ws.level > 1 ? ` Lv${ws.level}` : '';
      const enchIcons = ws.enchants.map((e) => ENCHANT_INFO.find((ei) => ei.id === e)?.icon ?? '').join('');
      return `
        <div class="pw-card" data-id="${w.id}" style="
          background: ${isEquipped ? '#1a3a1a' : '#1e1e2e'};
          border: 2px solid ${isEquipped ? '#4caf50' : '#555'};
          border-radius: 10px; padding: 14px 16px; min-width: 110px;
          text-align: center; cursor: ${isEquipped ? 'default' : 'pointer'};
          transition: border-color 0.15s; user-select: none;
        ">
          <div style="font-size: 18px; margin-bottom: 4px;">${typeLabel}</div>
          <div style="font-size: 14px; font-weight: 700;">${w.name}${lvl}</div>
          ${enchIcons ? `<div style="font-size:12px;margin-top:2px;">${enchIcons}</div>` : ''}
          <div style="font-size: 12px; color: ${isEquipped ? '#4caf50' : '#ffb347'}; font-weight: 600; margin-top: 4px;">
            ${isEquipped ? '✓ 장착됨' : '장착하기'}
          </div>
        </div>
      `;
    }).join('');

    this.pauseOverlay.innerHTML = `
      <div style="text-align: center; max-width: 860px; width: 95%; max-height: 90vh; overflow-y: auto;"
           onclick="event.stopPropagation()">
        <h1 style="font-size: 30px; margin-bottom: 6px;">⏸ 일시정지</h1>
        <p style="font-size: 13px; color: #888; margin-bottom: 18px;">무기를 선택하거나 배경을 클릭해 계속하기</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-bottom: 22px;">
          ${cardsHtml}
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
          <button id="pw-resume" style="
            padding: 12px 48px; background: #4caf50; color: #fff;
            border: none; border-radius: 8px; cursor: pointer;
            font-size: 16px; font-weight: 700; width: 220px;
          ">계속하기 (ESC)</button>
          <button id="pw-save-exit" style="
            padding: 10px 48px; background: #555; color: #ccc;
            border: none; border-radius: 8px; cursor: pointer;
            font-size: 14px; font-weight: 600; width: 220px;
          ">저장 및 종료</button>
        </div>
      </div>
    `;

    this.pauseOverlay.querySelector('#pw-resume')!.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.phase === GamePhase.PAUSED) this.togglePause();
    });

    this.pauseOverlay.querySelector('#pw-save-exit')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.saveGame();
      this.phase = GamePhase.PREGAME;
      this.pauseOverlay.style.display = 'none';
      this.hud.hide();
      this.crosshair.style.display = 'none';
      this.showTitle();
    });

    this.pauseOverlay.querySelectorAll('.pw-card').forEach((card) => {
      const id = (card as HTMLElement).dataset.id!;
      if (id === this.weapon.id) return;
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const cfg = this.weaponConfigs.find((w) => w.id === id);
        if (cfg) {
          const ws = this.getWeaponState(cfg.id);
          this.equipWeapon(cfg, ws.level);
          this.renderPauseContent();
        }
      });
    });
  }

  // ── 세이브/로드 ──

  private saveGame(): void {
    if (this.coop?.isGuest) return;
    const data = {
      equippedWeaponId: this.weapon.id,
      completedWave: this.waveSystem.currentWave,
      totalKills: this.totalKills,
      totalCoinsEarned: this.totalCoinsEarned,
      fenceHPs: this.fences.map((f) => f.hp),
    };
    localStorage.setItem(saveKey(), JSON.stringify(data));
  }

  private loadSave(): boolean {
    const raw = localStorage.getItem(saveKey());
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      this.totalKills = data.totalKills ?? 0;
      this.totalCoinsEarned = data.totalCoinsEarned ?? 0;

      const weaponCfg = this.weaponConfigs.find((w) => w.id === data.equippedWeaponId);
      if (weaponCfg) this.equipWeapon(weaponCfg, 1);

      this.waveSystem.currentWave = data.completedWave ?? 0;

      if (Array.isArray(data.fenceHPs)) {
        for (let i = 0; i < this.fences.length && i < data.fenceHPs.length; i++) {
          this.fences[i].restoreHp(data.fenceHPs[i]);
        }
      }
      this.player.hp = this.player.maxHp;
      return true;
    } catch {
      return false;
    }
  }

  private deleteSave(): void {
    localStorage.removeItem(saveKey());
  }

  // ── 영구 저장 (코인, 무기 강화/인첸트) ──

  private getWeaponState(id: string): WeaponState {
    if (!this.weaponStates.has(id)) {
      this.weaponStates.set(id, { level: 1, enchants: [] });
    }
    return this.weaponStates.get(id)!;
  }

  private savePersistent(): void {
    if (this.coop?.isGuest) return;
    const weapons: Record<string, WeaponState> = {};
    for (const [id, state] of this.weaponStates) {
      weapons[id] = state;
    }
    localStorage.setItem(progressKey(), JSON.stringify({
      coins: this.persistentCoins,
      weapons,
    }));
  }

  private loadPersistent(): void {
    const raw = localStorage.getItem(progressKey());
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      this.persistentCoins = data.coins ?? 0;
      if (data.weapons) {
        for (const [id, state] of Object.entries(data.weapons)) {
          const s = state as WeaponState;
          this.weaponStates.set(id, { level: s.level ?? 1, enchants: s.enchants ?? [] });
        }
      }
    } catch { /* ignore */ }
  }

  // ── 히트박스 디버그 시각화 ──

  private updateDebugVisuals(): void {
    if (this.weapon.range !== this.debugSectorRange || this.weapon.arc !== this.debugSectorArc) {
      this.rebuildDebugSector();
    }

    this.debugSector.position.set(this.player.position.x, 0.05, this.player.position.z);
    this.debugSector.rotation.y = this.player.facingAngle;
    this.debugSectorEdge.position.set(this.player.position.x, 0.05, this.player.position.z);
    this.debugSectorEdge.rotation.y = this.player.facingAngle;

    const activeZombies = this.zombiePool.getActive().filter((z) => z.state !== 'DYING');

    while (this.debugZombieCircles.length < activeZombies.length) {
      const circle = this.createDebugCircle(1.5, 0xff4444);
      this.debugGroup.add(circle);
      this.debugZombieCircles.push(circle);
    }

    for (let i = 0; i < this.debugZombieCircles.length; i++) {
      if (i < activeZombies.length) {
        this.debugZombieCircles[i].visible = true;
        this.debugZombieCircles[i].position.set(
          activeZombies[i].position.x, 0.05, activeZombies[i].position.z,
        );
      } else {
        this.debugZombieCircles[i].visible = false;
      }
    }

    while (this.debugZombieBoxes.length < activeZombies.length) {
      this.debugZombieBoxes.push(this.createZombieHitbox());
    }

    for (let i = 0; i < this.debugZombieBoxes.length; i++) {
      if (i < activeZombies.length) {
        this.debugZombieBoxes[i].visible = true;
        const z = activeZombies[i];
        this.debugZombieBoxes[i].position.set(
          z.position.x,
          z.position.y + 0.95,
          z.position.z,
        );
      } else {
        this.debugZombieBoxes[i].visible = false;
      }
    }
  }

  private rebuildDebugSector(): void {
    if (this.debugSector) {
      this.debugGroup.remove(this.debugSector);
      this.debugSector.geometry.dispose();
    }
    if (this.debugSectorEdge) {
      this.debugGroup.remove(this.debugSectorEdge);
      this.debugSectorEdge.geometry.dispose();
    }

    const range = this.weapon.range;
    const arc = this.weapon.arc;
    this.debugSectorRange = range;
    this.debugSectorArc = arc;

    const sectorGeo = this.buildSectorGeometry(range, arc);
    const sectorMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00, transparent: true, opacity: 0.18,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.debugSector = new THREE.Mesh(sectorGeo, sectorMat);
    this.debugSector.renderOrder = 999;
    this.debugGroup.add(this.debugSector);

    const edgeGeo = this.buildSectorEdgeGeometry(range, arc);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x44ff44 });
    this.debugSectorEdge = new THREE.Line(edgeGeo, edgeMat);
    this.debugSectorEdge.renderOrder = 999;
    this.debugGroup.add(this.debugSectorEdge);
  }

  private buildSectorGeometry(radius: number, arcDeg: number): THREE.BufferGeometry {
    const halfArc = (arcDeg * Math.PI / 180) / 2;
    const segments = 32;
    const verts: number[] = [];

    for (let i = 0; i < segments; i++) {
      const a1 = -halfArc + (i / segments) * 2 * halfArc;
      const a2 = -halfArc + ((i + 1) / segments) * 2 * halfArc;
      verts.push(0, 0, 0);
      verts.push(-Math.sin(a1) * radius, 0, -Math.cos(a1) * radius);
      verts.push(-Math.sin(a2) * radius, 0, -Math.cos(a2) * radius);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    return geo;
  }

  private buildSectorEdgeGeometry(radius: number, arcDeg: number): THREE.BufferGeometry {
    const halfArc = (arcDeg * Math.PI / 180) / 2;
    const segments = 32;
    const points: THREE.Vector3[] = [];

    points.push(new THREE.Vector3(0, 0, 0));
    for (let i = 0; i <= segments; i++) {
      const a = -halfArc + (i / segments) * 2 * halfArc;
      points.push(new THREE.Vector3(-Math.sin(a) * radius, 0, -Math.cos(a) * radius));
    }
    points.push(new THREE.Vector3(0, 0, 0));

    return new THREE.BufferGeometry().setFromPoints(points);
  }

  private createZombieHitbox(): THREE.LineSegments {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.9, 1.9, 0.9));
    const mat = new THREE.LineBasicMaterial({ color: 0xff7700, depthTest: false });
    const mesh = new THREE.LineSegments(geo, mat);
    mesh.renderOrder = 999;
    this.debugGroup.add(mesh);
    return mesh;
  }

  private createDebugCircle(radius: number, color: number): THREE.Line {
    const segments = 48;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color });
    return new THREE.Line(geo, mat);
  }
}
