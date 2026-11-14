import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getDirectionDelta } from './cubeMath';
import { coordKey, getMovingPlatformPos } from './engine';
import { getWorldById } from './levels';
import { createProceduralTextures, type ProceduralTextureSet } from './proceduralTextures';
import type {
  GameState,
  GridCoord,
  LevelDef,
  MoveDirection,
  PlayerAction,
  StepResult,
} from './types';

// Pre-allocated scratch math objects (zero GC in render loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _mat4A = new THREE.Matrix4();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);

const ROLL_DURATION = 0.165;
const CARRY_DURATION = 0.175;
const TELEPORT_DURATION = 0.24;
const BLOCKED_DURATION = 0.13;
const PARTICLE_POOL_SIZE = 72;

interface TileVisual {
  key: string;
  type: string;
  group: THREE.Group;
  plunger?: THREE.Mesh;
  bridgeDeck?: THREE.Group;
  bridgeGhost?: THREE.LineSegments;
  gateBeam?: THREE.Group;
  crumbleShards?: THREE.Mesh[];
  crumbleState: 'intact' | 'falling' | 'gone';
  crumbleTimer: number;
  goalRingOuter?: THREE.Mesh;
  goalRingInner?: THREE.Mesh;
  goalBeacon?: THREE.Mesh;
  teleportRing?: THREE.Mesh;
  baseY: number;
  bounceVelocity: number;
}

interface MovingPlatformVisual {
  group: THREE.Group;
  chevron: THREE.Mesh;
  currentPos: THREE.Vector3;
  targetPos: THREE.Vector3;
}

interface ParticleSlot {
  active: boolean;
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  color: THREE.Color;
}

