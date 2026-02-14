import * as THREE from 'three';

export class CameraShake {
  offset = new THREE.Vector3();
  private intensity = 0;
  private duration = 0;
  private elapsed = 0;
  private active = false;

  shake(intensity: number, duration: number): void {
    this.intensity = intensity;
    this.duration = duration;
    this.elapsed = 0;
    this.active = true;
  }

  update(dt: number): void {
    if (!this.active) {
      this.offset.set(0, 0, 0);
      return;
    }

    this.elapsed += dt;
    const remaining = 1 - this.elapsed / this.duration;

    if (remaining <= 0) {
      this.active = false;
      this.offset.set(0, 0, 0);
      return;
    }

    const mag = this.intensity * remaining;
    this.offset.set(
      (Math.random() - 0.5) * mag,
      (Math.random() - 0.5) * mag * 0.5,
      (Math.random() - 0.5) * mag,
    );
  }
}
