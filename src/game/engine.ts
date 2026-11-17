import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SoundEngine } from './audio';
import { BotEntity, createSoldierModel, getBotConfig, pickBotClassForWave } from './bots';
import { buildMapEnvironment, ExplosiveBarrel, MapBuildResult } from './map';
import { createProceduralTextures, ProceduralTextureSet } from './textures';
import { buildAllWeapons, WeaponRig } from './weapons';
import { MultiplayerClient, ServerMessage } from './net';
import {
  BOT_TYPES,
  BotClass,
  ChatMessage,
  DamageIndicator,
  DIFFICULTIES,
  GameSettings,
  HudState,
  KillFeedEntry,
  MAPS,
  MapId,
  MatchConfig,
  MultiplayerMode,
  NetBotState,
  OPERATORS,
  OperatorId,
  RemotePlayerNetState,
  RoomSummary,
  TeamId,
  WEAPONS,
  WeaponAmmoState,
  WeaponId,
} from './types';

// Reusable scratch math objects (zero GC in loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

interface ParticleItem {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  gravity: number;
  life: number;
  maxLife: number;
  grow?: number;
}

interface TracerItem {
  line: THREE.Line;
  life: number;
  maxLife: number;
}

interface ShellItem {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
  bounced: boolean;
}

interface GrenadeItem {
  mesh: THREE.Group;
  vel: THREE.Vector3;
  fuse: number;
  remote?: boolean;
}

interface SupplyPickup {
  kind: 'medkit' | 'ammo';
  position: THREE.Vector3;
  mesh: THREE.Group;
  active: boolean;
  cooldown: number;
}

interface RemotePlayerVisual {
  id: string;
  state: RemotePlayerNetState;
  group: THREE.Group;
  hitParts: THREE.Mesh[];
  pivots: BotEntity['pivots'];
  muzzlePoint: THREE.Object3D;
  muzzleFlash: THREE.Mesh;
  labelSprite: THREE.Sprite;
  targetPos: THREE.Vector3;
  targetYaw: number;
  walkPhase: number;
  flashTimer: number;
}

interface NetBotVisual {
  id: number;
  state: NetBotState;
  model: THREE.Group;
  hitParts: THREE.Mesh[];
  pivots: BotEntity['pivots'];
  muzzlePoint: THREE.Object3D;
  muzzleFlash: THREE.Mesh;
  targetPos: THREE.Vector3;
  targetYaw: number;
  walkPhase: number;
  flashTimer: number;
}

export class FpsGameEngine {
  private container: HTMLElement;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private onHudUpdate: (hud: HudState) => void;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private isSoftwareGl = false;
  private frameId = 0;
  private disposed = false;

  private textures!: ProceduralTextureSet;
  private mapRoot = new THREE.Group();
  private mapData!: MapBuildResult;
  private weaponRigs!: Record<WeaponId, WeaponRig>;
  private weaponMount = new THREE.Group();
  private audio = new SoundEngine();

  // Scene atmosphere refs
  private skyMat!: THREE.ShaderMaterial;
  private hemiLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private flashlight!: THREE.SpotLight;
  private flashlightTarget = new THREE.Object3D();
  private flashlightOn = false;

  // Ambient weather particles (snow / dust)
  private weatherPoints: THREE.Points | null = null;
  private weatherVelY = -1.2;

  private settings: GameSettings = {
    sensitivity: 0.0021,
    fov: 75,
    volume: 0.72,
  };

  private matchConfig: MatchConfig = {
    mapId: 'canyon',
    operatorId: 'assault',
    difficulty: 'soldier',
    botCount: 8,
    mode: 'waves',
    startingWeapon: 'rifle',
  };

  // Game phase & wave state
  private phase: HudState['phase'] = 'start';
  private pointerLocked = false;
  private wave = 1;
  private wavePendingSpawn = 0;
  private waveSpawnTimer = 0;
  private waveTransitionTimer = 0;
  private bannerText: string | null = null;
  private bannerTimer = 0;
  private pickupToast: string | null = null;
  private pickupToastTimer = 0;

  // Player state
  private playerVel = new THREE.Vector3();
  private onGround = true;
  private hp = 100;
  private maxHp = 100;
  private armor = 75;
  private maxArmor = 100;
  private stamina = 100;
  private breathMeter = 100;
  private holdingBreath = false;
  private crouching = false;
  private eyeHeight = 1.72;
  private landingDip = 0;
  private stepTimer = 0;

  // Look & recoil
  private yaw = 0;
  private pitch = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;
  private swayX = 0;
  private swayY = 0;
  private shakeTime = 0;
  private shakeAmp = 0;
  private damageFlash = 0;
  private damageIndicators: Array<DamageIndicator & { worldSource: THREE.Vector3; timer: number }> = [];

  // Weapons & inventory
  private currentWeapon: WeaponId = 'rifle';
  private ammoByWeapon!: Record<WeaponId, WeaponAmmoState>;
  private grenades = 3;
  private reloading = false;
  private reloadTimer = 0;
  private reloadDuration = 1.5;
  private aiming = false;
  private lastShotTime = 0;
  private slideOffset = 0;
  private pumpAnim = 0;
  private meleeAnim = 0;
  private lastMeleeTime = 0;
  private muzzleFlashTimer = 0;
  private bobPhase = 0;
  private dynamicSpread = 0;
  private damageBonusLevel = 0;

  // Stats
  private score = 0;
  private kills = 0;
  private headshots = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private damageDealt = 0;
  private cash = 150;
  private killfeed: KillFeedEntry[] = [];
  private nextId = 1;
  private hitmarkerType: HudState['hitmarkerType'] = 'none';
  private hitmarkerTimer = 0;

  // Entities & pools
  private bots: BotEntity[] = [];
  private particles: ParticleItem[] = [];
  private tracers: TracerItem[] = [];
  private shells: ShellItem[] = [];
  private activeGrenades: GrenadeItem[] = [];
  private pickups: SupplyPickup[] = [];
  private decals: THREE.Mesh[] = [];
  private explosionLights: Array<{ light: THREE.PointLight; life: number }> = [];

  // Input state
  private keys: Record<string, boolean> = {};
  private mouseDown = false;
  private hudEmitAccum = 0;
  private lastPointerUnlockTime = 0;

  // Multiplayer state
  private net: MultiplayerClient;
  private isMultiplayer = false;
  private mpConnected = false;
  private mpSelfId: string | null = null;
  private mpRoom: RoomSummary | null = null;
  private mpTeam: TeamId = 'ffa';
  private mpPlayers: RemotePlayerNetState[] = [];
  private mpRespawnTimer = 0;
  private mpChat: ChatMessage[] = [];
  private remoteVisuals = new Map<string, RemotePlayerVisual>();
  private netBotVisuals = new Map<number, NetBotVisual>();
  private netSendAccum = 0;
  private chatTyping = false;
  private onRoomsUpdateCb: ((rooms: RoomSummary[]) => void) | null = null;
  private onNetErrorCb: ((msg: string) => void) | null = null;

  private shellGeo = new THREE.CylinderGeometry(0.008, 0.009, 0.036, 8);
  private shellMat = new THREE.MeshStandardMaterial({ color: 0xd4a638, metalness: 0.94, roughness: 0.22 });
  private decalGeo = new THREE.PlaneGeometry(0.14, 0.14);
  private decalMat = new THREE.MeshBasicMaterial({
    color: 0x161412,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  constructor(container: HTMLElement, onHudUpdate: (hud: HudState) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.net = new MultiplayerClient(
      (msg) => this.handleServerMessage(msg),
      (connected) => {
        this.mpConnected = connected;
        if (connected) {
          this.net.send({ type: 'room:list' });
        }
        this.emitHud();
      }
    );
    this.resetAmmoState();
    this.initScene();
    this.bindEvents();
    this.emitHud();
    this.startLoop();
  }

  public setMultiplayerCallbacks(
    onRoomsUpdate: (rooms: RoomSummary[]) => void,
    onNetError: (msg: string) => void
  ) {
    this.onRoomsUpdateCb = onRoomsUpdate;
    this.onNetErrorCb = onNetError;
  }

  public connectMultiplayer(serverUrl?: string) {
    this.net.connect(serverUrl);
    if (this.net.isConnected()) {
      this.net.send({ type: 'room:list' });
    }
  }

  public refreshRooms(serverUrl?: string) {
    if (!this.net.isConnected()) {
      this.net.connect(serverUrl);
    } else {
      this.net.send({ type: 'room:list' });
    }
  }

  public createMultiplayerRoom(opts: {
    roomName: string;
    mapId: MapId;
    mode: MultiplayerMode;
    maxPlayers: number;
    botCount: number;
    playerName: string;
    operatorId: OperatorId;
    serverUrl?: string;
  }) {
    this.audio.init();
    this.matchConfig = {
      ...this.matchConfig,
      mapId: opts.mapId,
      operatorId: opts.operatorId,
      startingWeapon: OPERATORS[opts.operatorId].preferredWeapon,
    };
    this.net.connect(opts.serverUrl);
    this.net.send({
      type: 'room:create',
      roomName: opts.roomName,
      mapId: opts.mapId,
      mode: opts.mode,
      maxPlayers: opts.maxPlayers,
      botCount: opts.botCount,
      name: opts.playerName,
      operatorId: opts.operatorId,
    });
  }

  public joinMultiplayerRoom(opts: {
    roomId: string;
    playerName: string;
    operatorId: OperatorId;
    serverUrl?: string;
  }) {
    this.audio.init();
    this.matchConfig = {
      ...this.matchConfig,
      operatorId: opts.operatorId,
      startingWeapon: OPERATORS[opts.operatorId].preferredWeapon,
    };
    this.net.connect(opts.serverUrl);
    this.net.send({
      type: 'room:join',
      roomId: opts.roomId,
      name: opts.playerName,
      operatorId: opts.operatorId,
    });
  }

  public leaveMultiplayerRoom() {
    if (this.isMultiplayer) {
      this.net.send({ type: 'room:leave' });
    }
    this.clearMultiplayerEntities();
    this.isMultiplayer = false;
    this.mpSelfId = null;
    this.mpRoom = null;
    this.mpPlayers = [];
    this.mpRespawnTimer = 0;
    this.mpChat = [];
    this.chatTyping = false;
    this.returnToLobby();
  }

  public sendChatMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !this.isMultiplayer) return;
    this.net.send({ type: 'chat:send', text: trimmed.slice(0, 140) });
  }

  public setChatTyping(typing: boolean) {
    this.chatTyping = typing;
    if (typing) {
      this.mouseDown = false;
      this.aiming = false;
      this.holdingBreath = false;
      Object.keys(this.keys).forEach((k) => {
        this.keys[k] = false;
      });
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
    } else if (this.phase === 'playing') {
      this.requestLock();
    }
  }

  public setMinimapCanvas(canvas: HTMLCanvasElement | null) {
    this.minimapCanvas = canvas;
  }

