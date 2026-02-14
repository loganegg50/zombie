export class WaveAnnouncement {
  private el: HTMLDivElement;
  private timer = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position: fixed; top: 35%; left: 50%; transform: translate(-50%, -50%);
      font-size: 56px; font-weight: 900; color: #fff;
      text-shadow: 0 0 20px rgba(229,57,53,0.8), 0 0 60px rgba(229,57,53,0.3);
      opacity: 0; pointer-events: none; z-index: 15;
      transition: opacity 0.3s, transform 0.3s;
      font-family: 'Segoe UI', Arial, sans-serif;
    `;
    document.getElementById('ui-layer')!.appendChild(this.el);
  }

  show(wave: number): void {
    this.el.textContent = `WAVE ${wave}`;
    this.el.style.opacity = '1';
    this.el.style.transform = 'translate(-50%, -50%) scale(1)';
    this.timer = 2.0;
  }

  update(dt: number): void {
    if (this.timer <= 0) return;
    this.timer -= dt;

    if (this.timer < 0.5) {
      this.el.style.opacity = `${this.timer / 0.5}`;
    }

    if (this.timer <= 0) {
      this.el.style.opacity = '0';
    }
  }
}
