import * as THREE from 'three';

export function distanceXZ(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function angleToward(from: THREE.Vector3, to: THREE.Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function randomPointOnCircle(center: THREE.Vector3, radius: number): THREE.Vector3 {
  const angle = Math.random() * Math.PI * 2;
  return new THREE.Vector3(
    center.x + Math.cos(angle) * radius,
    0,
    center.z + Math.sin(angle) * radius,
  );
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
