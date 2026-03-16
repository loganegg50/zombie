export class Input {
  private keysDown = new Set<string>();
  private keysJustDown = new Set<string>();
  mouseDown = false;
  mouseJustDown = false;
  mouseRightDown = false;

  /** 포인터 락 상태에서의 마우스 이동 델타 (프레임 당) */
  mouseDX = 0;
  mouseDY = 0;

  /** 포인터 락 활성 여부 */
  pointerLocked = false;

  /** 포인터 락이 해제될 때 호출되는 콜백 */
  onPointerLockExit: (() => void) | null = null;

  /** 모바일 여부 */
  readonly isMobile: boolean;

  private canvas: HTMLCanvasElement;

  // 모바일 조이스틱
  private leftStick: HTMLDivElement | null = null;
  private rightStick: HTMLDivElement | null = null;
  private leftKnob: HTMLDivElement | null = null;
  private rightKnob: HTMLDivElement | null = null;
  private leftTouchId: number | null = null;
  private rightTouchId: number | null = null;
  private leftOrigin = { x: 0, y: 0 };
  private rightOrigin = { x: 0, y: 0 };
  private mobileButtons: HTMLDivElement | null = null;
  private lookTouches = new Map<number, { x: number; y: number }>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.isMobile = 'ontouchstart' in window && navigator.maxTouchPoints > 0;

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keysDown.has(k)) this.keysJustDown.add(k);
      this.keysDown.add(k);
    });
    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.key.toLowerCase());
    });

    // 마우스 이동 — 포인터 락 상태에서 델타 수집
    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        // 포인터 락이 안 걸려 있으면 락 요청
        if (!this.pointerLocked) {
          this.requestPointerLock();
          return;
        }
        this.mouseDown = true;
        this.mouseJustDown = true;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2 && this.pointerLocked) {
        this.mouseRightDown = true;
      }
    });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRightDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // 포인터 락 이벤트
    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === canvas;
      // 포인터 락이 해제되면 콜백 호출 (브라우저 ESC 등)
      if (wasLocked && !this.pointerLocked && this.onPointerLockExit) {
        this.onPointerLockExit();
      }
    });

    if (this.isMobile) {
      this.setupMobileControls();
    }
  }

  requestPointerLock(): void {
    if (this.isMobile) {
      this.pointerLocked = true;
      return;
    }
    this.canvas.requestPointerLock();
  }

  isDown(key: string): boolean {
    return this.keysDown.has(key.toLowerCase());
  }

  justPressed(key: string): boolean {
    return this.keysJustDown.has(key.toLowerCase());
  }

  /** 프레임 끝에서 호출 */
  endFrame(): void {
    this.keysJustDown.clear();
    this.mouseJustDown = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  /** 모바일 UI 표시/숨김 */
  showMobileControls(visible: boolean): void {
    if (!this.isMobile) return;
    const display = visible ? 'block' : 'none';
    if (this.leftStick) this.leftStick.style.display = display;
    if (this.rightStick) this.rightStick.style.display = display;
    if (this.mobileButtons) this.mobileButtons.style.display = visible ? 'flex' : 'none';
  }

  // ── 모바일 조이스틱 설정 ──

  private setupMobileControls(): void {
    // 포인터 락 대신 항시 활성
    this.pointerLocked = true;

    const STICK_SIZE = 120;
    const KNOB_SIZE = 50;

    // 왼쪽 조이스틱 (이동)
    this.leftStick = this.createStick(STICK_SIZE);
    this.leftStick.style.left = '24px';
    this.leftStick.style.bottom = '24px';
    this.leftKnob = this.createKnob(KNOB_SIZE);
    this.leftStick.appendChild(this.leftKnob);
    document.body.appendChild(this.leftStick);

    // 오른쪽 조이스틱 (시점)
    this.rightStick = this.createStick(STICK_SIZE);
    this.rightStick.style.right = '24px';
    this.rightStick.style.bottom = '24px';
    this.rightKnob = this.createKnob(KNOB_SIZE);
    this.rightStick.appendChild(this.rightKnob);
    document.body.appendChild(this.rightStick);

    // 액션 버튼 (공격, 점프, 수리)
    this.mobileButtons = document.createElement('div');
    this.mobileButtons.style.cssText = `
      position:fixed; right:160px; bottom:24px; z-index:50;
      display:flex; flex-direction:column; gap:10px; pointer-events:auto;
    `;
    const btnDefs = [
      { label: '⚔', key: '__attack', color: '#e53935', size: 56 },
      { label: '⬆', key: ' ', color: '#4caf50', size: 46 },
      { label: 'R', key: 'r', color: '#ff9800', size: 46 },
    ];
    for (const def of btnDefs) {
      const btn = document.createElement('div');
      btn.style.cssText = `
        width:${def.size}px; height:${def.size}px; border-radius:50%;
        background:${def.color}; opacity:0.7; display:flex; align-items:center;
        justify-content:center; font-size:${def.size * 0.4}px; color:#fff;
        font-weight:700; user-select:none; touch-action:none;
      `;
      btn.textContent = def.label;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (def.key === '__attack') {
          this.mouseDown = true;
          this.mouseJustDown = true;
        } else {
          if (!this.keysDown.has(def.key)) this.keysJustDown.add(def.key);
          this.keysDown.add(def.key);
        }
      }, { passive: false });
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (def.key === '__attack') {
          this.mouseDown = false;
        } else {
          this.keysDown.delete(def.key);
        }
      }, { passive: false });
      this.mobileButtons.appendChild(btn);
    }
    document.body.appendChild(this.mobileButtons);

    // 터치 이벤트 — 조이스틱 + 화면 드래그 시점 회전
    const STICK_TOUCH_RADIUS = STICK_SIZE * 1.2;
    const leftCenter = (): { x: number; y: number } => {
      const r = this.leftStick!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const rightCenter = (): { x: number; y: number } => {
      const r = this.rightStick!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
      Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    const isTouchOnButton = (t: Touch): boolean => {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      return !!el && !!this.mobileButtons?.contains(el);
    };

    document.addEventListener('touchstart', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const pos = { x: t.clientX, y: t.clientY };

        // 버튼 위의 터치는 무시 (버튼 자체 이벤트로 처리)
        if (isTouchOnButton(t)) continue;

        // 왼쪽 조이스틱 영역
        if (this.leftTouchId === null && dist2(pos, leftCenter()) < STICK_TOUCH_RADIUS) {
          this.leftTouchId = t.identifier;
          this.leftOrigin = { x: t.clientX, y: t.clientY };
          this.centerKnob(this.leftKnob!);
          continue;
        }

        // 오른쪽 조이스틱 영역
        if (this.rightTouchId === null && dist2(pos, rightCenter()) < STICK_TOUCH_RADIUS) {
          this.rightTouchId = t.identifier;
          this.rightOrigin = { x: t.clientX, y: t.clientY };
          this.centerKnob(this.rightKnob!);
          continue;
        }

        // 나머지 터치 → 화면 드래그 (시점 회전)
        this.lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const maxDist = STICK_SIZE / 2 - KNOB_SIZE / 2;

        if (t.identifier === this.leftTouchId && this.leftKnob) {
          const dx = t.clientX - this.leftOrigin.x;
          const dy = t.clientY - this.leftOrigin.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const clamp = Math.min(d, maxDist);
          const angle = Math.atan2(dy, dx);
          const nx = Math.cos(angle) * clamp;
          const ny = Math.sin(angle) * clamp;
          this.leftKnob.style.transform = `translate(${nx}px, ${ny}px)`;

          const threshold = maxDist * 0.3;
          this.setKey('w', ny < -threshold);
          this.setKey('s', ny > threshold);
          this.setKey('a', nx < -threshold);
          this.setKey('d', nx > threshold);
        } else if (t.identifier === this.rightTouchId && this.rightKnob) {
          const dx = t.clientX - this.rightOrigin.x;
          const dy = t.clientY - this.rightOrigin.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const clamp = Math.min(d, maxDist);
          const angle = Math.atan2(dy, dx);
          const nx = Math.cos(angle) * clamp;
          const ny = Math.sin(angle) * clamp;
          this.rightKnob.style.transform = `translate(${nx}px, ${ny}px)`;

          const sensitivity = 3.5;
          this.mouseDX += dx * sensitivity * 0.016;
          this.mouseDY += dy * sensitivity * 0.016;
          this.rightOrigin = { x: t.clientX, y: t.clientY };
        } else if (this.lookTouches.has(t.identifier)) {
          // 화면 드래그 시점 회전
          const prev = this.lookTouches.get(t.identifier)!;
          const sensitivity = 2.5;
          this.mouseDX += (t.clientX - prev.x) * sensitivity;
          this.mouseDY += (t.clientY - prev.y) * sensitivity;
          this.lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.leftTouchId) {
          this.leftTouchId = null;
          this.centerKnob(this.leftKnob!);
          this.setKey('w', false);
          this.setKey('s', false);
          this.setKey('a', false);
          this.setKey('d', false);
        } else if (t.identifier === this.rightTouchId) {
          this.rightTouchId = null;
          this.centerKnob(this.rightKnob!);
        } else {
          this.lookTouches.delete(t.identifier);
        }
      }
    }, { passive: true });

    // 초기에는 숨김 (전투 시작 시 표시)
    this.showMobileControls(false);
  }

  private setKey(key: string, down: boolean): void {
    if (down) {
      if (!this.keysDown.has(key)) this.keysJustDown.add(key);
      this.keysDown.add(key);
    } else {
      this.keysDown.delete(key);
    }
  }

  private createStick(size: number): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed; z-index:50; width:${size}px; height:${size}px;
      border-radius:50%; background:rgba(255,255,255,0.1);
      border:2px solid rgba(255,255,255,0.25); pointer-events:none;
      display:flex; align-items:center; justify-content:center;
    `;
    return el;
  }

  private createKnob(size: number): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `
      width:${size}px; height:${size}px; border-radius:50%;
      background:rgba(255,255,255,0.4); pointer-events:none;
      transition:transform 0.05s;
    `;
    return el;
  }

  private centerKnob(knob: HTMLDivElement): void {
    knob.style.transform = 'translate(0px, 0px)';
  }
}