  public updateSettings(next: Partial<GameSettings>) {
    this.settings = { ...this.settings, ...next };
    this.audio.setVolume(this.settings.volume);
    if (!this.aiming && this.camera) {
      this.camera.fov = this.settings.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  public getMatchConfig(): MatchConfig {
    return { ...this.matchConfig };
  }

  public updateMatchConfig(next: Partial<MatchConfig>) {
    const prevMap = this.matchConfig.mapId;
    this.matchConfig = { ...this.matchConfig, ...next };
    if (next.mapId && next.mapId !== prevMap && this.phase === 'start') {
      this.rebuildMap(next.mapId);
    }
    this.emitHud();
  }

  private resetAmmoState() {
    this.ammoByWeapon = {
      pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserveMax },
      rifle: { mag: WEAPONS.rifle.magSize, reserve: WEAPONS.rifle.reserveMax },
      shotgun: { mag: WEAPONS.shotgun.magSize, reserve: WEAPONS.shotgun.reserveMax },
      sniper: { mag: WEAPONS.sniper.magSize, reserve: WEAPONS.sniper.reserveMax },
    };
  }

  private detectSoftwareGl(): boolean {
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  }

  private initScene() {
    this.isSoftwareGl = this.detectSoftwareGl();

    this.scene = new THREE.Scene();
    this.scene.add(this.mapRoot);

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, w / h, 0.04, 420);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 1.72, 26);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Sky Dome
    const skyGeo = new THREE.SphereGeometry(280, 32, 20);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x28568a) },
        midColor: { value: new THREE.Color(0x7ca6cc) },
        horizonColor: { value: new THREE.Color(0xd2c0a3) },
        sunDir: { value: new THREE.Vector3(0.55, 0.45, 0.4).normalize() },
        sunStrength: { value: 1.0 },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        uniform vec3 sunDir;
        uniform float sunStrength;
        varying vec3 vWorldDir;
        void main() {
          float h = clamp(vWorldDir.y, 0.0, 1.0);
          vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.28, h));
          col = mix(col, topColor, smoothstep(0.22, 0.85, h));
          float sunAmt = max(dot(normalize(vWorldDir), sunDir), 0.0);
          col += vec3(1.0, 0.88, 0.68) * pow(sunAmt, 42.0) * 0.55 * sunStrength;
          col += vec3(1.0, 0.95, 0.85) * pow(sunAmt, 360.0) * 1.4 * sunStrength;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.scene.add(new THREE.Mesh(skyGeo, this.skyMat));

    // Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(0xa4c8eb, 0x6b5a45, 0.72);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 1.85);
    this.sunLight.position.set(62, 74, 48);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 230;
    const d = 88;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight(0x88b4e6, 0.45);
    this.rimLight.position.set(-55, 32, -60);
    this.scene.add(this.rimLight);

    // Tactical Weapon Flashlight attached to camera
    this.flashlight = new THREE.SpotLight(0xfff5e0, 0, 52, Math.PI / 5.5, 0.45, 1.4);
    this.flashlight.position.set(0.18, -0.14, -0.2);
    this.flashlightTarget.position.set(0, -0.08, -12);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    // Procedural Textures & Build Initial Map
    this.textures = createProceduralTextures(this.renderer);
    this.rebuildMap(this.matchConfig.mapId);

    // Build Weapon Rigs
    this.weaponRigs = buildAllWeapons();
    Object.values(this.weaponRigs).forEach((rig) => {
      rig.group.visible = rig.id === this.currentWeapon;
      this.weaponMount.add(rig.group);
    });
    const spec = WEAPONS[this.currentWeapon];
    this.weaponMount.position.set(...spec.hipPos);
    this.camera.add(this.weaponMount);
    this.scene.add(this.camera);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private rebuildMap(mapId: MapId) {
    // Clear existing mapRoot meshes & pickups
    while (this.mapRoot.children.length > 0) {
      const child = this.mapRoot.children[0];
      this.mapRoot.remove(child);
    }
    this.pickups.forEach((p) => this.scene.remove(p.mesh));
    this.pickups.length = 0;

    if (this.weatherPoints) {
      this.scene.remove(this.weatherPoints);
      this.weatherPoints.geometry.dispose();
      (this.weatherPoints.material as THREE.Material).dispose();
      this.weatherPoints = null;
    }

    const cfg = MAPS[mapId];
    this.scene.background = new THREE.Color(cfg.fogColor);
    this.scene.fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity);

    this.skyMat.uniforms.topColor.value.setHex(cfg.skyTop);
    this.skyMat.uniforms.midColor.value.setHex(cfg.skyMid);
    this.skyMat.uniforms.horizonColor.value.setHex(cfg.skyHorizon);
    this.skyMat.uniforms.sunStrength.value = cfg.isNight ? 0.12 : cfg.hasSnow ? 0.45 : 1.0;

    this.hemiLight.color.setHex(cfg.hemiSky);
    this.hemiLight.groundColor.setHex(cfg.hemiGround);
    this.hemiLight.intensity = cfg.hemiIntensity;

    this.sunLight.color.setHex(cfg.sunColor);
    this.sunLight.intensity = cfg.sunIntensity;
    this.renderer.toneMappingExposure = cfg.isNight ? 0.95 : 1.08;

    this.mapData = buildMapEnvironment(this.mapRoot, this.textures, mapId, this.isSoftwareGl);
    this.buildSupplyPickups();
    this.buildWeatherParticles(cfg.hasSnow, cfg.isNight);

    // Auto-enable tactical flashlight in Night Port
    this.flashlightOn = cfg.isNight;
    this.flashlight.intensity = this.flashlightOn ? 34 : 0;
  }

  private buildWeatherParticles(isSnow: boolean, isNight: boolean) {
    const count = isSnow ? 900 : 320;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 140;
      positions[i * 3 + 1] = Math.random() * 28;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 140;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: isSnow ? 0xf8fafc : isNight ? 0x94a3b8 : 0xd6c7b2,
      size: isSnow ? 0.24 : 0.14,
      transparent: true,
      opacity: isSnow ? 0.8 : isNight ? 0.24 : 0.32,
      depthWrite: false,
    });
    this.weatherVelY = isSnow ? -4.2 : -0.35;
    this.weatherPoints = new THREE.Points(geo, mat);
    this.scene.add(this.weatherPoints);
  }

  private buildSupplyPickups() {
    const medMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f4, roughness: 0.45, metalness: 0.1 });
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const ammoMat = new THREE.MeshStandardMaterial({ color: 0x3f4d36, roughness: 0.55, metalness: 0.45 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4, metalness: 0.6 });

    this.mapData.supplySpawns.forEach((sp) => {
      const grp = new THREE.Group();
      grp.position.set(sp.position.x, 0.45, sp.position.z);

      if (sp.kind === 'medkit') {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.36, 0.42), medMat);
        box.castShadow = true;
        grp.add(box);
        const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.44), crossMat);
        const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.44), crossMat);
        grp.add(c1, c2);
      } else {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.36), ammoMat);
        box.castShadow = true;
        grp.add(box);
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.08, 0.38), bandMat);
        grp.add(band);
      }

      this.scene.add(grp);
      this.pickups.push({
        kind: sp.kind,
        position: sp.position.clone(),
        mesh: grp,
        active: true,
        cooldown: 0,
      });
    });
  }

  // ============ PUBLIC GAME FLOW ACTIONS ============
  public startGame(customConfig?: MatchConfig) {
    this.audio.init();
    this.clearMultiplayerEntities();
    this.isMultiplayer = false;
    this.mpSelfId = null;
    this.mpRoom = null;
    this.mpPlayers = [];
    this.mpRespawnTimer = 0;
    this.mpChat = [];
    this.chatTyping = false;

    if (customConfig) {
      const mapChanged = customConfig.mapId !== this.matchConfig.mapId;
      this.matchConfig = { ...customConfig };
      if (mapChanged) {
        this.rebuildMap(this.matchConfig.mapId);
      }
    }
    this.resetMatch();
    this.phase = 'playing';
    this.requestLock();
    this.startWave(1);
    this.emitHud();
  }

  public resumeGame() {
    if (this.phase === 'dead') return;
    this.audio.init();
    this.phase = 'playing';
    this.requestLock();
    this.emitHud();
  }

  public openArmory() {
    if (this.phase !== 'playing' && this.phase !== 'paused') return;
    this.aiming = false;
    this.holdingBreath = false;
    this.mouseDown = false;
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.phase = 'armory';
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.emitHud();
  }

  public closeArmory() {
    if (this.phase !== 'armory') return;
    this.phase = 'playing';
    this.requestLock();
    this.emitHud();
  }

  public returnToLobby() {
    if (this.isMultiplayer) {
      this.net.send({ type: 'room:leave' });
      this.clearMultiplayerEntities();
      this.isMultiplayer = false;
      this.mpSelfId = null;
      this.mpRoom = null;
      this.mpPlayers = [];
      this.mpRespawnTimer = 0;
      this.mpChat = [];
    }
    this.chatTyping = false;
    this.aiming = false;
    this.holdingBreath = false;
    this.mouseDown = false;
    this.bots.forEach((b) => this.scene.remove(b.model));
    this.bots.length = 0;
    this.phase = 'start';
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.emitHud();
  }

  public restartGame() {
    if (this.isMultiplayer) {
      this.resumeGame();
      return;
    }
    this.audio.init();
    this.resetMatch();
    this.phase = 'playing';
    this.requestLock();
    this.startWave(1);
    this.emitHud();
  }

  public buyItem(item: 'armor' | 'medkit' | 'grenades' | 'ammo' | 'damage'): boolean {
    if (this.phase === 'dead' || this.phase === 'start') return false;
    if (item === 'armor') {
      if (this.cash < 150 || this.armor >= this.maxArmor) return false;
      this.cash -= 150;
      this.armor = Math.min(this.maxArmor, this.armor + 50);
    } else if (item === 'medkit') {
      if (this.cash < 100 || this.hp >= this.maxHp) return false;
      this.cash -= 100;
      this.hp = Math.min(this.maxHp, this.hp + 60);
    } else if (item === 'grenades') {
      if (this.cash < 120 || this.grenades >= 6) return false;
      this.cash -= 120;
      this.grenades = Math.min(6, this.grenades + 2);
    } else if (item === 'ammo') {
      if (this.cash < 110) return false;
      this.cash -= 110;
      (Object.keys(WEAPONS) as WeaponId[]).forEach((id) => {
        this.ammoByWeapon[id].mag = WEAPONS[id].magSize;
        this.ammoByWeapon[id].reserve = WEAPONS[id].reserveMax;
      });
    } else if (item === 'damage') {
      const costs = [250, 400, 600];
      if (this.damageBonusLevel >= 3) return false;
      const cost = costs[this.damageBonusLevel];
      if (this.cash < cost) return false;
      this.cash -= cost;
      this.damageBonusLevel++;
    }
    this.audio.playPickup();
    this.emitHud();
    return true;
  }

  public requestLock() {
    if (this.disposed) return;
    const el = this.renderer.domElement;
    if (document.pointerLockElement === el) return;
    // Browsers enforce a ~1.25s cooldown right after ESC exits pointer lock
    if (performance.now() - this.lastPointerUnlockTime < 1300) {
      return;
    }
    try {
      const maybePromise = el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {
          // Ignore browser pointer lock cooldown or focus rejection
        });
      }
    } catch {
      // Ignore if blocked synchronously
    }
  }

  private resetMatch() {
    this.bots.forEach((b) => this.scene.remove(b.model));
    this.bots.length = 0;

    this.activeGrenades.forEach((g) => this.scene.remove(g.mesh));
    this.activeGrenades.length = 0;
    this.decals.forEach((d) => this.scene.remove(d));
    this.decals.length = 0;

    this.mapData.barrels.forEach((b) => {
      b.exploded = false;
      b.hp = 40;
      b.group.visible = true;
    });

    this.pickups.forEach((p) => {
      p.active = true;
      p.cooldown = 0;
      p.mesh.visible = true;
    });

    const op = OPERATORS[this.matchConfig.operatorId];
    this.maxHp = op.maxHp;
    this.hp = op.maxHp;
    this.maxArmor = op.maxArmor;
    this.armor = op.startArmor;
    this.stamina = 100;
    this.breathMeter = 100;
    this.holdingBreath = false;
    this.grenades = op.startGrenades;

    // Apply operator sleeve color to all 4 weapon viewmodels
    Object.values(this.weaponRigs).forEach((rig) => {
      rig.sleeveMeshes.forEach((m) => {
        (m.material as THREE.MeshStandardMaterial).color.setHex(op.sleeveColor);
      });
    });

    this.score = 0;
    this.kills = 0;
    this.headshots = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.damageDealt = 0;
    this.cash = 150;
    this.damageBonusLevel = 0;
    this.wave = 1;
    this.killfeed = [];
    this.damageIndicators = [];
    this.damageFlash = 0;
    this.reloading = false;
    this.aiming = false;
    this.crouching = false;
    this.eyeHeight = 1.72;

    this.resetAmmoState();
    this.switchWeapon(this.matchConfig.startingWeapon, true);

    this.camera.position.set(0, 1.72, 26);
    this.playerVel.set(0, 0, 0);
    this.onGround = true;
    this.yaw = 0;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.camera.rotation.set(0, 0, 0);
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();

    const mapCfg = MAPS[this.matchConfig.mapId];
    this.flashlightOn = mapCfg.isNight;
    this.flashlight.intensity = this.flashlightOn ? 34 : 0;
  }

  private startWave(waveNum: number) {
    this.wave = waveNum;
    if (this.matchConfig.mode === 'skirmish') {
      this.wavePendingSpawn = this.matchConfig.botCount;
      this.waveSpawnTimer = 0.1;
      this.waveTransitionTimer = 0;
      this.showBanner(`SERBEST ÇATIŞMA · ${this.matchConfig.botCount} BOT AKTİF`);
    } else {
      const totalBots = this.matchConfig.botCount + (waveNum - 1) * 2;
      this.wavePendingSpawn = totalBots;
      this.waveSpawnTimer = 0.15;
      this.waveTransitionTimer = 0;
      this.showBanner(`DALGA ${waveNum} BAŞLADI · ${totalBots} DÜŞMAN`);
    }
    this.audio.playWaveStart();
  }

  private showBanner(text: string, duration = 2.6) {
    this.bannerText = text;
    this.bannerTimer = duration;
  }

  private showPickupToast(text: string) {
    this.pickupToast = text;
    this.pickupToastTimer = 2.0;
  }

  // ============ INPUT & EVENTS ============
  private onPointerLockError = () => {
    // Prevent unhandled pointer lock errors when browser enforces unlock cooldown
  };

  private onPointerLockChange = () => {
    const locked = document.pointerLockElement === this.renderer.domElement;
    this.pointerLocked = locked;
    if (!locked) {
      this.lastPointerUnlockTime = performance.now();
      this.mouseDown = false;
      if (this.aiming) {
        this.aiming = false;
        this.holdingBreath = false;
        this.camera.fov = this.settings.fov;
        this.camera.updateProjectionMatrix();
      }
      if (this.phase === 'playing' && !this.chatTyping) {
        this.phase = 'paused';
      }
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
    }
    this.emitHud();
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.phase !== 'playing' || !this.pointerLocked || this.mpRespawnTimer > 0) return;
    const zoomFactor = this.aiming ? (this.currentWeapon === 'sniper' ? 0.28 : 0.65) : 1;
    const sens = this.settings.sensitivity * zoomFactor;
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;

    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    this.pitch = Math.max(-Math.PI / 2 + 0.06, Math.min(Math.PI / 2 - 0.06, this.pitch));

    this.swayX = THREE.MathUtils.clamp(this.swayX - dx * 0.00028, -0.045, 0.045);
    this.swayY = THREE.MathUtils.clamp(this.swayY + dy * 0.00028, -0.045, 0.045);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.phase !== 'playing' || this.chatTyping) return;
    if (!this.pointerLocked) {
      this.requestLock();
      return;
    }
    if (this.mpRespawnTimer > 0) return;
    if (e.button === 0) {
      this.mouseDown = true;
      this.tryShoot();
    } else if (e.button === 2) {
      this.aiming = true;
      this.emitHud();
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
    else if (e.button === 2) {
      this.aiming = false;
      this.holdingBreath = false;
      this.emitHud();
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.chatTyping) return;
    this.keys[e.code] = true;

    if (e.code === 'KeyB' && (this.phase === 'playing' || this.phase === 'paused' || this.phase === 'armory')) {
      if (this.phase === 'armory') this.closeArmory();
      else this.openArmory();
      return;
    }

    if (this.phase !== 'playing' || this.mpRespawnTimer > 0) return;

    if (e.code === 'KeyR') this.startReload();
    if (e.code === 'Digit1') this.switchWeapon('pistol');
    if (e.code === 'Digit2') this.switchWeapon('rifle');
    if (e.code === 'Digit3') this.switchWeapon('shotgun');
    if (e.code === 'Digit4') this.switchWeapon('sniper');
    if (e.code === 'KeyG') this.throwGrenade();
    if (e.code === 'KeyE') this.tryMelee();
    if (e.code === 'KeyF' && !e.repeat) {
      this.flashlightOn = !this.flashlightOn;
      this.flashlight.intensity = this.flashlightOn ? 34 : 0;
      this.audio.playFlashlightClick();
      this.emitHud();
    }
    if ((e.code === 'KeyC' || e.code === 'ControlLeft') && !e.repeat) {
      this.crouching = !this.crouching;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  };

  private onContextRestored = () => {
    this.startLoop();
  };

  private bindEvents() {
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  // ============ WEAPONS, MELEE & SHOOTING ============
  public switchWeapon(id: WeaponId, silent = false) {
    if (this.currentWeapon === id && !silent) return;
    this.currentWeapon = id;
    this.reloading = false;
    this.reloadTimer = 0;
    this.slideOffset = 0;
    this.pumpAnim = 0;
    this.holdingBreath = false;
    Object.values(this.weaponRigs).forEach((rig) => {
      rig.group.visible = rig.id === id;
    });
    if (!silent) this.audio.playReload(id);
    this.emitHud();
  }

  private startReload() {
    if (this.reloading) return;
    const spec = WEAPONS[this.currentWeapon];
    const ammo = this.ammoByWeapon[this.currentWeapon];
    if (ammo.mag >= spec.magSize || ammo.reserve <= 0) return;

    const op = OPERATORS[this.matchConfig.operatorId];
    this.reloading = true;
    this.reloadTimer = 0;
    this.reloadDuration = (spec.reloadMs / 1000) * op.reloadMult;
    this.aiming = false;
    this.holdingBreath = false;
    this.audio.playReload(this.currentWeapon);
    this.emitHud();
  }

  private finishReload() {
    const spec = WEAPONS[this.currentWeapon];
    const ammo = this.ammoByWeapon[this.currentWeapon];
    const need = spec.magSize - ammo.mag;
    const take = Math.min(need, ammo.reserve);
    ammo.mag += take;
    ammo.reserve -= take;
    this.reloading = false;
    this.reloadTimer = 0;
    this.emitHud();
  }

  private tryMelee() {
    if (this.phase !== 'playing' || this.reloading || this.mpRespawnTimer > 0) return;
    const now = performance.now();
    if (now - this.lastMeleeTime < 550) return;
    this.lastMeleeTime = now;
    this.meleeAnim = 1;
    this.audio.playMeleeSwing();

    this.camera.getWorldDirection(_dir);

    if (this.isMultiplayer) {
      let bestTargetId: string | null = null;
      let bestBotId: number | null = null;
      let bestDist = 2.85;
      let hitPos = new THREE.Vector3();

      for (const rv of this.remoteVisuals.values()) {
        if (!rv.state.alive) continue;
        if (this.mpRoom?.mode === 'coop') continue;
        if (this.mpRoom?.mode === 'tdm' && rv.state.team === this.mpTeam) continue;
        _v1.copy(rv.group.position).add(new THREE.Vector3(0, 1.2, 0)).sub(this.camera.position);
        const dist = _v1.length();
        if (dist < bestDist) {
          _v1.divideScalar(dist);
          if (_v1.dot(_dir) > 0.55) {
            bestDist = dist;
            bestTargetId = rv.id;
            bestBotId = null;
            hitPos = rv.group.position.clone().add(new THREE.Vector3(0, 1.25, 0));
          }
        }
      }

      for (const nb of this.netBotVisuals.values()) {
        if (!nb.state.alive) continue;
        _v1.copy(nb.model.position).add(new THREE.Vector3(0, 1.2, 0)).sub(this.camera.position);
        const dist = _v1.length();
        if (dist < bestDist) {
          _v1.divideScalar(dist);
          if (_v1.dot(_dir) > 0.55) {
            bestDist = dist;
            bestTargetId = null;
            bestBotId = nb.id;
            hitPos = nb.model.position.clone().add(new THREE.Vector3(0, 1.25, 0));
          }
        }
      }

      if (bestTargetId) {
        this.audio.playMeleeHit();
        this.spawnBloodParticles(hitPos);
        this.shakeTime = 0.12;
        this.shakeAmp = 0.03;
        this.net.send({ type: 'melee:hit', targetId: bestTargetId });
      } else if (bestBotId !== null) {
        this.audio.playMeleeHit();
        this.spawnBloodParticles(hitPos);
        this.shakeTime = 0.12;
        this.shakeAmp = 0.03;
        this.net.send({ type: 'bot:hit', botId: bestBotId, weapon: 'shotgun', hitZone: 'head' });
      }
      return;
    }

    let closestBot: BotEntity | null = null;
    let closestDist = 2.75;

    for (const bot of this.bots) {
      if (!bot.alive) continue;
      _v1.copy(bot.model.position).add(new THREE.Vector3(0, 1.2, 0)).sub(this.camera.position);
      const dist = _v1.length();
      if (dist < closestDist) {
        _v1.divideScalar(dist);
        if (_v1.dot(_dir) > 0.55) {
          closestDist = dist;
          closestBot = bot;
        }
      }
    }

    if (closestBot) {
      closestBot.hp -= 80;
      this.damageDealt += 80;
      this.audio.playMeleeHit();
      this.spawnBloodParticles(
        closestBot.model.position.clone().add(new THREE.Vector3(0, 1.25, 0))
      );
      this.shakeTime = 0.12;
      this.shakeAmp = 0.03;

      if (closestBot.hp <= 0) {
        this.hitmarkerType = 'kill';
        this.hitmarkerTimer = 0.22;
        this.handleBotKilled(closestBot, false, false, true, _dir);
      } else {
        this.hitmarkerType = 'body';
        this.hitmarkerTimer = 0.14;
        const push = _dir.clone().setY(0).normalize().multiplyScalar(1.4);
        const testPos = closestBot.model.position.clone().add(push);
        if (!this.collidesWithCompound(new THREE.Vector3(testPos.x, 1.4, testPos.z), 0.52, 1.4)) {
          closestBot.model.position.copy(testPos);
        }
      }
      this.emitHud();
    }
  }

  private tryShoot() {
    if (this.phase !== 'playing' || this.reloading || this.mpRespawnTimer > 0) return;
    const spec = WEAPONS[this.currentWeapon];
    const ammo = this.ammoByWeapon[this.currentWeapon];
    const now = performance.now();
    if (now - this.lastShotTime < spec.fireRateMs) return;

    if (ammo.mag <= 0) {
      this.lastShotTime = now;
      this.audio.playDryFire();
      this.startReload();
      return;
    }

    this.lastShotTime = now;
    ammo.mag--;
    this.shotsFired++;
    this.audio.playShot(this.currentWeapon, 1);

    const rig = this.weaponRigs[this.currentWeapon];
    this.slideOffset = this.currentWeapon === 'pistol' ? 0.04 : 0.055;
    if (this.currentWeapon === 'shotgun') {
      this.pumpAnim = 1;
    }
    rig.muzzleFlashMesh.visible = true;
    rig.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
    rig.muzzleLight.intensity = 4.5;
    this.muzzleFlashTimer = 0.045;

    const crouchMult = this.crouching ? 0.72 : 1;
    const adsMult = this.aiming ? 0.62 : 1;
    this.recoilPitch += spec.recoilPitch * crouchMult * adsMult;
    this.recoilYaw += (Math.random() - 0.5) * spec.recoilYaw * crouchMult * adsMult;
    this.dynamicSpread = Math.min(0.06, this.dynamicSpread + 0.008);
    this.shakeTime = 0.1;
    this.shakeAmp = this.currentWeapon === 'sniper' ? 0.045 : this.currentWeapon === 'shotgun' ? 0.035 : 0.015;

    rig.ejectPoint.getWorldPosition(_v1);
    this.spawnShellCasing(_v1);

    const muzzleWorld = new THREE.Vector3();
    rig.muzzlePoint.getWorldPosition(muzzleWorld);

    const raycaster = new THREE.Raycaster();
    const baseSpread = this.aiming ? spec.adsSpread : spec.hipSpread;
    const moveSpread = this.playerVel.lengthSq() > 1 ? 0.008 : 0;
    const totalSpread = (baseSpread + moveSpread + this.dynamicSpread * 0.35) * crouchMult;

    const targets: THREE.Object3D[] = [...this.mapData.raycastWallMeshes];
    if (this.isMultiplayer) {
      for (const rv of this.remoteVisuals.values()) {
        if (!rv.state.alive) continue;
        if (this.mpRoom?.mode === 'coop') continue;
        if (this.mpRoom?.mode === 'tdm' && rv.state.team === this.mpTeam) continue;
        for (const pt of rv.hitParts) targets.push(pt);
      }
      for (const nb of this.netBotVisuals.values()) {
        if (nb.state.alive) {
          for (const pt of nb.hitParts) targets.push(pt);
        }
      }
    } else {
      for (const bot of this.bots) {
        if (bot.alive) {
          for (const pt of bot.hitParts) targets.push(pt);
        }
      }
    }

    const op = OPERATORS[this.matchConfig.operatorId];
    const pellets = spec.pellets || 1;
    const dmgMultiplier = 1 + this.damageBonusLevel * 0.15;
    let bestHitFeedback: HudState['hitmarkerType'] = 'none';
    let anyBotHit = false;
    let lastEndPoint = muzzleWorld.clone().add(new THREE.Vector3(0, 0, -40));

    for (let p = 0; p < pellets; p++) {
      _dir
        .set(
          (Math.random() - 0.5) * totalSpread * 2,
          (Math.random() - 0.5) * totalSpread * 2,
          -1
        )
        .normalize()
        .applyQuaternion(this.camera.quaternion);

      raycaster.set(this.camera.position, _dir);
      raycaster.far = 220;
      const hits = raycaster.intersectObjects(targets, false);

      const endPoint = hits.length > 0 ? hits[0].point : _v2.copy(this.camera.position).addScaledVector(_dir, 140);
      lastEndPoint = endPoint.clone();
      this.spawnTracer(muzzleWorld, endPoint, spec.tracerColor);

      if (hits.length > 0) {
        const hit = hits[0];
        const obj = hit.object;

        if (this.isMultiplayer && typeof obj.userData.remotePlayerId === 'string') {
          anyBotHit = true;
          const zone = (obj.userData.hitZone as 'head' | 'torso' | 'limb') || 'torso';
          this.spawnBloodParticles(hit.point);
          this.net.send({
            type: 'shot:hit',
            targetId: obj.userData.remotePlayerId,
            weapon: this.currentWeapon,
            hitZone: zone,
            damageBonusLevel: this.damageBonusLevel,
          });
        } else if (this.isMultiplayer && typeof obj.userData.netBotId === 'number') {
          anyBotHit = true;
          const zone = (obj.userData.hitZone as 'head' | 'torso' | 'limb') || 'torso';
          this.spawnBloodParticles(hit.point);
          this.net.send({
            type: 'bot:hit',
            botId: obj.userData.netBotId,
            weapon: this.currentWeapon,
            hitZone: zone,
          });
        } else if (typeof obj.userData.botId === 'number') {
          const bot = this.bots.find((b) => b.id === obj.userData.botId && b.alive);
          if (bot) {
            anyBotHit = true;
            const zone = obj.userData.hitZone as 'head' | 'torso' | 'limb';
            const zoneMult = zone === 'head' ? 2.5 * op.headshotMult : zone === 'limb' ? 0.75 : 1.0;
            const dmg = spec.damage * zoneMult * dmgMultiplier;
            bot.hp -= dmg;
            this.damageDealt += Math.round(dmg);
            bot.alertTimer = 5.5;

            this.spawnBloodParticles(hit.point);
            const killed = bot.hp <= 0;
            const isHead = zone === 'head';

            if (killed) {
              bestHitFeedback = 'kill';
              this.handleBotKilled(bot, isHead, false, false, _dir);
            } else if (isHead && bestHitFeedback !== 'kill') {
              bestHitFeedback = 'head';
            } else if (bestHitFeedback === 'none') {
              bestHitFeedback = 'body';
            }
          }
        } else if (typeof obj.userData.barrelId === 'number') {
          const barrel = this.mapData.barrels[obj.userData.barrelId];
          if (barrel && !barrel.exploded) {
            this.spawnSparks(hit.point, 0xffaa33);
            if (this.isMultiplayer) {
              this.net.send({
                type: 'barrel:damage',
                barrelId: obj.userData.barrelId,
                damage: spec.damage * dmgMultiplier,
              });
            } else {
              barrel.hp -= spec.damage * dmgMultiplier;
              if (barrel.hp <= 0) {
                this.detonateBarrel(barrel);
              }
            }
          }
        } else {
          const matKind = (obj.userData.materialKind as string) || 'concrete';
          if (matKind === 'metal') {
            this.spawnSparks(hit.point, 0xffcc55);
          } else {
            this.spawnConcreteDust(hit.point, matKind === 'wood' ? 0xa3825c : 0xa8a29e);
          }
          if (hit.face) {
            this.spawnBulletDecal(hit.point, hit.face.normal, obj);
          }
        }
      }
    }

    if (this.isMultiplayer) {
      this.net.send({
        type: 'player:shoot',
        weapon: this.currentWeapon,
        start: [muzzleWorld.x, muzzleWorld.y, muzzleWorld.z],
        end: [lastEndPoint.x, lastEndPoint.y, lastEndPoint.z],
      });
    }

    if (anyBotHit) {
      this.shotsHit++;
    }

    if (!this.isMultiplayer && bestHitFeedback !== 'none') {
      const isHead = bestHitFeedback === 'head' || bestHitFeedback === 'kill';
      this.audio.playHit(bestHitFeedback === 'head');
      this.hitmarkerType = bestHitFeedback;
      this.hitmarkerTimer = isHead ? 0.2 : 0.13;
    }

    if (ammo.mag === 0 && ammo.reserve > 0) {
      setTimeout(() => {
        if (this.phase === 'playing' && !this.reloading) this.startReload();
      }, 180);
    }
    this.emitHud();
  }

  private handleBotKilled(
    bot: BotEntity,
    headshot: boolean,
    explosive: boolean,
    melee: boolean,
    hitDir: THREE.Vector3
  ) {
    if (!bot.alive) return;
    bot.alive = false;
    bot.dying = true;
    bot.deathTimer = 0;
    bot.deathTiltDir.copy(hitDir).setY(0).normalize();
    if (bot.sniperLaser) bot.sniperLaser.visible = false;
    bot.muzzleFlash.visible = false;

    this.kills++;
    if (headshot) this.headshots++;
    const bonus = headshot ? 50 : melee ? 40 : 0;
    this.cash += bot.cfg.cashReward + bonus;
    this.score += bot.cfg.scoreReward + bonus;
    this.audio.playKill(headshot);

    this.killfeed.unshift({
      id: this.nextId++,
      killer: 'Sen',
      victim: bot.cfg.label,
      headshot,
      explosive,
      melee,
      timestamp: performance.now(),
    });
    if (this.killfeed.length > 5) this.killfeed.pop();

    // In Skirmish mode, queue an immediate reinforcement
    if (this.matchConfig.mode === 'skirmish') {
      this.wavePendingSpawn++;
      this.waveSpawnTimer = 1.6;
    }
  }

  // ============ GRENADES & EXPLOSIONS ============
  private throwGrenade() {
    if (this.grenades <= 0 || this.phase !== 'playing' || this.mpRespawnTimer > 0) return;
    this.grenades--;

    const grp = this.createGrenadeMesh();
    this.camera.getWorldDirection(_dir);
    grp.position.copy(this.camera.position).addScaledVector(_dir, 0.65);
    grp.position.y -= 0.12;
    this.scene.add(grp);

    const vel = _dir.clone().multiplyScalar(17.5);
    vel.y += 4.2;

    this.activeGrenades.push({ mesh: grp, vel, fuse: 2.2, remote: false });
    if (this.isMultiplayer) {
      this.net.send({
        type: 'grenade:throw',
        pos: [grp.position.x, grp.position.y, grp.position.z],
        vel: [vel.x, vel.y, vel.z],
      });
    }
    this.audio.playReload('pistol');
    this.emitHud();
  }

  private createGrenadeMesh(): THREE.Group {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x3b4a34, roughness: 0.6, metalness: 0.4 })
    );
    const spoon = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.07, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xd4a638, metalness: 0.85, roughness: 0.25 })
    );
    spoon.position.y = 0.08;
    grp.add(body, spoon);
    return grp;
  }

  private detonateBarrel(barrel: ExplosiveBarrel) {
    if (barrel.exploded) return;
    barrel.exploded = true;
    barrel.group.visible = false;
    barrel.respawnTimer = 35;
    this.triggerExplosion(barrel.position, 9.5, 165, true, this.isMultiplayer);
  }

  private triggerExplosion(
    center: THREE.Vector3,
    radius: number,
    maxDmg: number,
    isBarrel: boolean,
    visualOnly = false
  ) {
    const distToPlayer = center.distanceTo(this.camera.position);
    this.audio.playExplosion(Math.max(0.25, 1 - distToPlayer / 75));

    const light = new THREE.PointLight(0xff7722, 18, 28, 1.5);
    light.position.copy(center).add(new THREE.Vector3(0, 1.2, 0));
    this.scene.add(light);
    this.explosionLights.push({ light, life: 0.28 });

    for (let i = 0; i < 28; i++) {
      const isSmoke = i > 14;
      const geo = new THREE.SphereGeometry(isSmoke ? 0.35 : 0.22, 7, 7);
      const mat = new THREE.MeshBasicMaterial({
        color: isSmoke ? 0x33302c : i % 2 === 0 ? 0xff6b1a : 0xffcc33,
        transparent: true,
        opacity: isSmoke ? 0.72 : 0.95,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(center).add(new THREE.Vector3(0, 0.4, 0));
      this.scene.add(m);
      const speed = isSmoke ? 3 + Math.random() * 5 : 6 + Math.random() * 11;
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * speed * 1.4,
        2 + Math.random() * speed,
        (Math.random() - 0.5) * speed * 1.4
      );
      this.particles.push({
        mesh: m,
        vel,
        gravity: isSmoke ? -1.2 : 12,
        life: isSmoke ? 1.4 : 0.55,
        maxLife: isSmoke ? 1.4 : 0.55,
        grow: isSmoke ? 2.2 : 0.4,
      });
    }

    if (distToPlayer < 35) {
      this.shakeTime = 0.38;
      this.shakeAmp = Math.max(0.03, 0.22 * (1 - distToPlayer / 35));
    }

    if (visualOnly) return;

    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const d = bot.model.position.distanceTo(center);
      if (d < radius) {
        const falloff = 1 - d / radius;
        const dmg = maxDmg * falloff;
        bot.hp -= dmg;
        this.damageDealt += Math.round(dmg);
        if (bot.hp <= 0) {
          const pushDir = _v1.subVectors(bot.model.position, center);
          this.handleBotKilled(bot, false, true, false, pushDir);
        }
      }
    }

    for (const other of this.mapData.barrels) {
      if (!other.exploded && other.position.distanceTo(center) < radius * 0.85) {
        setTimeout(() => {
          if (!this.disposed && !other.exploded) this.detonateBarrel(other);
        }, 120);
      }
    }

    const op = OPERATORS[this.matchConfig.operatorId];
    if (distToPlayer < radius * 0.85 && this.phase === 'playing') {
      const falloff = 1 - distToPlayer / (radius * 0.85);
      this.applyDamageToPlayer(Math.round(maxDmg * 0.55 * falloff * op.explosiveResist), center);
    }

    if (isBarrel) {
      this.hitmarkerType = 'body';
      this.hitmarkerTimer = 0.14;
    }
  }

  // ============ EFFECTS ============
  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3, colorHex: number) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.82 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.055, maxLife: 0.055 });
  }

  private spawnShellCasing(pos: THREE.Vector3) {
    const mesh = new THREE.Mesh(this.shellGeo, this.shellMat);
    mesh.position.copy(pos);
    this.scene.add(mesh);

    _right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const vel = _right
      .clone()
      .multiplyScalar(2.4 + Math.random() * 1.1)
      .addScaledVector(_forward, (Math.random() - 0.3) * 0.8);
    vel.y += 1.8 + Math.random() * 0.7;

    this.shells.push({
      mesh,
      vel,
      rotVel: new THREE.Vector3(14 + Math.random() * 10, 12 + Math.random() * 10, 8),
      life: 1.8,
      bounced: false,
    });
  }

  private spawnBulletDecal(point: THREE.Vector3, localNormal: THREE.Vector3, targetObj: THREE.Object3D) {
    const worldNormal = localNormal.clone().transformDirection(targetObj.matrixWorld);
    const decal = new THREE.Mesh(this.decalGeo, this.decalMat);
    decal.position.copy(point).addScaledVector(worldNormal, 0.015);
    decal.lookAt(_v1.copy(decal.position).add(worldNormal));
    decal.rotateZ(Math.random() * Math.PI * 2);
    this.scene.add(decal);
    this.decals.push(decal);
    if (this.decals.length > 65) {
      const old = this.decals.shift()!;
      this.scene.remove(old);
    }
  }

  private spawnConcreteDust(pos: THREE.Vector3, colorHex: number) {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 5, 5),
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.65 })
      );
      m.position.copy(pos);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 3.5, Math.random() * 2.5, (Math.random() - 0.5) * 3.5),
        gravity: 4,
        life: 0.45,
        maxLife: 0.45,
        grow: 1.2,
      });
    }
  }

  private spawnSparks(pos: THREE.Vector3, colorHex: number) {
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.03, 0.08),
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95 })
      );
      m.position.copy(pos);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 7, 1 + Math.random() * 4, (Math.random() - 0.5) * 7),
        gravity: 16,
        life: 0.32,
        maxLife: 0.32,
      });
    }
  }

  private spawnBloodParticles(pos: THREE.Vector3) {
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.042, 5, 5),
        new THREE.MeshBasicMaterial({ color: 0x8b0000, transparent: true, opacity: 0.88 })
      );
      m.position.copy(pos);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4.2, Math.random() * 3.2, (Math.random() - 0.5) * 4.2),
        gravity: 13,
        life: 0.5,
        maxLife: 0.5,
      });
    }
  }

  // ============ COLLISION HELPERS ============
  private collidesWithCompound(pos: THREE.Vector3, radius: number, height: number): boolean {
    if (Math.abs(pos.x) > 84.5 || Math.abs(pos.z) > 84.5) return true;
    for (const obs of this.mapData.obstacles) {
      const b = obs.box;
      if (
        pos.x + radius > b.min.x &&
        pos.x - radius < b.max.x &&
        pos.z + radius > b.min.z &&
        pos.z - radius < b.max.z &&
        pos.y > b.min.y - 0.1 &&
        pos.y - height < b.max.y
      ) {
        return true;
      }
    }
    return false;
  }

  private randomGroundPoint(): THREE.Vector3 {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = (Math.random() - 0.5) * 150;
      const z = (Math.random() - 0.5) * 150;
      if (Math.hypot(x - this.camera.position.x, z - this.camera.position.z) < 26) continue;
      _v1.set(x, 1.5, z);
      if (!this.collidesWithCompound(_v1, 0.7, 1.5)) {
        return new THREE.Vector3(x, 0, z);
      }
    }
    return new THREE.Vector3(45, 0, -45);
  }

  private spawnOneBot() {
    const botClass = pickBotClassForWave(this.wave);
    const diff = DIFFICULTIES[this.matchConfig.difficulty];
    const cfg = getBotConfig(botClass, this.wave, diff);
    const id = this.nextId++;
    const rig = createSoldierModel(id, cfg);

    const spawnPos = this.randomGroundPoint();
    rig.group.position.copy(spawnPos);
    this.scene.add(rig.group);

    this.bots.push({
      id,
      type: botClass,
      cfg,
      model: rig.group,
      hitParts: rig.hitParts,
      pivots: rig.pivots,
      muzzlePoint: rig.muzzlePoint,
      muzzleFlash: rig.muzzleFlash,
      sniperLaser: rig.sniperLaser,
      hp: cfg.hp,
      maxHp: cfg.hp,
      alive: true,
      dying: false,
      deathTimer: 0,
      deathTiltDir: new THREE.Vector3(0, 0, 1),
      shootCooldown: 0.7 + Math.random() * 1.1,
      burstRemaining: 0,
      burstDelay: 0,
      patrolTarget: this.randomGroundPoint(),
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeTimer: 1.5 + Math.random() * 2,
      alertTimer: 0,
      walkPhase: Math.random() * Math.PI * 2,
      flashTimer: 0,
    });
  }

  // ============ FRAME UPDATES ============
  private updatePlayer(dt: number) {
    const op = OPERATORS[this.matchConfig.operatorId];
    const targetEye = this.crouching ? 1.08 : 1.72;
    this.eyeHeight = THREE.MathUtils.damp(this.eyeHeight, targetEye, 12, dt);

    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    _v1.set(0, 0, 0);
    if (this.keys['KeyW'] || this.keys['ArrowUp']) _v1.add(_forward);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) _v1.sub(_forward);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) _v1.add(_right);
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) _v1.sub(_right);

    const moving = _v1.lengthSq() > 0.001;
    const wantsSprint =
      Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) &&
      moving &&
      !this.aiming &&
      !this.crouching;
    const sprinting = wantsSprint && this.stamina > 4;

    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - 22 * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + (moving ? 15 : 26) * dt);
    }

    // Sniper Breath Hold (Shift while scoped)
    const isSniperScoped = this.aiming && this.currentWeapon === 'sniper';
    const wantsBreathHold = isSniperScoped && Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    if (wantsBreathHold && this.breathMeter > 2) {
      this.holdingBreath = true;
      const drainRate = this.matchConfig.operatorId === 'sniper' ? 18 : 28;
      this.breathMeter = Math.max(0, this.breathMeter - drainRate * dt);
    } else {
      this.holdingBreath = false;
      this.breathMeter = Math.min(100, this.breathMeter + 22 * dt);
    }

    const baseSpeed = this.crouching ? 3.2 : sprinting ? 9.4 : this.aiming ? 4.0 : 6.0;
    const targetSpeed = baseSpeed * op.speedMult;

    if (moving) {
      _v1.normalize().multiplyScalar(targetSpeed);
      this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, _v1.x, 14, dt);
      this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, _v1.z, 14, dt);
    } else {
      this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, 0, 14, dt);
      this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, 0, 14, dt);
    }

    const pRadius = 0.45;
    const tryX = _v2.set(this.camera.position.x + this.playerVel.x * dt, this.camera.position.y, this.camera.position.z);
    if (!this.collidesWithCompound(tryX, pRadius, this.eyeHeight - 0.1)) {
      this.camera.position.x = tryX.x;
    } else {
      this.playerVel.x = 0;
    }

    const tryZ = _v2.set(this.camera.position.x, this.camera.position.y, this.camera.position.z + this.playerVel.z * dt);
    if (!this.collidesWithCompound(tryZ, pRadius, this.eyeHeight - 0.1)) {
      this.camera.position.z = tryZ.z;
    } else {
      this.playerVel.z = 0;
    }

    if (this.keys['Space'] && this.onGround) {
      this.crouching = false;
      this.playerVel.y = 8.4;
      this.onGround = false;
    }

    const prevAirborne = !this.onGround;
    this.playerVel.y -= 23.5 * dt;
    this.camera.position.y += this.playerVel.y * dt;

    if (this.camera.position.y <= this.eyeHeight) {
      if (prevAirborne && this.playerVel.y < -4) {
        this.landingDip = Math.min(0.14, Math.abs(this.playerVel.y) * 0.012);
        this.audio.playFootstep(true, false);
      }
      this.camera.position.y = this.eyeHeight;
      this.playerVel.y = 0;
      this.onGround = true;
    }

    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    if (this.onGround && horizSpeed > 1.2) {
      this.stepTimer -= dt * (horizSpeed / 4.2);
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.56;
        this.audio.playFootstep(sprinting, this.crouching);
      }
    }

    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 12, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, 12, dt);
    this.dynamicSpread = THREE.MathUtils.damp(this.dynamicSpread, 0, 9, dt);
    this.landingDip = THREE.MathUtils.damp(this.landingDip, 0, 11, dt);
    this.swayX = THREE.MathUtils.damp(this.swayX, 0, 10, dt);
    this.swayY = THREE.MathUtils.damp(this.swayY, 0, 10, dt);

    let sx = 0;
    let sy = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      sx = (Math.random() - 0.5) * this.shakeAmp;
      sy = (Math.random() - 0.5) * this.shakeAmp;
    }

    // Subtle sniper scope breathing sway when not holding breath
    let breathSwayX = 0;
    let breathSwayY = 0;
    if (isSniperScoped && !this.holdingBreath) {
      const t = performance.now() * 0.0018;
      const crouchSway = this.crouching ? 0.55 : 1.0;
      breathSwayX = Math.sin(t) * 0.0038 * crouchSway;
      breathSwayY = Math.cos(t * 1.4) * 0.0032 * crouchSway;
    }

    this.camera.rotation.y = this.yaw + this.recoilYaw + sx + breathSwayX;
    this.camera.rotation.x = THREE.MathUtils.clamp(
      this.pitch + this.recoilPitch + sy + breathSwayY - this.landingDip * 0.25,
      -Math.PI / 2 + 0.04,
      Math.PI / 2 - 0.04
    );

    const spec = WEAPONS[this.currentWeapon];
    const targetFov = this.aiming ? spec.adsFov : sprinting ? this.settings.fov + 4 : this.settings.fov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 15, dt);
      this.camera.updateProjectionMatrix();
    }

    if (this.mouseDown && spec.auto && this.pointerLocked && !this.reloading) {
      this.tryShoot();
    }

    this.updateWeaponKinematics(dt, horizSpeed, sprinting);

    // Supply Pickups
    this.pickups.forEach((p) => {
      if (!p.active) {
        p.cooldown -= dt;
        if (p.cooldown <= 0) {
          p.active = true;
          p.mesh.visible = true;
        }
        return;
      }
      p.mesh.rotation.y += dt * 1.6;
      p.mesh.position.y = 0.45 + Math.sin(performance.now() * 0.003) * 0.08;

      const d = Math.hypot(this.camera.position.x - p.position.x, this.camera.position.z - p.position.z);
      if (d < 1.8) {
        if (p.kind === 'medkit' && this.hp < this.maxHp) {
          this.hp = Math.min(this.maxHp, this.hp + 35);
          p.active = false;
          p.cooldown = 20;
          p.mesh.visible = false;
          this.audio.playPickup();
          this.showPickupToast('+35 CAN İLK YARDIM');
        } else if (p.kind === 'ammo') {
          let refilled = false;
          (Object.keys(WEAPONS) as WeaponId[]).forEach((id) => {
            const w = WEAPONS[id];
            if (this.ammoByWeapon[id].reserve < w.reserveMax) {
              this.ammoByWeapon[id].reserve = Math.min(w.reserveMax, this.ammoByWeapon[id].reserve + w.magSize);
              refilled = true;
            }
          });
          if (refilled) {
            p.active = false;
            p.cooldown = 18;
            p.mesh.visible = false;
            this.audio.playPickup();
            this.showPickupToast('+CEPHANE İKMALİ');
          }
        }
      }
    });
  }

  private updateWeaponKinematics(dt: number, horizSpeed: number, sprinting: boolean) {
    const spec = WEAPONS[this.currentWeapon];
    const rig = this.weaponRigs[this.currentWeapon];

    const scoped = this.aiming && Boolean(spec.hasScopeOverlay);
    this.weaponMount.visible = !scoped;

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        rig.muzzleFlashMesh.visible = false;
        rig.muzzleLight.intensity = 0;
      }
    }

    this.slideOffset = THREE.MathUtils.damp(this.slideOffset, 0, 18, dt);
    rig.slideOrBolt.position.z = rig.slideRestZ + this.slideOffset;

    if (rig.pumpForend && rig.pumpRestZ !== undefined && this.pumpAnim > 0) {
      this.pumpAnim = Math.max(0, this.pumpAnim - dt * 2.4);
      const curve = Math.sin(this.pumpAnim * Math.PI);
      rig.pumpForend.position.z = rig.pumpRestZ + curve * 0.085;
    }

    // Melee lunge
    let meleeForward = 0;
    let meleeTilt = 0;
    if (this.meleeAnim > 0) {
      this.meleeAnim = Math.max(0, this.meleeAnim - dt * 3.8);
      const curve = Math.sin(this.meleeAnim * Math.PI);
      meleeForward = -curve * 0.24;
      meleeTilt = curve * 0.42;
    }

    let reloadTiltX = 0;
    let reloadDropY = 0;
    if (this.reloading) {
      this.reloadTimer += dt;
      const p = Math.min(1, this.reloadTimer / this.reloadDuration);
      reloadTiltX = -Math.sin(p * Math.PI) * 0.55;
      reloadDropY = -Math.sin(p * Math.PI) * 0.09;
      if (this.reloadTimer >= this.reloadDuration) {
        this.finishReload();
      }
    }

    this.bobPhase += dt * (horizSpeed > 1 ? (sprinting ? 13 : 8.5) : 1.8);
    const bobMult = this.aiming ? 0.15 : horizSpeed > 1 ? (sprinting ? 0.018 : 0.01) : 0.002;
    const bobX = Math.cos(this.bobPhase * 0.5) * bobMult;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * bobMult;

    const targetPos = this.aiming ? spec.adsPos : spec.hipPos;
    const tx = targetPos[0] + bobX + (this.aiming ? 0 : this.swayX);
    const ty = targetPos[1] - bobY + reloadDropY - this.landingDip * 0.35 + (this.aiming ? 0 : this.swayY);
    const tz = targetPos[2] + this.slideOffset * 0.6 + meleeForward;

    this.weaponMount.position.x = THREE.MathUtils.damp(this.weaponMount.position.x, tx, 18, dt);
    this.weaponMount.position.y = THREE.MathUtils.damp(this.weaponMount.position.y, ty, 18, dt);
    this.weaponMount.position.z = THREE.MathUtils.damp(this.weaponMount.position.z, tz, 18, dt);

    const targetRotX = reloadTiltX + this.recoilPitch * 1.4 - meleeTilt * 0.35;
    const targetRotY = (sprinting && !this.aiming ? 0.32 : 0) + meleeTilt;
    this.weaponMount.rotation.x = THREE.MathUtils.damp(this.weaponMount.rotation.x, targetRotX, 15, dt);
    this.weaponMount.rotation.y = THREE.MathUtils.damp(this.weaponMount.rotation.y, targetRotY, 12, dt);
  }

  private canBotSeePlayer(bot: BotEntity): boolean {
    _v1.copy(bot.model.position);
    _v1.y = 1.55;
    _dir.subVectors(this.camera.position, _v1);
    const dist = _dir.length();
    if (dist > bot.cfg.range) return false;
    _dir.divideScalar(dist);

    const ray = new THREE.Raycaster(_v1, _dir, 0, dist);
    for (const obs of this.mapData.obstacles) {
      if (!obs.blocksSight) continue;
      if (ray.intersectObject(obs.mesh, false).length > 0) return false;
    }
    return true;
  }

  private applyDamageToPlayer(rawDmg: number, sourcePos: THREE.Vector3) {
    if (this.phase !== 'playing') return;
    let dmg = rawDmg;
    const hadArmor = this.armor > 0;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, Math.round(rawDmg * 0.58));
      this.armor -= absorbed;
      dmg = Math.max(1, rawDmg - absorbed);
    }
    this.hp -= dmg;
    this.damageFlash = 1.0;
    this.audio.playHurt(hadArmor);
    this.shakeTime = 0.16;
    this.shakeAmp = 0.045;

    const dx = sourcePos.x - this.camera.position.x;
    const dz = sourcePos.z - this.camera.position.z;
    const worldAngle = Math.atan2(-dx, -dz);
    const relAngle = worldAngle - this.yaw;
    this.damageIndicators.push({
      id: this.nextId++,
      angleRad: relAngle,
      intensity: 1,
      worldSource: sourcePos.clone(),
      timer: 1.1,
    });

    if (this.hp <= 0) {
      this.hp = 0;
      this.phase = 'dead';
      this.mouseDown = false;
      this.aiming = false;
      this.holdingBreath = false;
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
    }
    this.emitHud();
  }

  private updateBots(dt: number) {
    const maxConcurrent = Math.min(16, Math.max(4, this.matchConfig.botCount));
    if (this.wavePendingSpawn > 0) {
      this.waveSpawnTimer -= dt;
      if (this.waveSpawnTimer <= 0 && this.bots.filter((b) => b.alive).length < maxConcurrent) {
        this.spawnOneBot();
        this.wavePendingSpawn--;
        this.waveSpawnTimer = 0.65;
      }
    }

    const aliveCount = this.bots.filter((b) => b.alive).length;
    if (
      this.matchConfig.mode === 'waves' &&
      this.wavePendingSpawn === 0 &&
      aliveCount === 0 &&
      this.waveTransitionTimer === 0
    ) {
      this.waveTransitionTimer = 4.2;
      const bonus = 150 + this.wave * 60;
      this.cash += bonus;
      this.showBanner(`DALGA ${this.wave} TEMİZLENDİ · +$${bonus}`, 3.5);
    }

    if (this.waveTransitionTimer > 0) {
      this.waveTransitionTimer -= dt;
      if (this.waveTransitionTimer <= 0) {
        this.startWave(this.wave + 1);
      }
    }

    for (let i = this.bots.length - 1; i >= 0; i--) {
      const bot = this.bots[i];

      if (bot.dying) {
        bot.deathTimer += dt;
        const p = Math.min(1, bot.deathTimer / 0.55);
        bot.model.rotation.x = THREE.MathUtils.lerp(0, -Math.PI * 0.48, p);
        bot.model.position.y = THREE.MathUtils.lerp(0, 0.22, p);
        if (bot.deathTimer > 3.2) {
          this.scene.remove(bot.model);
          this.bots.splice(i, 1);
        }
        continue;
      }

      if (!bot.alive) continue;

      if (bot.flashTimer > 0) {
        bot.flashTimer -= dt;
        if (bot.flashTimer <= 0) bot.muzzleFlash.visible = false;
      }

      const toPlayer = _v1.subVectors(this.camera.position, bot.model.position);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      const dirToPlayer = dist > 0.001 ? toPlayer.clone().divideScalar(dist) : new THREE.Vector3(0, 0, 1);

      const sees = this.canBotSeePlayer(bot);
      if (sees) bot.alertTimer = 4.5;
      else bot.alertTimer = Math.max(0, bot.alertTimer - dt);

      const moveVec = _v2.set(0, 0, 0);
      let moving = false;

      if (sees) {
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeDir = -bot.strafeDir;
          bot.strafeTimer = 1.2 + Math.random() * 1.8;
        }
        const perp = _v3.set(-dirToPlayer.z * bot.strafeDir, 0, dirToPlayer.x * bot.strafeDir);

        if (bot.type === 'sniper') {
          if (dist > 52) moveVec.add(dirToPlayer);
          else if (dist < 24) moveVec.sub(dirToPlayer);
          moveVec.addScaledVector(perp, 0.35);
        } else if (bot.type === 'rusher') {
          if (dist > 4.5) moveVec.add(dirToPlayer);
          moveVec.addScaledVector(perp, 0.45);
        } else {
          if (dist > 22) moveVec.add(dirToPlayer);
          else if (dist < 9) moveVec.sub(dirToPlayer);
          moveVec.addScaledVector(perp, 0.7);
        }
        moving = moveVec.lengthSq() > 0.01;
      } else if (bot.alertTimer > 0) {
        moveVec.copy(dirToPlayer);
        moving = true;
      } else {
        const toPatrol = _v3.subVectors(bot.patrolTarget, bot.model.position);
        toPatrol.y = 0;
        if (toPatrol.length() < 2.2) {
          bot.patrolTarget = this.randomGroundPoint();
        } else {
          moveVec.copy(toPatrol.normalize());
          moving = true;
        }
      }

      if (moving) {
        const speedMult = sees ? 1 : bot.alertTimer > 0 ? 0.85 : 0.55;
        moveVec.normalize().multiplyScalar(bot.cfg.speed * speedMult * dt);

        const tryBx = new THREE.Vector3(bot.model.position.x + moveVec.x, 1.4, bot.model.position.z);
        if (!this.collidesWithCompound(tryBx, 0.52, 1.4)) {
          bot.model.position.x = tryBx.x;
        }
        const tryBz = new THREE.Vector3(bot.model.position.x, 1.4, bot.model.position.z + moveVec.z);
        if (!this.collidesWithCompound(tryBz, 0.52, 1.4)) {
          bot.model.position.z = tryBz.z;
        }
      }

      const lookTarget = sees || bot.alertTimer > 0 ? this.camera.position : bot.patrolTarget;
      const targetYaw = Math.atan2(-(lookTarget.x - bot.model.position.x), -(lookTarget.z - bot.model.position.z));
      let diff = targetYaw - bot.model.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bot.model.rotation.y += diff * Math.min(1, dt * 8);

      if (moving) {
        bot.walkPhase += dt * (sees ? 10 : 6);
        const swing = Math.sin(bot.walkPhase) * (sees ? 0.55 : 0.35);
        bot.pivots.legL.rotation.x = swing;
        bot.pivots.legR.rotation.x = -swing;
        bot.pivots.armL.rotation.x = -swing * 0.25;
      } else {
        bot.pivots.legL.rotation.x = THREE.MathUtils.damp(bot.pivots.legL.rotation.x, 0, 8, dt);
        bot.pivots.legR.rotation.x = THREE.MathUtils.damp(bot.pivots.legR.rotation.x, 0, 8, dt);
      }

      if (bot.sniperLaser) {
        if (sees && dist < 85) {
          bot.sniperLaser.visible = true;
          bot.muzzlePoint.getWorldPosition(_v2);
          bot.model.worldToLocal(_v2);
          const localTarget = this.camera.position.clone().add(new THREE.Vector3(0, -0.15, 0));
          bot.model.worldToLocal(localTarget);
          const posArr = bot.sniperLaser.geometry.attributes.position as THREE.BufferAttribute;
          posArr.setXYZ(0, _v2.x, _v2.y, _v2.z);
          posArr.setXYZ(1, localTarget.x, localTarget.y, localTarget.z);
          posArr.needsUpdate = true;
        } else {
          bot.sniperLaser.visible = false;
        }
      }

      if (sees) {
        bot.shootCooldown -= dt;
        if (bot.shootCooldown <= 0) {
          bot.shootCooldown = bot.cfg.fireRate * (0.75 + Math.random() * 0.5);
          bot.muzzleFlash.visible = true;
          bot.flashTimer = 0.055;

          const start = new THREE.Vector3();
          bot.muzzlePoint.getWorldPosition(start);

          const inaccuracy = (1 - bot.cfg.accuracy) * (this.crouching ? 1.25 : 1.0);
          const targetPt = this.camera.position
            .clone()
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * inaccuracy * 2.6,
                (Math.random() - 0.5) * inaccuracy * 2.2 - 0.15,
                (Math.random() - 0.5) * inaccuracy * 2.6
              )
            );
          this.spawnTracer(start, targetPt, 0xffaa44);
          this.audio.playShot(bot.type === 'sniper' ? 'sniper' : 'rifle', Math.max(0.08, 1 - dist / 85));

          const hitProb =
            Math.max(0.12, (1 - dist / (bot.cfg.range * 1.15)) * bot.cfg.accuracy) *
            (this.crouching ? 0.78 : 1);
          if (Math.random() < hitProb) {
            this.applyDamageToPlayer(bot.cfg.damage, bot.model.position);
          }
        }
      }
    }
  }

  private updateEffectsAndPhysics(dt: number) {
    // Weather particles (snow / dust)
    if (this.weatherPoints) {
      const attr = this.weatherPoints.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const isSnow = MAPS[this.matchConfig.mapId].hasSnow;
      const t = performance.now() * 0.001;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] += this.weatherVelY * dt;
        if (isSnow) {
          arr[i] += Math.sin(t + i) * 0.6 * dt;
        }
        if (arr[i + 1] < 0) {
          arr[i + 1] = 28;
          arr[i] = this.camera.position.x + (Math.random() - 0.5) * 130;
          arr[i + 2] = this.camera.position.z + (Math.random() - 0.5) * 130;
        }
      }
      attr.needsUpdate = true;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        p.vel.y *= -0.3;
      }
      if (p.grow) {
        p.mesh.scale.addScalar(p.grow * dt);
      }
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / p.maxLife);
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        (tr.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      } else {
        (tr.line.material as THREE.LineBasicMaterial).opacity = tr.life / tr.maxLife;
      }
    }

    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.shells.splice(i, 1);
        continue;
      }
      s.vel.y -= 16 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.rotVel.x * dt;
      s.mesh.rotation.y += s.rotVel.y * dt;
      if (s.mesh.position.y < 0.03) {
        s.mesh.position.y = 0.03;
        if (!s.bounced) {
          s.bounced = true;
          this.audio.playShellClink();
        }
        s.vel.y = -s.vel.y * 0.36;
        s.vel.x *= 0.65;
        s.vel.z *= 0.65;
        s.rotVel.multiplyScalar(0.5);
      }
    }

    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.fuse -= dt;
      g.vel.y -= 18 * dt;
      const nextPos = _v1.copy(g.mesh.position).addScaledVector(g.vel, dt);
      if (this.collidesWithCompound(new THREE.Vector3(nextPos.x, Math.max(0.5, nextPos.y), g.mesh.position.z), 0.15, 0.2)) {
        g.vel.x *= -0.45;
      } else {
        g.mesh.position.x = nextPos.x;
      }
      if (this.collidesWithCompound(new THREE.Vector3(g.mesh.position.x, Math.max(0.5, nextPos.y), nextPos.z), 0.15, 0.2)) {
        g.vel.z *= -0.45;
      } else {
        g.mesh.position.z = nextPos.z;
      }
      g.mesh.position.y = nextPos.y;
      if (g.mesh.position.y < 0.1) {
        g.mesh.position.y = 0.1;
        g.vel.y = -g.vel.y * 0.42;
        g.vel.x *= 0.72;
        g.vel.z *= 0.72;
      }
      g.mesh.rotation.x += dt * 8;
      g.mesh.rotation.z += dt * 6;

      if (g.fuse <= 0) {
        const pos = g.mesh.position.clone();
        this.scene.remove(g.mesh);
        this.activeGrenades.splice(i, 1);
        if (this.isMultiplayer) {
          this.triggerExplosion(pos, 10.5, 195, false, true);
          if (!g.remote) {
            this.net.send({ type: 'grenade:explode', x: pos.x, z: pos.z });
          }
        } else {
          this.triggerExplosion(pos, 10.5, 195, false, false);
        }
      }
    }

    for (const b of this.mapData.barrels) {
      if (b.exploded) {
        b.respawnTimer -= dt;
        if (b.respawnTimer <= 0) {
          b.exploded = false;
          b.hp = 40;
          b.group.visible = true;
        }
      }
    }

    for (let i = this.explosionLights.length - 1; i >= 0; i--) {
      const el = this.explosionLights[i];
      el.life -= dt;
      if (el.life <= 0) {
        this.scene.remove(el.light);
        this.explosionLights.splice(i, 1);
      } else {
        el.light.intensity = 18 * (el.life / 0.28);
      }
    }

    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) this.hitmarkerType = 'none';
    }
    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt * 2.8);
    }
    for (let i = this.damageIndicators.length - 1; i >= 0; i--) {
      const ind = this.damageIndicators[i];
      ind.timer -= dt;
      if (ind.timer <= 0) {
        this.damageIndicators.splice(i, 1);
      } else {
        const dx = ind.worldSource.x - this.camera.position.x;
        const dz = ind.worldSource.z - this.camera.position.z;
        ind.angleRad = Math.atan2(-dx, -dz) - this.yaw;
        ind.intensity = Math.min(1, ind.timer / 0.7);
      }
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerText = null;
    }
    if (this.pickupToastTimer > 0) {
      this.pickupToastTimer -= dt;
      if (this.pickupToastTimer <= 0) this.pickupToast = null;
    }
  }

  private drawMinimap() {
    if (!this.minimapCanvas) return;
    const ctx = this.minimapCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = w / 2 - 4;
    const scale = 1.45;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = 'rgba(18, 20, 18, 0.86)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.yaw);

    for (const r of this.mapData.mapRects) {
      const rx = (r.x - this.camera.position.x) * scale;
      const rz = (r.z - this.camera.position.z) * scale;
      const rw = r.w * scale;
      const rd = r.d * scale;
      ctx.fillStyle =
        r.kind === 'building'
          ? 'rgba(130, 126, 118, 0.6)'
          : r.kind === 'container'
          ? 'rgba(92, 108, 82, 0.65)'
          : 'rgba(168, 134, 92, 0.5)';
      ctx.fillRect(rx - rw / 2, rz - rd / 2, rw, rd);
    }

    for (const p of this.pickups) {
      if (!p.active) continue;
      const px = (p.position.x - this.camera.position.x) * scale;
      const pz = (p.position.z - this.camera.position.z) * scale;
      ctx.fillStyle = p.kind === 'medkit' ? '#22c55e' : '#eab308';
      ctx.fillRect(px - 2.5, pz - 2.5, 5, 5);
    }

    if (this.isMultiplayer) {
      for (const rv of this.remoteVisuals.values()) {
        if (!rv.state.alive) continue;
        const px = (rv.group.position.x - this.camera.position.x) * scale;
        const pz = (rv.group.position.z - this.camera.position.z) * scale;
        const isMate =
          this.mpRoom?.mode === 'coop' ||
          (this.mpRoom?.mode === 'tdm' && rv.state.team === this.mpTeam);
        ctx.fillStyle = isMate ? '#38bdf8' : '#ef4444';
        ctx.beginPath();
        ctx.arc(px, pz, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const nb of this.netBotVisuals.values()) {
        if (!nb.state.alive) continue;
        const bx = (nb.model.position.x - this.camera.position.x) * scale;
        const bz = (nb.model.position.z - this.camera.position.z) * scale;
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(bx, bz, 3.0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (const bot of this.bots) {
        if (!bot.alive) continue;
        const bx = (bot.model.position.x - this.camera.position.x) * scale;
        const bz = (bot.model.position.z - this.camera.position.z) * scale;
        ctx.fillStyle =
          bot.type === 'sniper' ? '#a855f7' : bot.type === 'heavy' ? '#38bdf8' : '#ef4444';
        ctx.beginPath();
        ctx.arc(bx, bz, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius * 0.72, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 4.5, cy + 5);
    ctx.lineTo(cx + 4.5, cy + 5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private emitHud() {
    const spec = WEAPONS[this.currentWeapon];
    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    const baseSpread = this.aiming ? spec.adsSpread : spec.hipSpread;
    const spreadPx = Math.round((baseSpread + this.dynamicSpread * 0.5 + horizSpeed * 0.002) * 720);
    const sprinting = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) && horizSpeed > 6.5 && !this.crouching;

    const netBotsAlive = this.isMultiplayer
      ? Array.from(this.netBotVisuals.values()).filter((b) => b.state.alive).length
      : this.bots.filter((b) => b.alive).length;

    this.onHudUpdate({
      phase: this.phase,
      pointerLocked: this.pointerLocked,
      isMultiplayer: this.isMultiplayer,
      mpConnected: this.mpConnected,
      mpRoom: this.mpRoom,
      mpTeam: this.mpTeam,
      mpPlayers: this.mpPlayers,
      mpRespawnTimer: this.mpRespawnTimer,
      mpChat: this.mpChat,
      matchConfig: { ...this.matchConfig },
      hp: Math.ceil(this.hp),
      maxHp: this.maxHp,
      armor: Math.ceil(this.armor),
      maxArmor: this.maxArmor,
      stamina: Math.round(this.stamina),
      breathMeter: Math.round(this.breathMeter),
      holdingBreath: this.holdingBreath,
      flashlightOn: this.flashlightOn,
      stance: this.crouching ? 'crouching' : sprinting ? 'sprinting' : 'standing',
      currentWeapon: this.currentWeapon,
      ammoByWeapon: {
        pistol: { ...this.ammoByWeapon.pistol },
        rifle: { ...this.ammoByWeapon.rifle },
        shotgun: { ...this.ammoByWeapon.shotgun },
        sniper: { ...this.ammoByWeapon.sniper },
      },
      grenades: this.grenades,
      reloading: this.reloading,
      reloadProgress: this.reloading ? Math.min(1, this.reloadTimer / this.reloadDuration) : 0,
      aiming: this.aiming,
      sniperScoped: this.aiming && Boolean(spec.hasScopeOverlay),
      crosshairSpread: Math.max(6, Math.min(44, spreadPx)),
      hitmarkerType: this.hitmarkerType,
      damageFlash: this.damageFlash,
      damageIndicators: this.damageIndicators.map((d) => ({
        id: d.id,
        angleRad: d.angleRad,
        intensity: d.intensity,
      })),
      score: this.score,
      kills: this.kills,
      headshots: this.headshots,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      damageDealt: this.damageDealt,
      wave: this.wave,
      waveBotsAlive: netBotsAlive,
      waveBotsPending: this.isMultiplayer ? 0 : this.wavePendingSpawn,
      cash: this.cash,
      bannerText: this.bannerText,
      killfeed: [...this.killfeed],
      damageBonusLevel: this.damageBonusLevel,
      pickupToast: this.pickupToast,
    });
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    if (!sync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        gl.deleteSync(sync);
        return;
      }
      const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop() {
    const tick = () => {
      if (this.disposed) return;
      const dt = Math.min(this.clock.getDelta(), 0.05);

      if (this.phase === 'playing') {
        if (this.isMultiplayer) {
          if (this.mpRespawnTimer > 0) {
            this.mpRespawnTimer = Math.max(0, this.mpRespawnTimer - dt);
          } else {
            this.updatePlayer(dt);
          }
          this.updateNetworkEntities(dt);
          this.netSendAccum += dt;
          if (this.netSendAccum >= 0.05) {
            this.netSendAccum = 0;
            this.net.send({
              type: 'player:state',
              x: this.camera.position.x,
              y: this.camera.position.y,
              z: this.camera.position.z,
              yaw: this.yaw,
              pitch: this.pitch,
              crouching: this.crouching,
              weapon: this.currentWeapon,
            });
          }
        } else {
          this.updatePlayer(dt);
          this.updateBots(dt);
        }
      } else if (this.phase === 'start') {
        const t = performance.now() * 0.00018;
        this.camera.position.set(Math.sin(t) * 44, 16, Math.cos(t) * 44);
        this.camera.lookAt(0, 3, -6);
      }

      this.updateEffectsAndPhysics(dt);
      this.drawMinimap();
      this.renderer.render(this.scene, this.camera);

      this.hudEmitAccum += dt;
      if (this.hudEmitAccum >= 0.05) {
        this.hudEmitAccum = 0;
        this.emitHud();
      }

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

  // ============ MULTIPLAYER SYNC HELPERS ============
  private clearMultiplayerEntities() {
    for (const rv of this.remoteVisuals.values()) {
      this.scene.remove(rv.group);
    }
    this.remoteVisuals.clear();
    for (const nb of this.netBotVisuals.values()) {
      this.scene.remove(nb.model);
    }
    this.netBotVisuals.clear();
  }

  private createCallsignSprite(name: string, team: TeamId): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 64);

    ctx.fillStyle = 'rgba(12, 14, 18, 0.78)';
    ctx.fillRect(16, 12, 224, 40);
    ctx.strokeStyle =
      team === 'alpha' ? '#38bdf8' : team === 'bravo' ? '#ef4444' : '#f59e0b';
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 12, 224, 40);

    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#f5f5f4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 16), 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.6, 0.4, 1);
    sprite.position.set(0, 2.22, 0);
    return sprite;
  }

  private createRemotePlayerVisual(p: RemotePlayerNetState): RemotePlayerVisual {
    const op = OPERATORS[p.operatorId] || OPERATORS.assault;
    const baseCfg = BOT_TYPES.assault;
    const teamColor =
      p.team === 'alpha' ? 0x2563eb : p.team === 'bravo' ? 0xb91c1c : op.sleeveColor;
    const rig = createSoldierModel(0, {
      ...baseCfg,
      vestColor: teamColor,
      camoColor: p.team === 'alpha' ? 0x2a394a : p.team === 'bravo' ? 0x452b2b : 0x3b4236,
      helmetColor: 0x1c2026,
      scale: 1.0,
    });
    rig.hitParts.forEach((pt) => {
      delete pt.userData.botId;
      pt.userData.remotePlayerId = p.id;
    });
    const labelSprite = this.createCallsignSprite(p.name, p.team);
    rig.group.add(labelSprite);
    rig.group.position.set(p.x, 0, p.z);
    rig.group.rotation.y = p.yaw;
    this.scene.add(rig.group);

    return {
      id: p.id,
      state: p,
      group: rig.group,
      hitParts: rig.hitParts,
      pivots: rig.pivots,
      muzzlePoint: rig.muzzlePoint,
      muzzleFlash: rig.muzzleFlash,
      labelSprite,
      targetPos: new THREE.Vector3(p.x, 0, p.z),
      targetYaw: p.yaw,
      walkPhase: 0,
      flashTimer: 0,
    };
  }

  private createNetBotVisual(b: NetBotState): NetBotVisual {
    const cfg = BOT_TYPES[b.type as BotClass] || BOT_TYPES.assault;
    const rig = createSoldierModel(0, cfg);
    rig.hitParts.forEach((pt) => {
      delete pt.userData.botId;
      pt.userData.netBotId = b.id;
    });
    rig.group.position.set(b.x, 0, b.z);
    rig.group.rotation.y = b.yaw;
    this.scene.add(rig.group);

    return {
      id: b.id,
      state: b,
      model: rig.group,
      hitParts: rig.hitParts,
      pivots: rig.pivots,
      muzzlePoint: rig.muzzlePoint,
      muzzleFlash: rig.muzzleFlash,
      targetPos: new THREE.Vector3(b.x, 0, b.z),
      targetYaw: b.yaw,
      walkPhase: Math.random() * Math.PI * 2,
      flashTimer: 0,
    };
  }

  private syncSnapshot(players: RemotePlayerNetState[], bots: NetBotState[]) {
    this.mpPlayers = players;
    const seenPlayerIds = new Set<string>();
    for (const p of players) {
      if (p.id === this.mpSelfId) {
        this.kills = p.kills;
        this.score = p.score;
        this.mpTeam = p.team;
        continue;
      }
      seenPlayerIds.add(p.id);
      let rv = this.remoteVisuals.get(p.id);
      if (!rv) {
        rv = this.createRemotePlayerVisual(p);
        this.remoteVisuals.set(p.id, rv);
      }
      rv.state = p;
      rv.targetPos.set(p.x, 0, p.z);
      rv.targetYaw = p.yaw;
      rv.group.visible = p.alive;
    }

    for (const [id, rv] of this.remoteVisuals.entries()) {
      if (!seenPlayerIds.has(id)) {
        this.scene.remove(rv.group);
        this.remoteVisuals.delete(id);
      }
    }

    const seenBotIds = new Set<number>();
    for (const b of bots) {
      seenBotIds.add(b.id);
      let nb = this.netBotVisuals.get(b.id);
      if (!nb) {
        nb = this.createNetBotVisual(b);
        this.netBotVisuals.set(b.id, nb);
      }
      nb.state = b;
      nb.targetPos.set(b.x, 0, b.z);
      nb.targetYaw = b.yaw;
      nb.model.visible = b.alive;
    }

    for (const [id, nb] of this.netBotVisuals.entries()) {
      if (!seenBotIds.has(id)) {
        this.scene.remove(nb.model);
        this.netBotVisuals.delete(id);
      }
    }
  }

  private updateNetworkEntities(dt: number) {
    for (const rv of this.remoteVisuals.values()) {
      if (!rv.state.alive) continue;
      const dist = rv.group.position.distanceTo(rv.targetPos);
      rv.group.position.lerp(rv.targetPos, Math.min(1, dt * 14));
      let diff = rv.targetYaw - rv.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      rv.group.rotation.y += diff * Math.min(1, dt * 14);
      rv.group.scale.y = rv.state.crouching ? 0.72 : 1.0;

      if (dist > 0.04) {
        rv.walkPhase += dt * 10;
        const swing = Math.sin(rv.walkPhase) * 0.45;
        rv.pivots.legL.rotation.x = swing;
        rv.pivots.legR.rotation.x = -swing;
      } else {
        rv.pivots.legL.rotation.x = THREE.MathUtils.damp(rv.pivots.legL.rotation.x, 0, 8, dt);
        rv.pivots.legR.rotation.x = THREE.MathUtils.damp(rv.pivots.legR.rotation.x, 0, 8, dt);
      }

      if (rv.flashTimer > 0) {
        rv.flashTimer -= dt;
        if (rv.flashTimer <= 0) rv.muzzleFlash.visible = false;
      }
    }

    for (const nb of this.netBotVisuals.values()) {
      if (!nb.state.alive) continue;
      const dist = nb.model.position.distanceTo(nb.targetPos);
      nb.model.position.lerp(nb.targetPos, Math.min(1, dt * 12));
      let diff = nb.targetYaw - nb.model.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      nb.model.rotation.y += diff * Math.min(1, dt * 12);

      if (dist > 0.04) {
        nb.walkPhase += dt * 9;
        const swing = Math.sin(nb.walkPhase) * 0.45;
        nb.pivots.legL.rotation.x = swing;
        nb.pivots.legR.rotation.x = -swing;
      }
      if (nb.flashTimer > 0) {
        nb.flashTimer -= dt;
        if (nb.flashTimer <= 0) nb.muzzleFlash.visible = false;
      }
    }
  }

  private pushChatMessage(sender: string, text: string, system = false) {
    this.mpChat.push({
      id: this.nextId++,
      sender,
      text,
      system,
      timestamp: Date.now(),
    });
    if (this.mpChat.length > 8) this.mpChat.shift();
  }

  private handleServerMessage(msg: ServerMessage) {
    const type = String(msg.type || '');

    if (type === 'room:list') {
      const rooms = (msg.rooms as RoomSummary[]) || [];
      this.onRoomsUpdateCb?.(rooms);
      return;
    }

    if (type === 'error') {
      this.onNetErrorCb?.(String(msg.message || 'Sunucu hatası'));
      return;
    }

    if (type === 'room:joined') {
      const room = msg.room as RoomSummary;
      const self = msg.self as RemotePlayerNetState;
      const players = (msg.players as RemotePlayerNetState[]) || [];
      const bots = (msg.bots as NetBotState[]) || [];

      this.clearMultiplayerEntities();
      this.bots.forEach((b) => this.scene.remove(b.model));
      this.bots.length = 0;

      this.isMultiplayer = true;
      this.mpSelfId = String(msg.selfId);
      this.mpRoom = room;
      this.mpTeam = self.team;
      this.mpRespawnTimer = 0;
      this.mpChat = [];

      if (room.mapId !== this.matchConfig.mapId) {
        this.matchConfig = { ...this.matchConfig, mapId: room.mapId };
        this.rebuildMap(room.mapId);
      } else {
        this.rebuildMap(room.mapId);
      }

      this.resetMatch();
      this.camera.position.set(self.x, 1.72, self.z);
      this.hp = self.hp;
      this.maxHp = self.maxHp;
      this.armor = self.armor;
      this.cash = 300;
      this.syncSnapshot(players, bots);

      const modeLabel =
        room.mode === 'tdm'
          ? 'TAKIM ÇATIŞMASI'
          : room.mode === 'coop'
          ? 'CO-OP SAVUNMA'
          : 'HERKES TEK';
      this.showBanner(`${room.name} · ${modeLabel}`, 3.0);
      this.pushChatMessage('Sistem', `${room.name} odasına katıldın.`, true);

      this.phase = 'playing';
      this.requestLock();
      this.emitHud();
      return;
    }

    if (!this.isMultiplayer) return;

    if (type === 'room:snapshot') {
      this.syncSnapshot(
        (msg.players as RemotePlayerNetState[]) || [],
        (msg.bots as NetBotState[]) || []
      );
      return;
    }

    if (type === 'player:joined') {
      const p = msg.player as RemotePlayerNetState;
      this.pushChatMessage('Sistem', `${p.name} operasyona katıldı.`, true);
      this.emitHud();
      return;
    }

    if (type === 'player:left') {
      const pid = String(msg.playerId);
      const rv = this.remoteVisuals.get(pid);
      if (rv) {
        this.scene.remove(rv.group);
        this.remoteVisuals.delete(pid);
      }
      this.pushChatMessage('Sistem', `${String(msg.name || 'Oyuncu')} ayrıldı.`, true);
      this.emitHud();
      return;
    }

    if (type === 'player:shoot') {
      const pid = String(msg.playerId);
      const weapon = (msg.weapon as WeaponId) || 'rifle';
      const start = msg.start as [number, number, number];
      const end = msg.end as [number, number, number];
      if (Array.isArray(start) && Array.isArray(end)) {
        const s = new THREE.Vector3(start[0], start[1], start[2]);
        const e = new THREE.Vector3(end[0], end[1], end[2]);
        this.spawnTracer(s, e, WEAPONS[weapon]?.tracerColor || 0xffcc44);
        const dist = s.distanceTo(this.camera.position);
        this.audio.playShot(weapon, Math.max(0.08, 1 - dist / 90));
      }
      const rv = this.remoteVisuals.get(pid);
      if (rv) {
        rv.muzzleFlash.visible = true;
        rv.flashTimer = 0.055;
      }
      return;
    }

    if (type === 'bot:shoot') {
      const botId = Number(msg.botId);
      const from = msg.from as [number, number, number];
      const to = msg.to as [number, number, number];
      if (Array.isArray(from) && Array.isArray(to)) {
        const s = new THREE.Vector3(from[0], from[1], from[2]);
        const e = new THREE.Vector3(to[0], to[1], to[2]);
        this.spawnTracer(s, e, 0xffaa44);
        const dist = s.distanceTo(this.camera.position);
        this.audio.playShot('rifle', Math.max(0.06, 1 - dist / 85));
      }
      const nb = this.netBotVisuals.get(botId);
      if (nb) {
        nb.muzzleFlash.visible = true;
        nb.flashTimer = 0.055;
      }
      return;
    }

    if (type === 'hit:confirm') {
      const killed = Boolean(msg.killed);
      const headshot = Boolean(msg.headshot);
      const dmg = Number(msg.damage) || 0;
      this.damageDealt += dmg;
      if (headshot && killed) this.headshots++;
      this.audio.playHit(headshot);
      this.hitmarkerType = killed ? 'kill' : headshot ? 'head' : 'body';
      this.hitmarkerTimer = killed || headshot ? 0.22 : 0.14;
      this.emitHud();
      return;
    }

    if (type === 'player:damaged') {
      const hadArmor = this.armor > 0;
      this.hp = Number(msg.hp) || 0;
      this.armor = Number(msg.armor) || 0;
      this.damageFlash = 1.0;
      this.audio.playHurt(hadArmor);
      this.shakeTime = 0.16;
      this.shakeAmp = 0.045;
      const sx = Number(msg.sourceX) || 0;
      const sz = Number(msg.sourceZ) || 0;
      const dx = sx - this.camera.position.x;
      const dz = sz - this.camera.position.z;
      this.damageIndicators.push({
        id: this.nextId++,
        angleRad: Math.atan2(-dx, -dz) - this.yaw,
        intensity: 1,
        worldSource: new THREE.Vector3(sx, 1.5, sz),
        timer: 1.1,
      });
      this.emitHud();
      return;
    }

    if (type === 'player:killed') {
      const victimId = String(msg.victimId || '');
      const killerId = msg.killerId ? String(msg.killerId) : null;
      const headshot = Boolean(msg.headshot);
      const explosive = Boolean(msg.explosive);
      const melee = Boolean(msg.melee);

      this.killfeed.unshift({
        id: this.nextId++,
        killer: String(msg.killerName || 'Bilinmeyen'),
        victim: String(msg.victimName || 'Oyuncu'),
        headshot,
        explosive,
        melee,
        timestamp: performance.now(),
      });
      if (this.killfeed.length > 5) this.killfeed.pop();

      if (killerId === this.mpSelfId) {
        this.cash += headshot ? 150 : 100;
        this.audio.playKill(headshot);
      }
      if (victimId === this.mpSelfId) {
        this.hp = 0;
        this.mpRespawnTimer = 3.5;
        this.mouseDown = false;
        this.aiming = false;
        this.holdingBreath = false;
        this.camera.fov = this.settings.fov;
        this.camera.updateProjectionMatrix();
      }
      this.emitHud();
      return;
    }

    if (type === 'player:respawned') {
      const x = Number(msg.x) || 0;
      const z = Number(msg.z) || 0;
      this.hp = Number(msg.hp) || this.maxHp;
      this.armor = Number(msg.armor) || 50;
      this.mpRespawnTimer = 0;
      this.camera.position.set(x, 1.72, z);
      this.playerVel.set(0, 0, 0);
      this.resetAmmoState();
      this.showPickupToast('YENİDEN KONUŞLANDIRILDI');
      this.emitHud();
      return;
    }

    if (type === 'bot:killed') {
      const killerId = msg.killerId ? String(msg.killerId) : null;
      const headshot = Boolean(msg.headshot);
      this.killfeed.unshift({
        id: this.nextId++,
        killer: String(msg.killerName || 'Oyuncu'),
        victim: 'Bot',
        headshot,
        timestamp: performance.now(),
      });
      if (this.killfeed.length > 5) this.killfeed.pop();
      if (killerId === this.mpSelfId) {
        this.cash += headshot ? 120 : 80;
        this.audio.playKill(headshot);
      }
      this.emitHud();
      return;
    }

    if (type === 'grenade:throw') {
      const pos = msg.pos as [number, number, number];
      const vel = msg.vel as [number, number, number];
      if (Array.isArray(pos) && Array.isArray(vel)) {
        const grp = this.createGrenadeMesh();
        grp.position.set(pos[0], pos[1], pos[2]);
        this.scene.add(grp);
        this.activeGrenades.push({
          mesh: grp,
          vel: new THREE.Vector3(vel[0], vel[1], vel[2]),
          fuse: 2.2,
          remote: true,
        });
      }
      return;
    }

    if (type === 'barrel:detonate') {
      const b = this.mapData.barrels[Number(msg.barrelId)];
      if (b && !b.exploded) {
        this.detonateBarrel(b);
      }
      return;
    }

    if (type === 'chat:msg') {
      this.pushChatMessage(String(msg.sender || 'Oyuncu'), String(msg.text || ''), false);
      this.emitHud();
    }
  }

  public dispose() {
    this.disposed = true;
    this.net.disconnect();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);

    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.textures.dispose();
    this.shellGeo.dispose();
    this.shellMat.dispose();
    this.decalGeo.dispose();
    this.decalMat.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