type ActiveAnim =
  | {
      kind: 'roll';
      elapsed: number;
      duration: number;
      dir: MoveDirection;
      from: GridCoord;
      to: GridCoord;
      result: StepResult;
      postHandled: boolean;
    }
  | {
      kind: 'blocked';
      elapsed: number;
      duration: number;
      dir: MoveDirection;
      from: GridCoord;
    }
  | {
      kind: 'teleport';
      elapsed: number;
      duration: number;
      from: GridCoord;
      to: GridCoord;
      result: StepResult;
    }
  | {
      kind: 'carry';
      elapsed: number;
      duration: number;
      from: GridCoord;
      to: GridCoord;
      result: StepResult;
    }
  | {
      kind: 'wait';
      elapsed: number;
      duration: number;
      result: StepResult;
    };

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function snapQuaternionToRightAngles(q: THREE.Quaternion): void {
  _mat4A.makeRotationFromQuaternion(q);
  const e = _mat4A.elements;
  // Snap rotation 3x3 entries to exact {-1, 0, 1} to prevent cumulative float drift
  for (const idx of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {
    e[idx] = Math.round(e[idx]);
  }
  q.setFromRotationMatrix(_mat4A).normalize();
}

export class CubeSceneManager {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;
  private isSoftwareGl: boolean;

  private textures: ProceduralTextureSet;
  private envTexture: THREE.Texture;

  private worldRoot = new THREE.Group();
  private tilesGroup = new THREE.Group();
  private railsGroup = new THREE.Group();
  private movingGroup = new THREE.Group();
  private hintGroup = new THREE.Group();

  private cubePivot = new THREE.Group();
  private cubeBody = new THREE.Group();
  private contactShadow: THREE.Mesh;

  private tileVisuals = new Map<string, TileVisual>();
  private movingVisuals: MovingPlatformVisual[] = [];
  private currentLevel: LevelDef | null = null;
  private levelCenter = new THREE.Vector3(0, 0, 0);
  private levelSpan = 6;

  private activeAnim: ActiveAnim | null = null;
  private onAnimComplete: ((res: StepResult) => void) | null = null;
  private onLandCallback: (() => void) | null = null;
  private onContextLostCallback: ((lost: boolean) => void) | null = null;

  // Camera framing
  private camCurrentPos = new THREE.Vector3(4, 11, 10);
  private camCurrentLook = new THREE.Vector3(0, 0, 0);
  private menuShowcase = true;
  private menuOrbitAngle = 0.55;
  private shakeIntensity = 0;

  // Ambient background pillars & particle pool
  private bgPillars: THREE.InstancedMesh;
  private bgPillarSeeds: Array<{ x: number; y: number; z: number; sx: number; sy: number; phase: number }> = [];
  private particleMesh: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];

  // Hint visuals
  private hintRing: THREE.Mesh;
  private hintArrow: THREE.Mesh;
  private hintAction: PlayerAction | null = null;

  // Shared geometries & materials for clean disposal
  private disposables: Array<{ dispose: () => void }> = [];
  private frameId = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;
  private handleCanvasLost: (e: Event) => void;
  private handleCanvasRestored: () => void;

  // Shared materials
  private matPlinth: THREE.MeshStandardMaterial;
  private matCollar: THREE.MeshStandardMaterial;
  private matDeck: THREE.MeshStandardMaterial;
  private matGoalPad: THREE.MeshStandardMaterial;
  private matGoalGoldPad: THREE.MeshStandardMaterial;
  private matSwitchBase: THREE.MeshStandardMaterial;
  private matSwitchPlungerAny: THREE.MeshStandardMaterial;
  private matSwitchPlungerGold: THREE.MeshStandardMaterial;
  private matSwitchPlungerCyan: THREE.MeshStandardMaterial;
  private matBridgeDeck: THREE.MeshStandardMaterial;
  private matGatePost: THREE.MeshStandardMaterial;
  private matGateBeam: THREE.MeshStandardMaterial;
  private matCrumble: THREE.MeshStandardMaterial;
  private matSpikeMetal: THREE.MeshStandardMaterial;
  private matTeleportPad: THREE.MeshStandardMaterial;
  private matMovingDeck: THREE.MeshStandardMaterial;

  constructor(
    container: HTMLElement,
    options?: {
      onLand?: () => void;
      onContextLost?: (lost: boolean) => void;
    }
  ) {
    this.container = container;
    this.onLandCallback = options?.onLand ?? null;
    this.onContextLostCallback = options?.onContextLost ?? null;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#090d1a');
    this.scene.fog = new THREE.FogExp2('#090d1a', 0.024);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    pmrem.dispose();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(34, width / height, 0.2, 120);
    this.renderer.setSize(width, height, false);

    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());

    // Shared PBR materials
    this.matPlinth = new THREE.MeshStandardMaterial({
      color: '#17223b',
      roughness: 0.72,
      metalness: 0.15,
    });
    this.matCollar = new THREE.MeshStandardMaterial({
      color: '#22d3ee',
      emissive: '#0891b2',
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.55,
    });
    this.matDeck = new THREE.MeshStandardMaterial({
      color: '#25395c',
      roughness: 0.38,
      metalness: 0.22,
    });
    this.matGoalPad = new THREE.MeshStandardMaterial({
      color: '#10b981',
      emissive: '#059669',
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.4,
    });
    this.matGoalGoldPad = new THREE.MeshStandardMaterial({
      color: '#fbbf24',
      emissive: '#d97706',
      emissiveIntensity: 0.75,
      roughness: 0.18,
      metalness: 0.7,
    });
    this.matSwitchBase = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.45,
      metalness: 0.5,
    });
    this.matSwitchPlungerAny = new THREE.MeshStandardMaterial({
      color: '#facc15',
      emissive: '#ca8a04',
      emissiveIntensity: 0.6,
      roughness: 0.25,
      metalness: 0.25,
    });
    this.matSwitchPlungerGold = new THREE.MeshStandardMaterial({
      color: '#f59e0b',
      emissive: '#d97706',
      emissiveIntensity: 0.75,
      roughness: 0.2,
      metalness: 0.65,
    });
    this.matSwitchPlungerCyan = new THREE.MeshStandardMaterial({
      color: '#22d3ee',
      emissive: '#0891b2',
      emissiveIntensity: 0.75,
      roughness: 0.2,
      metalness: 0.65,
    });
    this.matBridgeDeck = new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#0284c7',
      emissiveIntensity: 0.45,
      roughness: 0.24,
      metalness: 0.5,
    });
    this.matGatePost = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.35,
      metalness: 0.75,
    });
    this.matGateBeam = new THREE.MeshStandardMaterial({
      color: '#fb7185',
      emissive: '#e11d48',
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.2,
      transparent: true,
      opacity: 0.88,
    });
    this.matCrumble = new THREE.MeshStandardMaterial({
      color: '#475569',
      emissive: '#9a3412',
      emissiveIntensity: 0.22,
      roughness: 0.78,
      metalness: 0.1,
    });
    this.matSpikeMetal = new THREE.MeshStandardMaterial({
      color: '#fb923c',
      emissive: '#c2410c',
      emissiveIntensity: 0.45,
      roughness: 0.22,
      metalness: 0.85,
    });
    this.matTeleportPad = new THREE.MeshStandardMaterial({
      color: '#c084fc',
      emissive: '#9333ea',
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.55,
    });
    this.matMovingDeck = new THREE.MeshStandardMaterial({
      color: '#818cf8',
      emissive: '#4f46e5',
      emissiveIntensity: 0.42,
      roughness: 0.28,
      metalness: 0.55,
    });

    this.disposables.push(
      this.matPlinth,
      this.matCollar,
      this.matDeck,
      this.matGoalPad,
      this.matGoalGoldPad,
      this.matSwitchBase,
      this.matSwitchPlungerAny,
      this.matSwitchPlungerGold,
      this.matSwitchPlungerCyan,
      this.matBridgeDeck,
      this.matGatePost,
      this.matGateBeam,
      this.matCrumble,
      this.matSpikeMetal,
      this.matTeleportPad,
      this.matMovingDeck
    );

    this.setupLighting();
    this.setupCube();
    this.contactShadow = this.createContactShadow();
    this.scene.add(this.contactShadow);

    const { pillars } = this.createBackgroundPillars();
    this.bgPillars = pillars;
    this.scene.add(this.bgPillars);

    this.particleMesh = this.createParticlePool();
    this.scene.add(this.particleMesh);

    const { ring, arrow } = this.createHintVisuals();
    this.hintRing = ring;
    this.hintArrow = arrow;
    this.hintGroup.add(ring, arrow);
    this.hintGroup.visible = false;

    this.worldRoot.add(
      this.tilesGroup,
      this.railsGroup,
      this.movingGroup,
      this.hintGroup,
      this.cubePivot
    );
    this.scene.add(this.worldRoot);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.handleCanvasLost = (e: Event) => {
      e.preventDefault();
      this.onContextLostCallback?.(true);
    };
    this.handleCanvasRestored = () => {
      this.onContextLostCallback?.(false);
    };
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleCanvasLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleCanvasRestored);

    this.startLoop();
  }

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight('#93c5fd', '#1e1b4b', 0.85);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#fff7ed', 2.1);
    keyLight.position.set(9, 16, 10);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 42;
      const d = 12;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#38bdf8', 0.95);
    rimLight.position.set(-10, 8, -12);
    this.scene.add(rimLight);
  }

  private setupCube(): void {
    // 1. Primary silhouette: beveled inner chassis
    const shape = new THREE.Shape();
    const s = 0.41;
    const r = 0.05;
    shape.moveTo(-s + r, -s);
    shape.lineTo(s - r, -s);
    shape.quadraticCurveTo(s, -s, s, -s + r);
    shape.lineTo(s, s - r);
    shape.quadraticCurveTo(s, s, s - r, s);
    shape.lineTo(-s + r, s);
    shape.quadraticCurveTo(-s, s, -s, s - r);
    shape.lineTo(-s, -s + r);
    shape.quadraticCurveTo(-s, -s, -s + r, -s);

    const chassisGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.82,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.07,
      bevelSegments: 2,
    });
    chassisGeo.center();
    const chassisMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.42,
      metalness: 0.65,
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.castShadow = !this.isSoftwareGl;
    chassis.receiveShadow = true;
    this.cubeBody.add(chassis);
    this.disposables.push(chassisGeo, chassisMat);

    // 2. Secondary silhouette: 8 metallic corner bumpers
    const cornerGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const cornerMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.2,
      metalness: 0.88,
    });
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const bumper = new THREE.Mesh(cornerGeo, cornerMat);
          bumper.position.set(sx * 0.4, sy * 0.4, sz * 0.4);
          this.cubeBody.add(bumper);
        }
      }
    }
    this.disposables.push(cornerGeo, cornerMat);

    // 3. Accent detail: 6 inlaid textured face plates matching createDefaultOrientation()
    // (+Y = GOLD, -Y = CYAN, +Z/-Z/+X/-X = NEUTRAL)
    const plateGeo = new THREE.PlaneGeometry(0.76, 0.76);
    const goldMat = new THREE.MeshStandardMaterial({
      map: this.textures.goldFace,
      emissiveMap: this.textures.goldFace,
      emissive: new THREE.Color('#fbbf24'),
      emissiveIntensity: 0.35,
      roughness: 0.22,
      metalness: 0.55,
    });
    const cyanMat = new THREE.MeshStandardMaterial({
      map: this.textures.cyanFace,
      emissiveMap: this.textures.cyanFace,
      emissive: new THREE.Color('#22d3ee'),
      emissiveIntensity: 0.35,
      roughness: 0.22,
      metalness: 0.55,
    });
    const neutralMat = new THREE.MeshStandardMaterial({
      map: this.textures.neutralFace,
      roughness: 0.38,
      metalness: 0.12,
    });

    const faces: Array<{ pos: [number, number, number]; rot: [number, number, number]; mat: THREE.Material }> = [
      { pos: [0, 0.495, 0], rot: [-Math.PI / 2, 0, 0], mat: goldMat },     // Top (+Y)
      { pos: [0, -0.495, 0], rot: [Math.PI / 2, 0, 0], mat: cyanMat },     // Bottom (-Y)
      { pos: [0, 0, 0.495], rot: [0, 0, 0], mat: neutralMat },             // Front (+Z)
      { pos: [0, 0, -0.495], rot: [0, Math.PI, 0], mat: neutralMat },      // Back (-Z)
      { pos: [-0.495, 0, 0], rot: [0, -Math.PI / 2, 0], mat: neutralMat }, // Left (-X)
      { pos: [0.495, 0, 0], rot: [0, Math.PI / 2, 0], mat: neutralMat },   // Right (+X)
    ];

    for (const f of faces) {
      const plate = new THREE.Mesh(plateGeo, f.mat);
      plate.position.set(...f.pos);
      plate.rotation.set(...f.rot);
      this.cubeBody.add(plate);
    }
    this.disposables.push(plateGeo, goldMat, cyanMat, neutralMat);

    this.cubeBody.position.set(0, 0.5, 0);
    this.cubePivot.add(this.cubeBody);
  }

  private createContactShadow(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(1.35, 1.35);
    const mat = new THREE.MeshBasicMaterial({
      map: this.textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.015;
    this.disposables.push(geo, mat);
    return mesh;
  }

  private createBackgroundPillars(): { pillars: THREE.InstancedMesh } {
    const count = 34;
    const geo = new THREE.CylinderGeometry(0.32, 0.16, 1, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: '#1a2744',
      roughness: 0.65,
      metalness: 0.25,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.25;
      const radius = 11 + (i % 5) * 3.4;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = -3.5 - (i % 4) * 2.2;
      const sx = 0.7 + (i % 4) * 0.45;
      const sy = 2.5 + (i % 5) * 1.8;
      this.bgPillarSeeds.push({ x, y, z, sx, sy, phase: i * 0.7 });

      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sx);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();

    this.disposables.push(geo, mat);
    return { pillars: mesh };
  }

  private createParticlePool(): THREE.InstancedMesh {
    const geo = new THREE.OctahedronGeometry(0.09, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, PARTICLE_POOL_SIZE);
    mesh.frustumCulled = false;

    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        life: 0,
        maxLife: 0.5,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        scale: 1,
        color: new THREE.Color('#22d3ee'),
      });
      mesh.setMatrixAt(i, zero);
      mesh.setColorAt(i, new THREE.Color('#22d3ee'));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.disposables.push(geo, mat);
    return mesh;
  }

  private spawnParticles(
    x: number,
    y: number,
    z: number,
    colorHex: string,
    count: number,
    speed = 2.8
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.life = 0;
        p.maxLife = 0.42 + Math.random() * 0.35;
        p.pos.set(x, y, z);
        const theta = Math.random() * Math.PI * 2;
        const r = (0.3 + Math.random() * 0.7) * speed;
        p.vel.set(Math.cos(theta) * r, 1.4 + Math.random() * speed, Math.sin(theta) * r);
        p.scale = 0.7 + Math.random() * 0.8;
        p.color.set(colorHex);
        spawned++;
      }
    }
  }

  private createHintVisuals(): { ring: THREE.Mesh; arrow: THREE.Mesh } {
    const ringGeo = new THREE.RingGeometry(0.36, 0.47, 4);
    ringGeo.rotateZ(Math.PI / 4);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#fde047',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.03;

    const arrowGeo = new THREE.ConeGeometry(0.18, 0.36, 4);
    arrowGeo.rotateX(Math.PI);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: '#fde047',
      toneMapped: false,
    });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.y = 0.72;

    this.disposables.push(ringGeo, ringMat, arrowGeo, arrowMat);
    return { ring, arrow };
  }

  public setMenuShowcase(isMenu: boolean): void {
    this.menuShowcase = isMenu;
  }

  public setHint(action: PlayerAction | null, state: GameState | null): void {
    this.hintAction = action;
    if (!action || !state) {
      this.hintGroup.visible = false;
      return;
    }

    let targetX = state.cubePos.x;
    let targetZ = state.cubePos.z;
    if (action !== 'WAIT') {
      const { dx, dz } = getDirectionDelta(action);
      targetX += dx;
      targetZ += dz;
    }

    this.hintGroup.position.set(targetX, 0, targetZ);
    this.hintGroup.visible = true;
  }

  public loadLevel(level: LevelDef, initialState: GameState): void {
    this.currentLevel = level;
    this.activeAnim = null;
    this.onAnimComplete = null;
    this.hintGroup.visible = false;
    this.hintAction = null;

    // Clear previous level objects
    this.clearLevelMeshes();

    const world = getWorldById(level.worldId);
    this.scene.background = new THREE.Color(world.bgTopHex);
    this.scene.fog = new THREE.FogExp2(world.bgTopHex, 0.024);
    this.matCollar.color.set(world.accentHex);
    this.matCollar.emissive.set(world.accentHex);
    this.matDeck.color.set(world.platformHex);

    // Build shared tile geometries (reused across all tiles for performance)
    const plinthGeo = new THREE.CylinderGeometry(0.46, 0.34, 0.42, 4);
    plinthGeo.rotateY(Math.PI / 4);
    const collarGeo = new THREE.BoxGeometry(0.94, 0.07, 0.94);
    const deckGeo = new THREE.BoxGeometry(0.9, 0.08, 0.9);
    this.disposables.push(plinthGeo, collarGeo, deckGeo);

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const tile of level.tiles) {
      minX = Math.min(minX, tile.x);
      maxX = Math.max(maxX, tile.x);
      minZ = Math.min(minZ, tile.z);
      maxZ = Math.max(maxZ, tile.z);

      const group = new THREE.Group();
      group.position.set(tile.x, 0, tile.z);
      const key = coordKey(tile.x, tile.z);
      const visual: TileVisual = {
        key,
        type: tile.type,
        group,
        crumbleState: 'intact',
        crumbleTimer: 0,
        baseY: 0,
        bounceVelocity: 0,
      };

      if (tile.type === 'bridge') {
        const bridgeGroup = new THREE.Group();
        const bDeck = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.12, 0.9),
          this.matBridgeDeck
        );
        bDeck.position.y = -0.06;
        bDeck.receiveShadow = true;
        bridgeGroup.add(bDeck);

        const railGeo = new THREE.BoxGeometry(0.94, 0.05, 0.1);
        const rail1 = new THREE.Mesh(railGeo, this.matCollar);
        rail1.position.set(0, -0.01, 0.43);
        const rail2 = new THREE.Mesh(railGeo, this.matCollar);
        rail2.position.set(0, -0.01, -0.43);
        bridgeGroup.add(rail1, rail2);

        const ghostGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.86, 0.1, 0.86));
        const ghostMat = new THREE.LineBasicMaterial({
          color: '#38bdf8',
          transparent: true,
          opacity: 0.4,
        });
        const ghost = new THREE.LineSegments(ghostGeo, ghostMat);
        ghost.position.y = -0.06;

        this.disposables.push(bDeck.geometry, railGeo, ghostGeo, ghostMat);

        group.add(bridgeGroup, ghost);
        visual.bridgeDeck = bridgeGroup;
        visual.bridgeGhost = ghost;
      } else if (tile.type === 'crumbling') {
        // 4 segmented stone slabs + glowing fissure under-plate
        const fissureGeo = new THREE.BoxGeometry(0.82, 0.1, 0.82);
        const fissureMat = new THREE.MeshStandardMaterial({
          color: '#f97316',
          emissive: '#ea580c',
          emissiveIntensity: 0.55,
          roughness: 0.4,
        });
        const fissure = new THREE.Mesh(fissureGeo, fissureMat);
        fissure.position.y = -0.11;
        group.add(fissure);
        this.disposables.push(fissureGeo, fissureMat);

        const shardGeo = new THREE.BoxGeometry(0.41, 0.11, 0.41);
        this.disposables.push(shardGeo);
        const shards: THREE.Mesh[] = [];
        const offsets: Array<[number, number]> = [
          [-0.22, -0.22],
          [0.22, -0.22],
          [-0.22, 0.22],
          [0.22, 0.22],
        ];
        for (const [ox, oz] of offsets) {
          const shard = new THREE.Mesh(shardGeo, this.matCrumble);
          shard.position.set(ox, -0.055, oz);
          shard.receiveShadow = true;
          group.add(shard);
          shards.push(shard);
        }
        visual.crumbleShards = shards;
      } else {
        // Standard pedestal plinth + collar + deck
        const plinth = new THREE.Mesh(plinthGeo, this.matPlinth);
        plinth.position.y = -0.3;
        const collar = new THREE.Mesh(collarGeo, this.matCollar);
        collar.position.y = -0.095;
        const deck = new THREE.Mesh(deckGeo, this.matDeck);
        deck.position.y = -0.04;
        deck.receiveShadow = true;
        group.add(plinth, collar, deck);

        if (tile.type === 'goal') {
          const isGoldGoal = tile.goalCondition === 'gold_down';
          const padGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.04, 24);
          const pad = new THREE.Mesh(
            padGeo,
            isGoldGoal ? this.matGoalGoldPad : this.matGoalPad
          );
          pad.position.y = 0.015;
          group.add(pad);

          const outerGeo = new THREE.TorusGeometry(0.36, 0.032, 8, 28);
          outerGeo.rotateX(Math.PI / 2);
          const outer = new THREE.Mesh(
            outerGeo,
            isGoldGoal ? this.matGoalGoldPad : this.matGoalPad
          );
          outer.position.y = 0.18;
          group.add(outer);

          const innerGeo = new THREE.TorusGeometry(0.22, 0.024, 8, 24);
          innerGeo.rotateX(Math.PI / 2);
          const inner = new THREE.Mesh(
            innerGeo,
            isGoldGoal ? this.matGoalGoldPad : this.matGoalPad
          );
          inner.position.y = 0.32;
          group.add(inner);

          const beaconGeo = new THREE.OctahedronGeometry(0.11, 0);
          const beacon = new THREE.Mesh(
            beaconGeo,
            isGoldGoal ? this.matGoalGoldPad : this.matGoalPad
          );
          beacon.position.y = 0.52;
          group.add(beacon);

          this.disposables.push(padGeo, outerGeo, innerGeo, beaconGeo);
          visual.goalRingOuter = outer;
          visual.goalRingInner = inner;
          visual.goalBeacon = beacon;
        } else if (tile.type === 'switch') {
          const housingGeo = new THREE.CylinderGeometry(0.35, 0.38, 0.05, 8);
          const housing = new THREE.Mesh(housingGeo, this.matSwitchBase);
          housing.position.y = 0.025;
          group.add(housing);

          const cond = tile.condition ?? 'any';
          const plungerMat =
            cond === 'gold_down'
              ? this.matSwitchPlungerGold
              : cond === 'cyan_down'
                ? this.matSwitchPlungerCyan
                : this.matSwitchPlungerAny;

          const plungerGeo =
            cond === 'gold_down'
              ? new THREE.CylinderGeometry(0.24, 0.24, 0.07, 4)
              : cond === 'cyan_down'
                ? new THREE.TorusGeometry(0.18, 0.06, 8, 20)
                : new THREE.CylinderGeometry(0.23, 0.23, 0.07, 16);

          if (cond === 'cyan_down') {
            plungerGeo.rotateX(Math.PI / 2);
          }
          const plunger = new THREE.Mesh(plungerGeo, plungerMat);
          plunger.position.y = 0.06;
          group.add(plunger);

          this.disposables.push(housingGeo, plungerGeo);
          visual.plunger = plunger;
        } else if (tile.type === 'gate') {
          const gateGroup = new THREE.Group();
          const postGeo = new THREE.BoxGeometry(0.12, 0.65, 0.12);
          const postL = new THREE.Mesh(postGeo, this.matGatePost);
          postL.position.set(-0.38, 0.32, 0);
          const postR = new THREE.Mesh(postGeo, this.matGatePost);
          postR.position.set(0.38, 0.32, 0);
          group.add(postL, postR);

          const barGeo = new THREE.BoxGeometry(0.76, 0.1, 0.08);
          const bar1 = new THREE.Mesh(barGeo, this.matGateBeam);
          bar1.position.set(0, 0.22, 0);
          const bar2 = new THREE.Mesh(barGeo, this.matGateBeam);
          bar2.position.set(0, 0.46, 0);
          gateGroup.add(bar1, bar2);
          group.add(gateGroup);

          this.disposables.push(postGeo, barGeo);
          visual.gateBeam = gateGroup;
        } else if (tile.type === 'spike') {
          const hazardPlateGeo = new THREE.PlaneGeometry(0.84, 0.84);
          hazardPlateGeo.rotateX(-Math.PI / 2);
          const hazardMat = new THREE.MeshStandardMaterial({
            map: this.textures.hazardStripe,
            roughness: 0.45,
          });
          const hazardPlate = new THREE.Mesh(hazardPlateGeo, hazardMat);
          hazardPlate.position.y = 0.012;
          group.add(hazardPlate);

          const spikeGeo = new THREE.ConeGeometry(0.09, 0.32, 4);
          const coords: Array<[number, number]> = [
            [0, 0],
            [-0.22, -0.22],
            [0.22, -0.22],
            [-0.22, 0.22],
            [0.22, 0.22],
          ];
          for (const [sx, sz] of coords) {
            const sp = new THREE.Mesh(spikeGeo, this.matSpikeMetal);
            sp.position.set(sx, 0.16, sz);
            sp.castShadow = !this.isSoftwareGl;
            group.add(sp);
          }
          this.disposables.push(hazardPlateGeo, hazardMat, spikeGeo);
        } else if (tile.type === 'teleport') {
          const padGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.04, 24);
          const pad = new THREE.Mesh(padGeo, this.matTeleportPad);
          pad.position.y = 0.015;
          group.add(pad);

          const ringGeo = new THREE.TorusGeometry(0.3, 0.032, 8, 24);
          ringGeo.rotateX(Math.PI / 2);
          const ring = new THREE.Mesh(ringGeo, this.matTeleportPad);
          ring.position.y = 0.2;
          group.add(ring);

          this.disposables.push(padGeo, ringGeo);
          visual.teleportRing = ring;
        }
      }

      this.tilesGroup.add(group);
      this.tileVisuals.set(key, visual);
    }

    // Build moving platforms & path rails
    if (level.movingPlatforms) {
      const nodeGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12);
      const nodeMat = new THREE.MeshBasicMaterial({
        color: '#818cf8',
        transparent: true,
        opacity: 0.45,
      });
      const sledGeo = new THREE.BoxGeometry(0.9, 0.16, 0.9);
      const underGeo = new THREE.CylinderGeometry(0.32, 0.2, 0.14, 6);
      const chevGeo = new THREE.ConeGeometry(0.11, 0.22, 3);
      chevGeo.rotateX(Math.PI / 2);
      const chevMat = new THREE.MeshBasicMaterial({ color: '#e0e7ff' });
      this.disposables.push(nodeGeo, nodeMat, sledGeo, underGeo, chevGeo, chevMat);

      level.movingPlatforms.forEach((mp, idx) => {
        for (const p of mp.path) {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.z);
          maxZ = Math.max(maxZ, p.z);

          const node = new THREE.Mesh(nodeGeo, nodeMat);
          node.position.set(p.x, -0.05, p.z);
          this.railsGroup.add(node);
        }

        const startPos = getMovingPlatformPos(level, initialState.movingSteps, idx) ?? mp.path[0];
        const mGroup = new THREE.Group();
        mGroup.position.set(startPos.x, 0, startPos.z);

        const deck = new THREE.Mesh(sledGeo, this.matMovingDeck);
        deck.position.y = -0.08;
        deck.receiveShadow = true;

        const under = new THREE.Mesh(underGeo, this.matPlinth);
        under.position.y = -0.22;

        const chev = new THREE.Mesh(chevGeo, chevMat);
        chev.position.y = 0.025;

        mGroup.add(deck, under, chev);
        this.movingGroup.add(mGroup);

        this.movingVisuals.push({
          group: mGroup,
          chevron: chev,
          currentPos: new THREE.Vector3(startPos.x, 0, startPos.z),
          targetPos: new THREE.Vector3(startPos.x, 0, startPos.z),
        });
      });
    }

    // Center & span for responsive isometric camera framing
    if (!Number.isFinite(minX)) {
      minX = maxX = minZ = maxZ = 0;
    }
    this.levelCenter.set((minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5);
    this.levelSpan = Math.max(4.5, maxX - minX + 1, maxZ - minZ + 1);

    this.resetCubeVisuals(initialState);
    this.syncVisualState(initialState, true);
  }

  private clearLevelMeshes(): void {
    const clearGroup = (g: THREE.Group) => {
      while (g.children.length > 0) {
        g.remove(g.children[0]);
      }
    };
    clearGroup(this.tilesGroup);
    clearGroup(this.railsGroup);
    clearGroup(this.movingGroup);
    this.tileVisuals.clear();
    this.movingVisuals = [];
  }

  public resetCubeVisuals(state: GameState): void {
    this.activeAnim = null;
    this.onAnimComplete = null;
    this.cubePivot.position.set(state.cubePos.x, 0, state.cubePos.z);
    this.cubePivot.rotation.set(0, 0, 0);
    this.cubePivot.scale.set(1, 1, 1);
    this.cubeBody.position.set(0, 0.5, 0);
    this.cubeBody.quaternion.identity();
    this.contactShadow.position.set(state.cubePos.x, 0.015, state.cubePos.z);
    this.contactShadow.scale.set(1, 1, 1);
    this.syncVisualState(state, true);
  }

  public syncVisualState(state: GameState, immediate = false): void {
    if (!this.currentLevel) return;

    for (const [key, v] of this.tileVisuals.entries()) {
      if (v.type === 'switch' && v.plunger) {
        const active = state.activatedSwitches.includes(key);
        const targetY = active ? 0.015 : 0.062;
        if (immediate) v.plunger.position.y = targetY;
      }

      if (v.type === 'bridge' && v.bridgeDeck && v.bridgeGhost) {
        const open = state.openTargets.includes(key);
        v.bridgeDeck.visible = open;
        v.bridgeGhost.visible = !open;
        if (immediate) {
          v.bridgeDeck.position.y = open ? 0 : -0.35;
          v.bridgeDeck.scale.setScalar(open ? 1 : 0.7);
        }
      }

      if (v.type === 'gate' && v.gateBeam) {
        const open = state.openTargets.includes(key);
        if (immediate) {
          v.gateBeam.position.y = open ? -0.6 : 0;
          v.gateBeam.visible = !open;
        }
      }

      if (v.type === 'crumbling' && v.crumbleShards) {
        const broken = state.brokenTiles.includes(key);
        if (immediate) {
          v.crumbleState = broken ? 'gone' : 'intact';
          v.crumbleTimer = 0;
          const offsets: Array<[number, number]> = [
            [-0.22, -0.22],
            [0.22, -0.22],
            [-0.22, 0.22],
            [0.22, 0.22],
          ];
          v.crumbleShards.forEach((s, idx) => {
            s.visible = !broken;
            s.position.set(offsets[idx][0], -0.055, offsets[idx][1]);
            s.rotation.set(0, 0, 0);
          });
        } else if (broken && v.crumbleState === 'intact') {
          v.crumbleState = 'falling';
          v.crumbleTimer = 0;
          const [cx, cz] = key.split(',').map(Number);
          this.spawnParticles(cx, 0.05, cz, '#f97316', 10, 2.2);
        }
      }
    }

    // Update moving platform target positions & directional chevrons
    if (this.currentLevel.movingPlatforms) {
      this.currentLevel.movingPlatforms.forEach((mp, idx) => {
        const mv = this.movingVisuals[idx];
        if (!mv) return;
        const pos = getMovingPlatformPos(this.currentLevel!, state.movingSteps, idx);
        const nextStep = ((state.movingSteps[idx] ?? 0) + 1) % mp.path.length;
        const nextPos = mp.path[nextStep];
        if (pos) {
          mv.targetPos.set(pos.x, 0, pos.z);
          if (immediate) {
            mv.currentPos.copy(mv.targetPos);
            mv.group.position.copy(mv.targetPos);
          }
          if (nextPos) {
            const dx = nextPos.x - pos.x;
            const dz = nextPos.z - pos.z;
            if (dx !== 0 || dz !== 0) {
              mv.chevron.rotation.y = Math.atan2(dx, dz);
              mv.chevron.visible = true;
            } else {
              mv.chevron.visible = false;
            }
          }
        }
      });
    }
  }

  public isAnimating(): boolean {
    return this.activeAnim !== null;
  }

  public playStepTransition(result: StepResult, onComplete: (res: StepResult) => void): void {
    this.onAnimComplete = onComplete;

    if (!result.valid) {
      if (result.direction) {
        this.activeAnim = {
          kind: 'blocked',
          elapsed: 0,
          duration: BLOCKED_DURATION,
          dir: result.direction,
          from: { ...result.prevState.cubePos },
        };
      } else {
        onComplete(result);
      }
      return;
    }

    if (result.direction) {
      this.activeAnim = {
        kind: 'roll',
        elapsed: 0,
        duration: ROLL_DURATION,
        dir: result.direction,
        from: { ...result.prevState.cubePos },
        to: { ...result.landedPos },
        result,
        postHandled: false,
      };
      return;
    }

    if (result.carriedByPlatform) {
      this.syncVisualState(result.nextState, false);
      this.activeAnim = {
        kind: 'carry',
        elapsed: 0,
        duration: CARRY_DURATION,
        from: { ...result.carriedByPlatform.from },
        to: { ...result.carriedByPlatform.to },
        result,
      };
      return;
    }

    // Wait step with no carry
    this.syncVisualState(result.nextState, false);
    this.activeAnim = {
      kind: 'wait',
      elapsed: 0,
      duration: CARRY_DURATION,
      result,
    };
  }

  private handleResize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      const rawDt = this.clock.getDelta();
      const dt = Math.min(rawDt, 0.05);

      this.update(dt, this.clock.elapsedTime);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void): void {
    if (this.disposed) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private update(dt: number, elapsed: number): void {
    // 1. Update active cube animation
    if (this.activeAnim) {
      this.updateActiveAnim(dt);
    }

    // 2. Smoothly update tile animations (switches, bridges, gates, goals, teleports, crumbles)
    const stateRef = this.activeAnim
      ? this.activeAnim.kind === 'roll' && !this.activeAnim.postHandled
        ? this.activeAnim.result.prevState
        : 'result' in this.activeAnim
          ? this.activeAnim.result.nextState
          : null
      : null;

    for (const [key, v] of this.tileVisuals.entries()) {
      // Bounce recovery
      if (v.baseY !== 0 || Math.abs(v.bounceVelocity) > 0.001) {
        v.bounceVelocity += -v.baseY * 180 * dt;
        v.bounceVelocity *= Math.exp(-14 * dt);
        v.baseY += v.bounceVelocity * dt;
        if (Math.abs(v.baseY) < 0.001 && Math.abs(v.bounceVelocity) < 0.01) {
          v.baseY = 0;
          v.bounceVelocity = 0;
        }
        v.group.position.y = v.baseY;
      }

      if (v.type === 'goal' && v.goalRingOuter && v.goalRingInner && v.goalBeacon) {
        v.goalRingOuter.rotation.z = elapsed * 1.4;
        v.goalRingInner.rotation.z = -elapsed * 2.1;
        v.goalBeacon.rotation.y = elapsed * 1.8;
        v.goalBeacon.position.y = 0.52 + Math.sin(elapsed * 2.6) * 0.05;
      }

      if (v.type === 'teleport' && v.teleportRing) {
        v.teleportRing.position.y = 0.2 + Math.sin(elapsed * 3.2) * 0.04;
        v.teleportRing.rotation.z = elapsed * 2.4;
      }

      if (v.type === 'switch' && v.plunger && stateRef) {
        const active = stateRef.activatedSwitches.includes(key);
        const target = active ? 0.015 : 0.062;
        v.plunger.position.y = THREE.MathUtils.damp(v.plunger.position.y, target, 18, dt);
      }

      if (v.type === 'bridge' && v.bridgeDeck && stateRef) {
        const open = stateRef.openTargets.includes(key);
        const targetY = open ? 0 : -0.35;
        const targetS = open ? 1 : 0.7;
        v.bridgeDeck.position.y = THREE.MathUtils.damp(v.bridgeDeck.position.y, targetY, 14, dt);
        const s = THREE.MathUtils.damp(v.bridgeDeck.scale.x, targetS, 14, dt);
        v.bridgeDeck.scale.setScalar(s);
      }

      if (v.type === 'gate' && v.gateBeam && stateRef) {
        const open = stateRef.openTargets.includes(key);
        const targetY = open ? -0.6 : 0;
        v.gateBeam.position.y = THREE.MathUtils.damp(v.gateBeam.position.y, targetY, 15, dt);
        v.gateBeam.visible = v.gateBeam.position.y > -0.52;
      }

      if (v.type === 'crumbling' && v.crumbleState === 'falling' && v.crumbleShards) {
        v.crumbleTimer += dt;
        v.crumbleShards.forEach((s, i) => {
          const dirX = i % 2 === 0 ? -1 : 1;
          const dirZ = i < 2 ? -1 : 1;
          s.position.x += dirX * 0.45 * dt;
          s.position.z += dirZ * 0.45 * dt;
          s.position.y -= (1.5 + v.crumbleTimer * 6) * dt;
          s.rotation.x += dirZ * 3.2 * dt;
          s.rotation.z -= dirX * 2.8 * dt;
        });
        if (v.crumbleTimer > 0.65) {
          v.crumbleState = 'gone';
          v.crumbleShards.forEach((s) => {
            s.visible = false;
          });
        }
      }
    }

    // 3. Smoothly glide moving platforms
    for (const mv of this.movingVisuals) {
      mv.currentPos.x = THREE.MathUtils.damp(mv.currentPos.x, mv.targetPos.x, 16, dt);
      mv.currentPos.z = THREE.MathUtils.damp(mv.currentPos.z, mv.targetPos.z, 16, dt);
      mv.group.position.set(
        mv.currentPos.x,
        Math.sin(elapsed * 2.5) * 0.025,
        mv.currentPos.z
      );
    }

    // 4. Hint bounce
    if (this.hintGroup.visible) {
      this.hintArrow.position.y = 0.72 + Math.sin(elapsed * 5) * 0.09;
      this.hintRing.rotation.y = elapsed * 1.5;
      const pulse = 0.94 + Math.sin(elapsed * 5) * 0.08;
      this.hintRing.scale.setScalar(pulse);
    }

    // 5. Background floating pillars
    for (let i = 0; i < this.bgPillarSeeds.length; i++) {
      const seed = this.bgPillarSeeds[i];
      _vec3A.set(
        this.levelCenter.x + seed.x,
        seed.y + Math.sin(elapsed * 0.55 + seed.phase) * 0.35,
        this.levelCenter.z + seed.z
      );
      _vec3B.set(seed.sx, seed.sy, seed.sx);
      _quatA.identity();
      _mat4A.compose(_vec3A, _quatA, _vec3B);
      this.bgPillars.setMatrixAt(i, _mat4A);
    }
    this.bgPillars.instanceMatrix.needsUpdate = true;

    // 6. Pooled particle bursts
    let anyParticleUpdated = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyParticleUpdated = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _mat4A.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, _mat4A);
        continue;
      }
      p.vel.y -= 7.5 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const t = 1 - p.life / p.maxLife;
      const s = p.scale * t;
      _vec3A.set(s, s, s);
      _quatA.setFromEuler(_mat4A.elements[0] ? new THREE.Euler(p.life * 6, p.life * 4, 0) : new THREE.Euler());
      _mat4A.compose(p.pos, _quatA, _vec3A);
      this.particleMesh.setMatrixAt(i, _mat4A);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (anyParticleUpdated) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }

    // 7. Smooth Isometric Camera Framing + Shake
    this.updateCamera(dt, elapsed);
  }

  private updateCamera(dt: number, elapsed: number): void {
    const aspect = Math.max(0.5, this.camera.aspect);
    // Fit entire level comfortably on both desktop landscape and portrait mobile
    const portraitBoost = aspect < 1 ? 1 / Math.max(0.62, aspect) : 1;
    const distScale = Math.max(1, this.levelSpan / 5.4) * portraitBoost;

    let desiredX: number;
    let desiredY: number;
    let desiredZ: number;
    let lookX = this.levelCenter.x;
    let lookY = 0.2;
    let lookZ = this.levelCenter.z;

    if (this.menuShowcase) {
      this.menuOrbitAngle += dt * 0.22;
      const radius = 9.5 * distScale;
      desiredX = this.levelCenter.x + Math.sin(this.menuOrbitAngle) * radius;
      desiredY = 8.4 * distScale;
      desiredZ = this.levelCenter.z + Math.cos(this.menuOrbitAngle) * radius;
    } else {
      // Crisp 3/4 isometric perspective aligned with UP=-Z, DOWN=+Z, LEFT=-X, RIGHT=+X
      desiredX = this.levelCenter.x + 2.4 * distScale;
      desiredY = 10.8 * distScale;
      desiredZ = this.levelCenter.z + 9.2 * distScale;
      // Subtle follow bias toward the cube
      lookX = THREE.MathUtils.lerp(this.levelCenter.x, this.cubePivot.position.x, 0.22);
      lookZ = THREE.MathUtils.lerp(this.levelCenter.z, this.cubePivot.position.z, 0.22);
    }

    this.camCurrentPos.x = THREE.MathUtils.damp(this.camCurrentPos.x, desiredX, 6.5, dt);
    this.camCurrentPos.y = THREE.MathUtils.damp(this.camCurrentPos.y, desiredY, 6.5, dt);
    this.camCurrentPos.z = THREE.MathUtils.damp(this.camCurrentPos.z, desiredZ, 6.5, dt);

    this.camCurrentLook.x = THREE.MathUtils.damp(this.camCurrentLook.x, lookX, 8, dt);
    this.camCurrentLook.y = THREE.MathUtils.damp(this.camCurrentLook.y, lookY, 8, dt);
    this.camCurrentLook.z = THREE.MathUtils.damp(this.camCurrentLook.z, lookZ, 8, dt);

    if (this.shakeIntensity > 0.001) {
      this.shakeIntensity *= Math.exp(-14 * dt);
      this.camera.position.set(
        this.camCurrentPos.x + Math.sin(elapsed * 55) * this.shakeIntensity,
        this.camCurrentPos.y + Math.cos(elapsed * 48) * this.shakeIntensity * 0.6,
        this.camCurrentPos.z
      );
    } else {
      this.camera.position.copy(this.camCurrentPos);
    }

    this.camera.lookAt(this.camCurrentLook);
  }

  private updateActiveAnim(dt: number): void {
    const anim = this.activeAnim;
    if (!anim) return;
    anim.elapsed += dt;
    const rawT = Math.min(1, anim.elapsed / anim.duration);

    if (anim.kind === 'blocked') {
      const { dx, dz } = getDirectionDelta(anim.dir);
      const kick = Math.sin(rawT * Math.PI) * 0.14;
      this.cubePivot.position.set(anim.from.x + dx * 0.5, 0, anim.from.z + dz * 0.5);
      this.cubeBody.position.set(-dx * 0.5, 0.5, -dz * 0.5);
      if (dx !== 0) this.cubePivot.rotation.z = -dx * kick;
      if (dz !== 0) this.cubePivot.rotation.x = dz * kick;

      if (rawT >= 1) {
        this.cubePivot.rotation.set(0, 0, 0);
        this.cubePivot.position.set(anim.from.x, 0, anim.from.z);
        this.cubeBody.position.set(0, 0.5, 0);
        this.activeAnim = null;
      }
      return;
    }

    if (anim.kind === 'roll') {
      // Smooth cubic ease-in-out for physical weight
      const eased =
        rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
      const { dx, dz } = getDirectionDelta(anim.dir);
      const angle = eased * (Math.PI / 2);

      this.cubePivot.position.set(anim.from.x + dx * 0.5, 0, anim.from.z + dz * 0.5);
      this.cubeBody.position.set(-dx * 0.5, 0.5, -dz * 0.5);

      if (dz === -1) this.cubePivot.rotation.x = -angle;
      else if (dz === 1) this.cubePivot.rotation.x = angle;
      else if (dx === -1) this.cubePivot.rotation.z = angle;
      else if (dx === 1) this.cubePivot.rotation.z = -angle;

      // Contact shadow tracks interpolated cube center
      const shadowX = THREE.MathUtils.lerp(anim.from.x, anim.to.x, eased);
      const shadowZ = THREE.MathUtils.lerp(anim.from.z, anim.to.z, eased);
      this.contactShadow.position.set(shadowX, 0.015, shadowZ);
      const shadowScale = 1 + Math.sin(eased * Math.PI) * 0.18;
      this.contactShadow.scale.set(shadowScale, shadowScale, 1);

      if (rawT >= 1) {
        // Snap exact destination & apply exact 90-deg orientation quaternion
        this.cubePivot.rotation.set(0, 0, 0);
        this.cubePivot.position.set(anim.to.x, 0, anim.to.z);
        this.cubeBody.position.set(0, 0.5, 0);

        if (dz === -1) _quatA.setFromAxisAngle(_axisX, -Math.PI / 2);
        else if (dz === 1) _quatA.setFromAxisAngle(_axisX, Math.PI / 2);
        else if (dx === -1) _quatA.setFromAxisAngle(_axisZ, Math.PI / 2);
        else _quatA.setFromAxisAngle(_axisZ, -Math.PI / 2);

        this.cubeBody.quaternion.premultiply(_quatA);
        snapQuaternionToRightAngles(this.cubeBody.quaternion);

        this.contactShadow.position.set(anim.to.x, 0.015, anim.to.z);
        this.contactShadow.scale.set(1, 1, 1);

        // Tile landing bounce & audio hook
        const landedVisual = this.tileVisuals.get(coordKey(anim.to.x, anim.to.z));
        if (landedVisual) {
          landedVisual.bounceVelocity = -1.6;
        }
        this.onLandCallback?.();

        // Trigger event particles
        for (const ev of anim.result.events) {
          if (ev.type === 'switch_activated' || ev.type === 'switch_toggled') {
            this.spawnParticles(anim.to.x, 0.15, anim.to.z, '#fbbf24', 14, 3.0);
          } else if (ev.type === 'won') {
            this.spawnParticles(anim.result.nextState.cubePos.x, 0.6, anim.result.nextState.cubePos.z, '#34d399', 26, 4.2);
          } else if (ev.type === 'failed') {
            this.shakeIntensity = 0.22;
            this.spawnParticles(anim.to.x, 0.35, anim.to.z, '#fb7185', 18, 3.4);
          }
        }

        // Sync switches/bridges/crumbles/moving platforms right after landing
        this.syncVisualState(anim.result.nextState, false);

        // Chain into teleport or moving-platform carry if applicable
        if (anim.result.teleportedFrom && anim.result.teleportedTo) {
          this.spawnParticles(
            anim.result.teleportedFrom.x,
            0.35,
            anim.result.teleportedFrom.z,
            '#c084fc',
            14,
            3.2
          );
          this.activeAnim = {
            kind: 'teleport',
            elapsed: 0,
            duration: TELEPORT_DURATION,
            from: anim.result.teleportedFrom,
            to: anim.result.teleportedTo,
            result: anim.result,
          };
          return;
        }

        if (anim.result.carriedByPlatform) {
          this.activeAnim = {
            kind: 'carry',
            elapsed: 0,
            duration: CARRY_DURATION,
            from: anim.result.carriedByPlatform.from,
            to: anim.result.carriedByPlatform.to,
            result: anim.result,
          };
          return;
        }

        const doneResult = anim.result;
        const cb = this.onAnimComplete;
        this.activeAnim = null;
        this.onAnimComplete = null;
        cb?.(doneResult);
      }
      return;
    }

    if (anim.kind === 'teleport') {
      if (rawT < 0.5) {
        const shrink = 1 - rawT * 2;
        this.cubePivot.scale.set(shrink, 1 + (1 - shrink) * 0.8, shrink);
        this.cubePivot.position.set(anim.from.x, (1 - shrink) * 0.45, anim.from.z);
      } else {
        const grow = (rawT - 0.5) * 2;
        this.cubePivot.scale.set(grow, 1 + (1 - grow) * 0.8, grow);
        this.cubePivot.position.set(anim.to.x, (1 - grow) * 0.45, anim.to.z);
        this.contactShadow.position.set(anim.to.x, 0.015, anim.to.z);
      }

      if (rawT >= 1) {
        this.cubePivot.scale.set(1, 1, 1);
        this.cubePivot.position.set(anim.to.x, 0, anim.to.z);
        this.spawnParticles(anim.to.x, 0.35, anim.to.z, '#c084fc', 14, 3.2);

        const doneResult = anim.result;
        const cb = this.onAnimComplete;
        this.activeAnim = null;
        this.onAnimComplete = null;
        cb?.(doneResult);
      }
      return;
    }

    if (anim.kind === 'carry') {
      const eased = 1 - Math.pow(1 - rawT, 2);
      const cx = THREE.MathUtils.lerp(anim.from.x, anim.to.x, eased);
      const cz = THREE.MathUtils.lerp(anim.from.z, anim.to.z, eased);
      this.cubePivot.position.set(cx, 0, cz);
      this.contactShadow.position.set(cx, 0.015, cz);

      if (rawT >= 1) {
        this.cubePivot.position.set(anim.to.x, 0, anim.to.z);
        const doneResult = anim.result;
        const cb = this.onAnimComplete;
        this.activeAnim = null;
        this.onAnimComplete = null;
        cb?.(doneResult);
      }
      return;
    }

    if (anim.kind === 'wait') {
      if (rawT >= 1) {
        const doneResult = anim.result;
        const cb = this.onAnimComplete;
        this.activeAnim = null;
        this.onAnimComplete = null;
        cb?.(doneResult);
      }
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleCanvasLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleCanvasRestored);

    this.clearLevelMeshes();
    this.textures.dispose();
    this.envTexture.dispose();

    for (const d of this.disposables) {
      d.dispose();
    }

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
