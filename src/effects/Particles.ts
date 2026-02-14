import * as THREE from 'three';

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
}

const MAX_PARTICLES = 200;

export class ParticleSystem {
  private particles: Particle[] = [];
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private points: THREE.Points;
  private pendingColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        active: false,
      });
    }
  }

  burst(origin: THREE.Vector3, color: number, count: number): void {
    this.pendingColor.setHex(color);
    let spawned = 0;

    for (const p of this.particles) {
      if (spawned >= count) break;
      if (p.active) continue;

      p.active = true;
      p.position.copy(origin);
      p.velocity.set(
        (Math.random() - 0.5) * 6,
        Math.random() * 4 + 1,
        (Math.random() - 0.5) * 6,
      );
      p.maxLife = 0.3 + Math.random() * 0.3;
      p.life = p.maxLife;

      const idx = this.particles.indexOf(p);
      this.colors[idx * 3] = this.pendingColor.r;
      this.colors[idx * 3 + 1] = this.pendingColor.g;
      this.colors[idx * 3 + 2] = this.pendingColor.b;

      spawned++;
    }
  }

  update(dt: number): void {
    let needsUpdate = false;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) {
        this.sizes[i] = 0;
        continue;
      }

      needsUpdate = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.sizes[i] = 0;
        continue;
      }

      // Gravity
      p.velocity.y -= 12 * dt;
      p.position.add(p.velocity.clone().multiplyScalar(dt));

      const ratio = p.life / p.maxLife;
      this.positions[i * 3] = p.position.x;
      this.positions[i * 3 + 1] = p.position.y;
      this.positions[i * 3 + 2] = p.position.z;
      this.sizes[i] = 0.2 * ratio;
    }

    if (needsUpdate) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.size.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
    }
  }
}
