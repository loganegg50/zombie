export class GameOverUI {
  private overlay: HTMLDivElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 25;
      background: rgba(0,0,0,0.9);
      display: none; flex-direction: column; align-items: center;
      justify-content: center; font-family: 'Segoe UI', Arial, sans-serif;
      color: #fff;
    `;
    document.getElementById('ui-layer')!.appendChild(this.overlay);
  }

  show(victory: boolean, wave: number, kills: number, coins: number): void {
    this.overlay.innerHTML = `
      <h1 style="font-size: 48px; margin-bottom: 12px; color: ${victory ? '#4caf50' : '#e53935'};">
        ${victory ? 'VICTORY!' : 'DEFEATED'}
      </h1>
      <p style="font-size: 16px; color: #aaa; margin-bottom: 24px;">
        ${victory ? 'All waves survived!' : `Survived to Wave ${wave}`}
      </p>
      <div style="font-size: 18px; line-height: 2; margin-bottom: 32px; text-align: center;">
        Zombies Killed: ${kills}<br>
        Coins Earned: ${coins}
      </div>
      <button id="home-btn" style="
        padding: 14px 48px; background: #e53935; color: #fff;
        border: none; border-radius: 8px; cursor: pointer;
        font-size: 18px; font-weight: 700;
      ">홈으로</button>
    `;
    this.overlay.style.display = 'flex';

    document.getElementById('home-btn')!.addEventListener('click', () => {
      window.location.reload();
    });
  }

  hide(): void {
    this.overlay.style.display = 'none';
  }
}
