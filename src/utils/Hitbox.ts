import * as THREE from 'three';

/** Check if a point is inside a sector (pie-slice) in XZ plane */
export function pointInSector(
  point: THREE.Vector3,
  origin: THREE.Vector3,
  facingAngle: number,
  radius: number,
  arcDeg: number,
): boolean {
  const dx = point.x - origin.x;
  const dz = point.z - origin.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > radius) return false;

  // -dx, -dz: angle 0 = -Z 방향 (카메라 yaw=0과 일치)
  const angleToPoint = Math.atan2(-dx, -dz);
  let diff = angleToPoint - facingAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  const halfArc = ((arcDeg * Math.PI) / 180) / 2;
  return Math.abs(diff) <= halfArc;
}

/** Simple circle-circle collision in XZ */
export function circlesOverlap(
  p1: THREE.Vector3, r1: number,
  p2: THREE.Vector3, r2: number,
): boolean {
  const dx = p1.x - p2.x;
  const dz = p1.z - p2.z;
  const combined = r1 + r2;
  return (dx * dx + dz * dz) <= combined * combined;
}

/** A finite 3D swing cone, including camera pitch and target body radius. */
export function sphereInSwing(
  center: THREE.Vector3, bodyRadius: number, origin: THREE.Vector3,
  yaw: number, pitch: number, range: number, arcDeg: number,
): boolean {
  const offset = center.clone().sub(origin);
  const distance = offset.length();
  if (distance - bodyRadius > range) return false;
  if (distance <= bodyRadius) return true;
  const forward = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const angle = Math.acos(THREE.MathUtils.clamp(offset.dot(forward) / distance, -1, 1));
  return angle <= arcDeg * Math.PI / 360 + Math.asin(Math.min(1, bodyRadius / distance));
}
