/** Keyboard, mouse and pointer lock. Edge-triggered keys are cleared by `endFrame`. */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  left = false;
  right = false;
  leftPressed = false;
  dx = 0;
  dy = 0;
  wheel = 0;
  locked = false;
  onLockChange: (locked: boolean) => void = () => {};

  constructor(private el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => {
      this.down.clear();
      this.left = this.right = false;
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.left = true;
        this.leftPressed = true;
      }
      if (e.button === 2) this.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.left = false;
      if (e.button === 2) this.right = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) this.left = this.right = false;
      this.onLockChange(this.locked);
    });
  }

  held(code: string): boolean {
    return this.down.has(code);
  }
  was(code: string): boolean {
    return this.pressed.has(code);
  }
  requestLock() {
    try {
      const r = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => {});
    } catch {
      /* some browsers refuse without a gesture */
    }
  }
  endFrame() {
    this.pressed.clear();
    this.leftPressed = false;
    this.dx = this.dy = 0;
    this.wheel = 0;
  }
}
