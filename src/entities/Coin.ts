import * as THREE from 'three';
import type { Poolable } from '../types';

export class Coin implements Poolable {
  mesh: THREE.Group;
  active = false;
  value = 10;
  absorbing = false;
  absorbSpeed = 0;
  private spinSpeed = 3;
  private bobPhase = 0;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Group();

    const coinMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.08, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffd700,
        emissive: 0xaa8800,
        emissiveIntensity: 0.4,
        metalness: 0.8,
        roughness: 0.3,
      }),
    );
    coinMesh.castShadow = true;
    this.mesh.add(coinMesh);

    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  reset(): void {
    this.absorbing = false;
    this.absorbSpeed = 0;
    this.bobPhase = Math.random() * Math.PI * 2;
  }

  spawn(x: number, z: number, value: number): void {
    this.mesh.position.set(x, 0.5, z);
    this.value = value;
    this.absorbing = false;
    this.absorbSpeed = 0;
  }

  update(dt: number): void {
    // Spin
    this.mesh.rotation.y += this.spinSpeed * dt;

    // Bob (only when not absorbing)
    if (!this.absorbing) {
      this.bobPhase += dt * 2;
      this.mesh.position.y = 0.5 + Math.sin(this.bobPhase) * 0.15;
    }
  }
}
