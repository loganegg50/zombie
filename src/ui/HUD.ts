export class HUD {
  private container: HTMLDivElement;
  private hpFill!: HTMLDivElement;
  private coinText: HTMLDivElement;
  private waveText: HTMLDivElement;
  private zombieText: HTMLDivElement;
  private weaponText: HTMLDivElement;
  private castBar: HTMLDivElement;
  private castFill: HTMLDivElement;
  private repairHint: HTMLDivElement;

  constructor() {
    const ui = document.getElementById('ui-layer')!;

    this.container = document.createElement('div');
    this.container.innerHTML = `
      <div id="hud-top" style="
        display: flex; justify-content: space-between; align-items: flex-start;
        padding: 16px 24px; pointer-events: none;
      ">
        <div>
          <div style="font-size: 13px; margin-bottom: 4px; opacity: 0.7;">HP</div>
          <div id="hp-bar" style="
            width: 180px; height: 14px; background: #333; border-radius: 7px; overflow: hidden;
          ">
            <div id="hp-fill" style="
              width: 100%; height: 100%; background: linear-gradient(90deg, #e53935, #ff7043);
              border-radius: 7px; transition: width 0.2s;
            "></div>
          </div>
        </div>
        <div id="wave-text" style="font-size: 18px; font-weight: 700; text-align: center;">
          Wave 1 / 10
        </div>
        <div id="coin-text" style="font-size: 18px; font-weight: 700; color: #ffd700;">
          0
        </div>
      </div>

      <div id="zombie-text" style="
        position: fixed; top: 50px; left: 50%; transform: translateX(-50%);
        font-size: 13px; opacity: 0.6;
      "></div>

      <div id="weapon-text" style="
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        font-size: 14px; opacity: 0.7; text-align: center;
      "></div>

      <div id="cast-bar" style="
        position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%);
        width: 200px; height: 10px; background: #333; border-radius: 5px;
        overflow: hidden; display: none;
      ">
        <div id="cast-fill" style="
          width: 0%; height: 100%;
          background: linear-gradient(90deg, #4caf50, #8bc34a);
          border-radius: 5px; transition: width 0.05s;
        "></div>
      </div>

      <div id="repair-hint" style="
        position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
        font-size: 12px; opacity: 0; transition: opacity 0.2s;
        color: #8bc34a;
      ">Hold R to repair fence</div>
    `;
    ui.appendChild(this.container);

    this.hpFill = document.getElementById('hp-fill') as HTMLDivElement;
    this.coinText = document.getElementById('coin-text') as HTMLDivElement;
    this.waveText = document.getElementById('wave-text') as HTMLDivElement;
    this.zombieText = document.getElementById('zombie-text') as HTMLDivElement;
    this.weaponText = document.getElementById('weapon-text') as HTMLDivElement;
    this.castBar = document.getElementById('cast-bar') as HTMLDivElement;
    this.castFill = document.getElementById('cast-fill') as HTMLDivElement;
    this.repairHint = document.getElementById('repair-hint') as HTMLDivElement;
  }

  update(
    hp: number,
    maxHp: number,
    coins: number,
    wave: number,
    totalWaves: number,
    zombiesLeft: number,
    weaponName: string,
    castProgress: number,
    nearFence: boolean,
  ): void {
    const hpPct = Math.max(0, (hp / maxHp) * 100);
    this.hpFill.style.width = `${hpPct}%`;

    if (hpPct > 50) {
      this.hpFill.style.background = 'linear-gradient(90deg, #4caf50, #8bc34a)';
    } else if (hpPct > 25) {
      this.hpFill.style.background = 'linear-gradient(90deg, #ff9800, #ffb74d)';
    } else {
      this.hpFill.style.background = 'linear-gradient(90deg, #e53935, #ff7043)';
    }

    this.coinText.textContent = `${coins}`;
    this.waveText.textContent = `Wave ${wave} / ${totalWaves}`;
    this.zombieText.textContent = zombiesLeft > 0 ? `${zombiesLeft} remaining` : '';
    this.weaponText.textContent = weaponName;

    if (castProgress > 0) {
      this.castBar.style.display = 'block';
      this.castFill.style.width = `${castProgress * 100}%`;
    } else {
      this.castBar.style.display = 'none';
    }

    this.repairHint.style.opacity = nearFence && castProgress === 0 ? '1' : '0';
  }

  show(): void { this.container.style.display = 'block'; }
  hide(): void { this.container.style.display = 'none'; }
}
