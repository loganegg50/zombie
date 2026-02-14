import type { Poolable } from '../types';

export class ObjectPool<T extends Poolable> {
  private pool: T[] = [];
  private factory: () => T;

  constructor(factory: () => T, initialSize = 0) {
    this.factory = factory;
    for (let i = 0; i < initialSize; i++) {
      const obj = this.factory();
      obj.active = false;
      obj.mesh.visible = false;
      this.pool.push(obj);
    }
  }

  acquire(): T {
    for (const obj of this.pool) {
      if (!obj.active) {
        obj.active = true;
        obj.mesh.visible = true;
        obj.reset();
        return obj;
      }
    }
    const obj = this.factory();
    obj.active = true;
    obj.mesh.visible = true;
    this.pool.push(obj);
    return obj;
  }

  release(obj: T): void {
    obj.active = false;
    obj.mesh.visible = false;
  }

  getActive(): T[] {
    return this.pool.filter((o) => o.active);
  }

  get all(): T[] {
    return this.pool;
  }
}
