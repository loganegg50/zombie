import type { WeaponConfig } from '../types';
import type { FenceSection } from '../entities/FenceSection';

export interface ShopCallbacks {
  onBuyWeapon(weaponId: string): void;
  onUpgradeWeapon(weaponId: string): void;
  onRepairAll(): void;
  onStartWave(): void;
}

export class ShopUI {
  private overlay: HTMLDivElement;
  private content: HTMLDivElement;
  private callbacks: ShopCallbacks;

  constructor(callbacks: ShopCallbacks) {
    this.callbacks = callbacks;

    this.overlay = document.createElement('div');
    this.overlay.id = 'shop-overlay';
    this.overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 20;
      background: rgba(0,0,0,0.85);
      display: none; flex-direction: column; align-items: center;
      justify-content: center; font-family: 'Segoe UI', Arial, sans-serif;
      color: #fff;
    `;

    this.content = document.createElement('div');
    this.content.style.cssText = `
      max-width: 700px; width: 90%; max-height: 80vh; overflow-y: auto;
      padding: 24px;
    `;

    this.overlay.appendChild(this.content);
    document.getElementById('ui-layer')!.appendChild(this.overlay);
  }

  show(
    coins: number,
    weapons: WeaponConfig[],
    ownedWeapons: Map<string, number>, // weaponId -> level
    equippedId: string,
    fences: FenceSection[],
  ): void {
    let html = `
      <h1 style="text-align: center; margin-bottom: 8px; font-size: 28px;">SHOP</h1>
      <p style="text-align: center; color: #ffd700; font-size: 20px; margin-bottom: 24px;">
        Coins: ${coins}
      </p>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 24px;">
    `;

    for (const w of weapons) {
      const owned = ownedWeapons.has(w.id);
      const level = ownedWeapons.get(w.id) ?? 0;
      const isEquipped = w.id === equippedId;
      const nextUpgrade = w.upgrades.find((u) => u.level === level + 1);

      let buttonHtml = '';
      if (!owned) {
        buttonHtml = `<button class="shop-btn" data-action="buy" data-id="${w.id}"
          style="margin-top: 8px; padding: 8px 16px; background: #4caf50; color: #fff;
          border: none; border-radius: 6px; cursor: pointer; font-size: 14px; width: 100%;"
          ${coins < w.cost ? 'disabled style="margin-top:8px;padding:8px 16px;background:#555;color:#999;border:none;border-radius:6px;cursor:default;font-size:14px;width:100%;"' : ''}>
          Buy - ${w.cost} coins
        </button>`;
      } else if (nextUpgrade) {
        buttonHtml = `<button class="shop-btn" data-action="upgrade" data-id="${w.id}"
          style="margin-top: 8px; padding: 8px 16px; background: #2196f3; color: #fff;
          border: none; border-radius: 6px; cursor: pointer; font-size: 14px; width: 100%;"
          ${coins < nextUpgrade.cost ? 'disabled style="margin-top:8px;padding:8px 16px;background:#555;color:#999;border:none;border-radius:6px;cursor:default;font-size:14px;width:100%;"' : ''}>
          Upgrade Lv${nextUpgrade.level} - ${nextUpgrade.cost} coins
        </button>`;
      } else {
        buttonHtml = `<div style="margin-top: 8px; padding: 8px; text-align: center; color: #888; font-size: 13px;">MAX LEVEL</div>`;
      }

      html += `
        <div style="
          background: ${isEquipped ? '#2a3a2a' : '#1e1e2e'}; border: 2px solid ${isEquipped ? '#4caf50' : '#333'};
          border-radius: 10px; padding: 16px; width: 200px; flex-shrink: 0;
        ">
          <h3 style="margin: 0 0 4px 0; font-size: 16px;">${w.name}</h3>
          ${isEquipped ? '<span style="font-size: 11px; color: #4caf50;">EQUIPPED</span>' : ''}
          ${owned ? `<span style="font-size: 11px; color: #aaa;"> Lv${level}</span>` : ''}
          <div style="font-size: 12px; color: #aaa; margin-top: 8px; line-height: 1.6;">
            Damage: ${owned && level > 1 ? (w.upgrades.find(u => u.level === level)?.damage ?? w.damage) : w.damage}<br>
            Range: ${owned && level > 1 ? (w.upgrades.find(u => u.level === level)?.range ?? w.range) : w.range}<br>
            Speed: ${w.swingSpeed}s<br>
            Arc: ${w.arc}°
          </div>
          ${buttonHtml}
        </div>
      `;
    }

    // Fence repair section
    const totalDamage = fences.reduce((sum, f) => sum + (f.maxHp - f.hp), 0);
    const repairCost = Math.ceil(totalDamage * 0.5);

    html += `</div>`;

    if (totalDamage > 0) {
      html += `
        <div style="text-align: center; margin-bottom: 24px;">
          <button class="shop-btn" data-action="repair"
            style="padding: 10px 24px; background: #ff9800; color: #fff;
            border: none; border-radius: 6px; cursor: pointer; font-size: 15px;"
            ${coins < repairCost ? 'disabled style="padding:10px 24px;background:#555;color:#999;border:none;border-radius:6px;cursor:default;font-size:15px;"' : ''}>
            Repair All Fences - ${repairCost} coins
          </button>
        </div>
      `;
    }

    html += `
      <div style="text-align: center;">
        <button class="shop-btn" data-action="start"
          style="padding: 14px 48px; background: #e53935; color: #fff;
          border: none; border-radius: 8px; cursor: pointer; font-size: 18px; font-weight: 700;">
          Start Next Wave
        </button>
      </div>
    `;

    this.content.innerHTML = html;
    this.overlay.style.display = 'flex';

    // Attach event listeners
    this.content.querySelectorAll('.shop-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const el = e.currentTarget as HTMLButtonElement;
        if (el.disabled) return;
        const action = el.dataset.action;
        const id = el.dataset.id ?? '';
        if (action === 'buy') this.callbacks.onBuyWeapon(id);
        else if (action === 'upgrade') this.callbacks.onUpgradeWeapon(id);
        else if (action === 'repair') this.callbacks.onRepairAll();
        else if (action === 'start') this.callbacks.onStartWave();
      });
    });
  }

  hide(): void {
    this.overlay.style.display = 'none';
  }
}
