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

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

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
  }

  requestPointerLock(): void {
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
}
