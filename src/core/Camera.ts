import * as THREE from 'three';
import { clamp } from '../utils/MathUtils';

export class FPSCamera {
  camera: THREE.PerspectiveCamera;

  /** 좌우 회전 (Y축) */
  yaw = 0;
  /** 상하 회전 (X축) */
  pitch = 0;

  private sensitivity = 0.002;
  private eyeHeight = 1.65;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.05,
      120,
    );
    this.camera.position.set(0, this.eyeHeight, 0);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  /** 마우스 이동 델타로 회전 적용 */
  applyMouseDelta(dx: number, dy: number): void {
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  }

  /** 플레이어 위치에 카메라 동기화 */
  update(playerPos: THREE.Vector3): void {
    this.camera.position.set(playerPos.x, playerPos.y + this.eyeHeight, playerPos.z);
    // Euler: order YXZ → yaw 먼저, pitch 다음
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  /** 카메라가 바라보는 수평 방향 (Y=0) */
  getForward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  /** 카메라의 오른쪽 방향 (Y=0) */
  getRight(): THREE.Vector3 {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }
}
