import * as THREE from 'three';
import { GamePhase } from './types';
import type { WeaponConfig, ZombieConfig, WaveConfig } from './types';
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
import { ShopUI } from './ui/ShopUI';
import { WaveAnnouncement } from './ui/WaveAnnouncement';
import { GameOverUI } from './ui/GameOverUI';

import weaponsData from './config/weapons.json';
import zombiesData from './config/zombies.json';
import wavesData from './config/waves.json';

const FENCE_MAX_HP = 100;
const SAVE_KEY = 'zombie-defense-save';
const PERSISTENT_KEY = 'zombie-defense-progress';

export class Game {
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
  private shopUI!: ShopUI;
  private waveAnnounce!: WaveAnnouncement;
  private gameOverUI!: GameOverUI;
  private crosshair!: HTMLDivElement;

  // State
  phase = GamePhase.PREGAME;
  private weaponConfigs = weaponsData as WeaponConfig[];
  private zombieConfig = (zombiesData as ZombieConfig[])[0];
  private waveConfigs = wavesData as WaveConfig[];
  private ownedWeapons = new Map<string, number>();
  private totalKills = 0;
  private totalCoinsEarned = 0;

  private titleOverlay!: HTMLDivElement;
  private pauseOverlay!: HTMLDivElement;

  // 히트박스 디버그
  private debugHitboxes = false;
  private debugGroup!: THREE.Group;
  private debugSector!: THREE.Mesh;
  private debugSectorEdge!: THREE.Line;
  private debugZombieCircles: THREE.Line[] = [];
  private debugSectorRange = 0;
  private debugSectorArc = 0;

