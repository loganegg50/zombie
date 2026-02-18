import * as THREE from 'three';

/** 나무 위치 (공원 내부) — 플레이어 충돌용으로 외부에서 접근 */
export const TREE_POSITIONS: [number, number][] = [
  [-6, -6], [7, -5], [-5, 7], [8, 8], [0, -8],
];
export const TREE_TRUNK_RADIUS = 0.25;
export const TREE_CANOPY_Y = 2.5;     // 나무 잎 시작 높이
export const TREE_CANOPY_RADIUS = 1.2;

/** 낙엽 통나무 경사로 (45° 기울어진 긴 나무) */
export const RAMP_ORIGIN: [number, number] = [-6, 2]; // 시작점 (XZ, Y=0)
export const RAMP_DIR: [number, number] = [1, 0];     // 진행 방향 (단위벡터, +X)
export const RAMP_HORIZ_LEN = 4.5;                    // 수평 길이 (높이도 동일, 45°)
export const RAMP_RADIUS = 0.35;                       // 통나무 반지름

export class SceneManager {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 15, 45);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffeedd, 1.0);
    dir.position.set(10, 20, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -25;
    dir.shadow.camera.right = 25;
    dir.shadow.camera.top = 25;
    dir.shadow.camera.bottom = -25;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 50;
    this.scene.add(dir);

    // Ground — park interior (green)
    const parkGeo = new THREE.PlaneGeometry(32, 32);
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x3a7d44 });
    const parkGround = new THREE.Mesh(parkGeo, parkMat);
    parkGround.rotation.x = -Math.PI / 2;
    parkGround.position.y = -0.01;
    parkGround.receiveShadow = true;
    this.scene.add(parkGround);

    // Ground — outer area (dark dirt)
    const outerGeo = new THREE.PlaneGeometry(80, 80);
    const outerMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
    const outerGround = new THREE.Mesh(outerGeo, outerMat);
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = -0.02;
    outerGround.receiveShadow = true;
    this.scene.add(outerGround);

    this.buildDecorations();

    window.addEventListener('resize', () => this.onResize());
  }

  private buildDecorations(): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4226 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d8a4e });

    // 일반 나무
    for (const [x, z] of TREE_POSITIONS) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 2.5, 6), trunkMat);
      trunk.position.set(x, 1.25, z);
      trunk.castShadow = true;
      this.scene.add(trunk);

      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.2, 6, 6), leafMat);
      canopy.position.set(x, 3.2, z);
      canopy.castShadow = true;
      this.scene.add(canopy);
    }

    // 45° 기울어진 경사로 통나무
    const rampLen3D = RAMP_HORIZ_LEN * Math.SQRT2; // 3D 길이 = 수평길이 * √2
    const rampGeo = new THREE.CylinderGeometry(RAMP_RADIUS, RAMP_RADIUS * 1.1, rampLen3D, 8);
    const rampMesh = new THREE.Mesh(rampGeo, trunkMat);

    // 중심점: 시작점 + 방향 * 수평길이/2, 높이 = 수평길이/2 (45°)
    rampMesh.position.set(
      RAMP_ORIGIN[0] + RAMP_DIR[0] * RAMP_HORIZ_LEN / 2,
      RAMP_HORIZ_LEN / 2,
      RAMP_ORIGIN[1] + RAMP_DIR[1] * RAMP_HORIZ_LEN / 2,
    );

    // 방향이 +X (1,0)이면 Z축 기준으로 -45° 회전 → (0,1,0) → (1,1,0)/√2
    // RAMP_DIR = [1, 0]이므로 rotation.z = -PI/4
    if (RAMP_DIR[0] !== 0) {
      rampMesh.rotation.z = -Math.sign(RAMP_DIR[0]) * Math.PI / 4;
    } else {
      rampMesh.rotation.x = Math.sign(RAMP_DIR[1]) * Math.PI / 4;
    }

    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    this.scene.add(rampMesh);

    // 통나무 끝부분 나이테 표시 (바닥 쪽)
    const ringGeo = new THREE.CircleGeometry(RAMP_RADIUS * 1.05, 8);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1a });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(RAMP_ORIGIN[0], 0.05, RAMP_ORIGIN[1]);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);

    // Benches
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x8b6914 });
    const benchPositions: [number, number, number][] = [
      [-3, 0, 0], [4, 0, Math.PI / 2],
    ];
    for (const [x, z, rot] of benchPositions) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.5), benchMat);
      bench.position.set(x, 0.4, z);
      bench.rotation.y = rot;
      bench.castShadow = true;
      bench.receiveShadow = true;
      this.scene.add(bench);
    }
  }

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }
}