  init(): void {
    // Scene
    this.sceneManager = new SceneManager();
    this.fpsCamera = new FPSCamera();
    // 카메라를 씬에 추가해야 자식(무기 뷰모델)이 렌더링됨
    this.sceneManager.scene.add(this.fpsCamera.camera);
    this.input = new Input(this.sceneManager.canvas);

    // Player
    this.player = new Player(this.sceneManager.scene);

    // 기본 무기 (나무검)
    const defaultWeapon = this.weaponConfigs[0];
    this.weapon = new Weapon(defaultWeapon);
    this.ownedWeapons.set(defaultWeapon.id, 1);
    // FPS: 무기 뷰모델을 카메라에 부착
    this.fpsCamera.camera.add(this.weapon.viewModel);
    // 뷰모델 전용 조명 (어두운 곳에서도 무기가 보이게)
    const viewLight = new THREE.PointLight(0xffffff, 0.6, 3);
    viewLight.position.set(0.3, -0.2, -0.5);
    this.fpsCamera.camera.add(viewLight);

    // 영구 저장 데이터 로드 (코인, 소유 무기)
    this.loadPersistent();

    // Fences
    this.buildFences();

    // Pools
    this.zombiePool = new ObjectPool<Zombie>(
      () => new Zombie(this.sceneManager.scene),
      10,
    );
    this.coinPool = new ObjectPool<Coin>(
      () => new Coin(this.sceneManager.scene),
      20,
    );

    // Systems
    this.waveSystem = new WaveSystem(this.waveConfigs, this.zombieConfig);

    // Effects
    this.particles = new ParticleSystem(this.sceneManager.scene);

    // UI
    this.hud = new HUD();
    this.hud.hide();
    this.waveAnnounce = new WaveAnnouncement();
    this.gameOverUI = new GameOverUI();

    this.shopUI = new ShopUI({
      onBuyWeapon: (id) => this.buyWeapon(id),
      onUpgradeWeapon: (id) => this.upgradeWeapon(id),
      onRepairAll: () => this.repairAllFences(),
      onStartWave: () => this.startNextWave(),
    });

    // 크로스헤어 (십자가)
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
        this.pauseOverlay.style.display = 'flex';
        this.crosshair.style.display = 'none';
      }
    };

    // 일시정지 오버레이
    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.style.cssText = `
      position: fixed; inset: 0; z-index: 25;
      background: rgba(0,0,0,0.7);
      display: none; flex-direction: column; align-items: center;
      justify-content: center; font-family: 'Segoe UI', Arial, sans-serif;
      color: #fff;
    `;
    this.pauseOverlay.innerHTML = `
      <h1 style="font-size: 48px; margin-bottom: 16px;">일시정지</h1>
      <p style="font-size: 14px; color: #aaa;">클릭하거나 ESC를 눌러 계속하기</p>
    `;
    this.pauseOverlay.addEventListener('click', () => {
      if (this.phase === GamePhase.PAUSED) {
        this.togglePause();
      }
    });
    document.getElementById('ui-layer')!.appendChild(this.pauseOverlay);

    // 히트박스 디버그 그룹
    this.debugGroup = new THREE.Group();
    this.debugGroup.visible = false;
    this.sceneManager.scene.add(this.debugGroup);

    // Title screen
    this.showTitle();
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

  private showTitle(): void {
    // 세이브 데이터 확인
    let saveWave = 0;
    const saveRaw = localStorage.getItem(SAVE_KEY);
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
      <p style="font-size: 16px; color: #aaa; margin-bottom: 32px;">
        울타리를 지켜라. 좀비를 베어라. 검을 강화하라.
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
          font-size: 20px; font-weight: 700; margin-bottom: 12px;
        ">${saveWave > 0 ? '새 게임' : '게임 시작'}</button>
        <button id="weapon-shop-btn" style="
          padding: 12px 40px; background: #ff9800; color: #fff;
          border: none; border-radius: 8px; cursor: pointer;
          font-size: 18px; font-weight: 700;
        ">무기 (${this.player.coins} 코인)</button>
      </div>
    `;
    document.getElementById('ui-layer')!.appendChild(this.titleOverlay);

    document.getElementById('start-btn')!.addEventListener('click', () => {
      this.deleteSave();
      this.titleOverlay.remove();
      this.startGame();
    });

    document.getElementById('weapon-shop-btn')!.addEventListener('click', () => {
      this.showTitleWeaponShop();
    });

    if (saveWave > 0) {
      document.getElementById('continue-btn')!.addEventListener('click', () => {
        this.titleOverlay.remove();
        this.continueGame();
      });
    }
  }

  private showTitleWeaponShop(selectedId?: string): void {
    // 무기 상점 오버레이 생성
    const shopOverlay = document.createElement('div');
    shopOverlay.style.cssText = `
      position: fixed; inset: 0; z-index: 35;
      background: rgba(0,0,0,0.92);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Segoe UI', Arial, sans-serif; color: #fff;
    `;

    // 왼쪽: 무기 이름 목록, 오른쪽: 선택된 무기 상세
    shopOverlay.innerHTML = `
      <div style="display: flex; width: 600px; height: 400px; background: rgba(30,30,40,0.95);
        border-radius: 12px; overflow: hidden; border: 1px solid #444;">
        <!-- 왼쪽 패널: 무기 목록 -->
        <div id="ws-list" style="width: 200px; border-right: 1px solid #444;
          display: flex; flex-direction: column; padding: 16px 0;">
          <div style="padding: 8px 16px; font-size: 14px; color: #888; border-bottom: 1px solid #333;
            margin-bottom: 8px;">보유 코인: <span style="color: #ffcc00; font-weight: 700;">${this.player.coins}</span></div>
          ${this.weaponConfigs.map((w) => {
            const owned = this.ownedWeapons.has(w.id);
            return `<div class="ws-item" data-id="${w.id}" style="
              padding: 12px 16px; cursor: pointer; font-size: 16px;
              border-left: 3px solid transparent;
              color: ${owned ? '#fff' : '#888'};
              transition: background 0.15s;
            " onmouseover="this.style.background='rgba(255,255,255,0.08)'"
               onmouseout="this.style.background='transparent'"
            >${w.name} ${owned ? '✓' : ''}</div>`;
          }).join('')}
        </div>
        <!-- 오른쪽 패널: 상세 -->
        <div id="ws-detail" style="flex: 1; padding: 24px; display: flex;
          flex-direction: column; align-items: center; justify-content: center;">
          <p style="color: #666; font-size: 14px;">← 무기를 선택하세요</p>
        </div>
      </div>
      <button id="ws-close" style="
        position: absolute; top: 24px; right: 32px;
        background: none; border: none; color: #aaa; font-size: 28px;
        cursor: pointer;
      ">✕</button>
    `;
    document.getElementById('ui-layer')!.appendChild(shopOverlay);

    // 닫기 버튼
    document.getElementById('ws-close')!.addEventListener('click', () => {
      shopOverlay.remove();
    });

    // 무기 아이템 클릭 이벤트
    const items = shopOverlay.querySelectorAll('.ws-item');
    const selectItem = (targetItem: Element) => {
      const id = (targetItem as HTMLElement).dataset.id!;
      this.renderWeaponDetail(shopOverlay, id);

      // 선택 하이라이트
      items.forEach((el) => {
        (el as HTMLElement).style.borderLeftColor = 'transparent';
        (el as HTMLElement).style.background = 'transparent';
      });
      (targetItem as HTMLElement).style.borderLeftColor = '#ff9800';
      (targetItem as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
    };

    items.forEach((item) => {
      item.addEventListener('click', () => selectItem(item));
    });

    // 이전 선택 무기 자동 복원
    if (selectedId) {
      const target = shopOverlay.querySelector(`.ws-item[data-id="${selectedId}"]`);
      if (target) selectItem(target);
    }
  }

  private renderWeaponDetail(shopOverlay: HTMLDivElement, weaponId: string): void {
    const cfg = this.weaponConfigs.find((w) => w.id === weaponId)!;
    const owned = this.ownedWeapons.has(weaponId);
    const currentLevel = this.ownedWeapons.get(weaponId) ?? 0;

    // 현재 스탯 (레벨 적용)
    let damage = cfg.damage;
    let range = cfg.range;
    if (currentLevel > 1) {
      const upgrade = cfg.upgrades.find((u) => u.level === currentLevel);
      if (upgrade) {
        damage = upgrade.damage;
        range = upgrade.range;
      }
    }

    const detail = shopOverlay.querySelector('#ws-detail')!;

    let actionHtml = '';
    if (!owned) {
      // 구매 버튼
      const canBuy = this.player.coins >= cfg.cost;
      actionHtml = `
        <div style="margin-top: 20px; text-align: center;">
          <div style="font-size: 20px; color: #ffcc00; margin-bottom: 12px;">${cfg.cost} 코인</div>
          <button id="ws-buy" style="
            padding: 10px 36px; background: ${canBuy ? '#4caf50' : '#555'}; color: #fff;
            border: none; border-radius: 6px; cursor: ${canBuy ? 'pointer' : 'not-allowed'};
            font-size: 16px; font-weight: 700;
          " ${canBuy ? '' : 'disabled'}>구매</button>
        </div>
      `;
    } else {
      // 소유 + 업그레이드 가능 여부
      const nextUpgrade = cfg.upgrades.find((u) => u.level === currentLevel + 1);
      if (nextUpgrade) {
        const canUpgrade = this.player.coins >= nextUpgrade.cost;
        actionHtml = `
          <div style="margin-top: 20px; text-align: center;">
            <div style="font-size: 13px; color: #aaa; margin-bottom: 4px;">업그레이드 Lv${nextUpgrade.level}</div>
            <div style="font-size: 13px; color: #ccc; margin-bottom: 8px;">
              공격력 ${damage} → ${nextUpgrade.damage} &nbsp;|&nbsp; 사거리 ${range.toFixed(1)} → ${nextUpgrade.range.toFixed(1)}
            </div>
            <div style="font-size: 18px; color: #ffcc00; margin-bottom: 12px;">${nextUpgrade.cost} 코인</div>
            <button id="ws-upgrade" style="
              padding: 10px 36px; background: ${canUpgrade ? '#2196f3' : '#555'}; color: #fff;
              border: none; border-radius: 6px; cursor: ${canUpgrade ? 'pointer' : 'not-allowed'};
              font-size: 16px; font-weight: 700;
            " ${canUpgrade ? '' : 'disabled'}>업그레이드</button>
          </div>
        `;
      } else {
        actionHtml = `
          <div style="margin-top: 20px; color: #4caf50; font-size: 14px;">최대 레벨 달성!</div>
        `;
      }
    }

    detail.innerHTML = `
      <h2 style="font-size: 28px; margin-bottom: 8px;">${cfg.name}</h2>
      <div style="font-size: 13px; color: #aaa; margin-bottom: 16px;">
        ${owned ? `Lv${currentLevel} 보유 중` : '미보유'}
      </div>
      <div style="font-size: 15px; line-height: 2; text-align: center;">
        공격력: <span style="color: #ff6b6b;">${damage}</span><br>
        사거리: <span style="color: #69b3ff;">${range.toFixed(1)}</span><br>
        공격 속도: <span style="color: #ffd93d;">${cfg.swingSpeed.toFixed(2)}s</span><br>
        넉백: <span style="color: #a29bfe;">${cfg.knockback.toFixed(1)}</span><br>
        범위 각도: <span style="color: #81ecec;">${cfg.arc}°</span>
      </div>
      ${actionHtml}
    `;

    // 구매 이벤트
    const buyBtn = detail.querySelector('#ws-buy');
    if (buyBtn) {
      buyBtn.addEventListener('click', () => {
        if (this.player.coins >= cfg.cost) {
          this.player.coins -= cfg.cost;
          this.ownedWeapons.set(weaponId, 1);
          this.equipWeapon(cfg, 1);
          this.savePersistent();
          shopOverlay.remove();
          this.showTitleWeaponShop(weaponId);
          this.updateTitleCoins();
        }
      });
    }

    // 업그레이드 이벤트
    const upgradeBtn = detail.querySelector('#ws-upgrade');
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', () => {
        const nextUpgrade = cfg.upgrades.find((u) => u.level === currentLevel + 1);
        if (nextUpgrade && this.player.coins >= nextUpgrade.cost) {
          this.player.coins -= nextUpgrade.cost;
          this.ownedWeapons.set(weaponId, nextUpgrade.level);
          if (this.weapon.id === weaponId) {
            this.weapon.applyConfig(cfg, nextUpgrade.level);
          }
          this.savePersistent();
          shopOverlay.remove();
          this.showTitleWeaponShop(weaponId);
          this.updateTitleCoins();
        }
      });
    }
  }

  private updateTitleCoins(): void {
    const btn = document.getElementById('weapon-shop-btn');
    if (btn) {
      btn.textContent = `무기 (${this.player.coins} 코인)`;
    }
  }

  private startGame(): void {
    this.phase = GamePhase.COMBAT;
    this.hud.show();
    this.crosshair.style.display = 'block';
    // 포인터 락 요청
    this.input.requestPointerLock();
    this.waveSystem.startWave(1);
    this.waveAnnounce.show(1);
  }

  private startNextWave(): void {
    this.shopUI.hide();
    this.crosshair.style.display = 'block';
    const nextWave = this.waveSystem.currentWave + 1;
    this.waveSystem.startWave(nextWave);
    this.waveAnnounce.show(nextWave);
    this.phase = GamePhase.COMBAT;
    this.input.requestPointerLock();
  }

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
      this.pauseOverlay.style.display = 'flex';
      this.crosshair.style.display = 'none';
      document.exitPointerLock();
    } else if (this.phase === GamePhase.PAUSED) {
      this.phase = GamePhase.COMBAT;
      this.pauseOverlay.style.display = 'none';
      this.crosshair.style.display = 'block';
      this.input.requestPointerLock();
    }
  }

  private update(dt: number): void {
    // ESC → 일시정지 해제만 담당 (진입은 포인터 락 해제 콜백이 처리)
    if (this.input.justPressed('escape') && this.phase === GamePhase.PAUSED) {
      this.togglePause();
    }

    // 일시정지 상태면 렌더만 하고 로직은 멈춤
    if (this.phase === GamePhase.PAUSED) {
      this.fpsCamera.update(this.player.position);
      return;
    }

    // 마우스 델타로 카메라 회전
    if (this.input.pointerLocked) {
      this.fpsCamera.applyMouseDelta(this.input.mouseDX, this.input.mouseDY);
    }

    // H키: 히트박스 시각화 토글
    if (this.input.justPressed('h')) {
      this.debugHitboxes = !this.debugHitboxes;
      this.debugGroup.visible = this.debugHitboxes;
    }

    this.waveAnnounce.update(dt);

    switch (this.phase) {
      case GamePhase.COMBAT:
        this.updateCombatPhase(dt);
        break;
      case GamePhase.SHOP:
        break;
    }

    // 카메라를 플레이어 위치에 동기화
    this.fpsCamera.update(this.player.position);
    this.cameraShake.update(dt);
    this.fpsCamera.camera.position.add(this.cameraShake.offset);

    this.particles.update(dt);
  }

  private updateCombatPhase(dt: number): void {
    // 카메라 방향 기준 이동
    const forward = this.fpsCamera.getForward();
    const right = this.fpsCamera.getRight();
    const moveDir = new THREE.Vector3();

    if (this.input.isDown('w') || this.input.isDown('arrowup')) moveDir.add(forward);
    if (this.input.isDown('s') || this.input.isDown('arrowdown')) moveDir.sub(forward);
    if (this.input.isDown('d') || this.input.isDown('arrowright')) moveDir.add(right);
    if (this.input.isDown('a') || this.input.isDown('arrowleft')) moveDir.sub(right);

    // 점프
    if (this.input.justPressed(' ')) {
      this.player.jump();
    }

    // 플레이어 바라보는 방향 = 카메라 yaw
    const facingAngle = this.fpsCamera.yaw;
    this.player.update(moveDir, facingAngle, dt);

    // Combat
    const activeZombies = this.zombiePool.getActive();
    updateCombat(
      this.player,
      this.weapon,
      activeZombies,
      this.input,
      this.hitStop,
      this.cameraShake,
      this.particles,
      dt,
    );

    // Zombie AI
    for (const z of activeZombies) {
      updateZombieAI(z, this.player, this.fences, dt);
    }

    // 죽은 좀비에서 코인 스폰
    for (const z of this.zombiePool.all) {
      if (z.active && z.state === 'DYING' && z.stateTimer > 0.38) {
        spawnCoin(this.coinPool, z.position.x, z.position.z, z.coinValue);
        this.totalKills++;
        this.totalCoinsEarned += z.coinValue;
      }
    }

    // Wave spawning
    this.waveSystem.update(dt, this.zombiePool);

    // Coins
    updateCoins(this.coinPool, this.player, this.particles, dt);

    // Repair
    this.repairSystem.update(this.player, this.fences, this.input, dt);

    // HUD 업데이트
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
    );

    // 웨이브 완료 체크
    const activeNonDying = this.zombiePool.getActive().filter((z) => z.state !== 'DYING').length;
    if (this.waveSystem.isWaveComplete(activeNonDying)) {
      const bonus = 20 + this.waveSystem.currentWave * 10;
      this.player.coins += bonus;
      this.totalCoinsEarned += bonus;

      // 웨이브 클리어 시 HP 전체 회복
      this.player.hp = this.player.maxHp;

      if (this.waveSystem.isLastWave) {
        this.phase = GamePhase.GAMEOVER;
        this.deleteSave();
        this.savePersistent();
        this.gameOverUI.show(true, this.waveSystem.currentWave, this.totalKills, this.totalCoinsEarned);
        this.hud.hide();
        this.crosshair.style.display = 'none';
      } else {
        this.phase = GamePhase.SHOP;
        this.crosshair.style.display = 'none';
        // 자동 저장
        this.saveGame();
        this.savePersistent();
        // 포인터 락 해제 (상점 UI 사용)
        document.exitPointerLock();
        this.shopUI.show(
          this.player.coins,
          this.weaponConfigs,
          this.ownedWeapons,
          this.weapon.id,
          this.fences,
        );
      }
    }

    // 히트박스 디버그 시각화 업데이트
    if (this.debugHitboxes) {
      this.updateDebugVisuals();
    }

    // 플레이어 사망 체크
    if (this.player.hp <= 0) {
      this.phase = GamePhase.GAMEOVER;
      this.deleteSave();
      this.savePersistent();
      this.crosshair.style.display = 'none';
      document.exitPointerLock();
      this.gameOverUI.show(false, this.waveSystem.currentWave, this.totalKills, this.totalCoinsEarned);
      this.hud.hide();
    }
  }

  private render(): void {
    this.sceneManager.renderer.render(this.sceneManager.scene, this.fpsCamera.camera);
  }

  // ── Shop Actions ──

  private buyWeapon(id: string): void {
    const cfg = this.weaponConfigs.find((w) => w.id === id);
    if (!cfg || this.player.coins < cfg.cost) return;
    if (this.ownedWeapons.has(id)) return;

    this.player.coins -= cfg.cost;
    this.ownedWeapons.set(id, 1);
    this.equipWeapon(cfg, 1);
    this.refreshShop();
  }

  private upgradeWeapon(id: string): void {
    const cfg = this.weaponConfigs.find((w) => w.id === id);
    if (!cfg) return;
    const currentLevel = this.ownedWeapons.get(id) ?? 0;
    const nextUpgrade = cfg.upgrades.find((u) => u.level === currentLevel + 1);
    if (!nextUpgrade || this.player.coins < nextUpgrade.cost) return;

    this.player.coins -= nextUpgrade.cost;
    this.ownedWeapons.set(id, nextUpgrade.level);

    if (this.weapon.id === id) {
      this.weapon.applyConfig(cfg, nextUpgrade.level);
    }
    this.refreshShop();
  }

  private equipWeapon(cfg: WeaponConfig, level: number): void {
    // 이전 무기 뷰모델 제거
    this.fpsCamera.camera.remove(this.weapon.viewModel);
    this.weapon = new Weapon(cfg);
    this.weapon.applyConfig(cfg, level);
    // 새 무기 뷰모델을 카메라에 부착
    this.fpsCamera.camera.add(this.weapon.viewModel);
  }

  private repairAllFences(): void {
    const totalDamage = this.fences.reduce((sum, f) => sum + (f.maxHp - f.hp), 0);
    const cost = Math.ceil(totalDamage * 0.5);
    if (this.player.coins < cost) return;

    this.player.coins -= cost;
    for (const f of this.fences) {
      f.repair(f.maxHp);
    }
    this.refreshShop();
  }

  private refreshShop(): void {
    this.shopUI.show(
      this.player.coins,
      this.weaponConfigs,
      this.ownedWeapons,
      this.weapon.id,
      this.fences,
    );
  }

  // ── 세이브/로드 ──

  private saveGame(): void {
    const data = {
      coins: this.player.coins,
      ownedWeapons: Array.from(this.ownedWeapons.entries()),
      equippedWeaponId: this.weapon.id,
      completedWave: this.waveSystem.currentWave,
      totalKills: this.totalKills,
      totalCoinsEarned: this.totalCoinsEarned,
      fenceHPs: this.fences.map((f) => f.hp),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }

  private loadSave(): boolean {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    try {
      const data = JSON.parse(raw);

      // 코인, 킬 수
      this.player.coins = data.coins;
      this.totalKills = data.totalKills;
      this.totalCoinsEarned = data.totalCoinsEarned;

      // 소유 무기 복원
      this.ownedWeapons.clear();
      for (const [id, level] of data.ownedWeapons) {
        this.ownedWeapons.set(id, level);
      }

      // 장착 무기 복원
      const weaponCfg = this.weaponConfigs.find((w) => w.id === data.equippedWeaponId);
      if (weaponCfg) {
        const level = this.ownedWeapons.get(data.equippedWeaponId) ?? 1;
        this.equipWeapon(weaponCfg, level);
      }

      // 웨이브 번호
      this.waveSystem.currentWave = data.completedWave;

      // 울타리 HP 복원
      if (data.fenceHPs) {
        for (let i = 0; i < this.fences.length && i < data.fenceHPs.length; i++) {
          this.fences[i].restoreHp(data.fenceHPs[i]);
        }
      }

      // HP 전체 회복 (웨이브 클리어 상태)
      this.player.hp = this.player.maxHp;

      return true;
    } catch {
      return false;
    }
  }

  private deleteSave(): void {
    localStorage.removeItem(SAVE_KEY);
  }

  // ── 영구 저장 (코인 + 소유 무기, 게임 간 유지) ──

  private savePersistent(): void {
    const data = {
      coins: this.player.coins,
      ownedWeapons: Array.from(this.ownedWeapons.entries()),
    };
    localStorage.setItem(PERSISTENT_KEY, JSON.stringify(data));
  }

  private loadPersistent(): void {
    const raw = localStorage.getItem(PERSISTENT_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (typeof data.coins === 'number') {
        this.player.coins = data.coins;
      }
      if (Array.isArray(data.ownedWeapons)) {
        for (const [id, level] of data.ownedWeapons) {
          this.ownedWeapons.set(id, level);
        }
        // 가장 높은 등급의 무기를 장착
        let bestCfg: WeaponConfig | null = null;
        let bestIdx = -1;
        for (const [id] of this.ownedWeapons) {
          const idx = this.weaponConfigs.findIndex((w) => w.id === id);
          if (idx > bestIdx) {
            bestIdx = idx;
            bestCfg = this.weaponConfigs[idx];
          }
        }
        if (bestCfg) {
          const level = this.ownedWeapons.get(bestCfg.id) ?? 1;
          this.equipWeapon(bestCfg, level);
        }
      }
    } catch { /* ignore corrupt data */ }
  }

  private continueGame(): void {
    if (!this.loadSave()) {
      this.startGame();
      return;
    }

    this.phase = GamePhase.SHOP;
    this.hud.show();
    this.shopUI.show(
      this.player.coins,
      this.weaponConfigs,
      this.ownedWeapons,
      this.weapon.id,
      this.fences,
    );
  }

  // ── 히트박스 디버그 시각화 ──

  private updateDebugVisuals(): void {
    // 무기 사거리/각도가 바뀌면 섹터 재생성
    if (this.weapon.range !== this.debugSectorRange || this.weapon.arc !== this.debugSectorArc) {
      this.rebuildDebugSector();
    }

    // 플레이어 공격 섹터 위치/회전
    this.debugSector.position.set(this.player.position.x, 0.05, this.player.position.z);
    this.debugSector.rotation.y = this.player.facingAngle;
    this.debugSectorEdge.position.set(this.player.position.x, 0.05, this.player.position.z);
    this.debugSectorEdge.rotation.y = this.player.facingAngle;

    // 좀비 공격 범위 원 (PLAYER_ATTACK_RANGE = 1.5)
    const activeZombies = this.zombiePool.getActive().filter((z) => z.state !== 'DYING');

    // 필요한 만큼 원 생성
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
  }

  private rebuildDebugSector(): void {
    // 기존 제거
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

    // 반투명 부채꼴 (초록)
    const sectorGeo = this.buildSectorGeometry(range, arc);
    const sectorMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00, transparent: true, opacity: 0.18,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.debugSector = new THREE.Mesh(sectorGeo, sectorMat);
    this.debugSector.renderOrder = 999;
    this.debugGroup.add(this.debugSector);

    // 부채꼴 외곽선 (밝은 초록)
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
