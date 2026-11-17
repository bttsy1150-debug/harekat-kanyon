export type WeaponId = 'pistol' | 'rifle' | 'shotgun' | 'sniper';

export type BotClass = 'rusher' | 'assault' | 'sniper' | 'heavy';

export type MapId = 'canyon' | 'night_port' | 'snow_outpost';

export type OperatorId = 'assault' | 'recon' | 'sniper' | 'heavy';

export type DifficultyId = 'recruit' | 'soldier' | 'commando' | 'special';

export type GameModeId = 'waves' | 'skirmish';

export interface MapConfig {
  id: MapId;
  name: string;
  subtitle: string;
  timeOfDay: string;
  visibility: string;
  description: string;
  accentColor: string;
  skyTop: number;
  skyMid: number;
  skyHorizon: number;
  fogColor: number;
  fogDensity: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  isNight: boolean;
  hasSnow: boolean;
}

export const MAPS: Record<MapId, MapConfig> = {
  canyon: {
    id: 'canyon',
    name: 'Kanyon İleri Üssü',
    subtitle: 'Çöl Karakolu · İkindi',
    timeOfDay: '16:40 · Açık Hava',
    visibility: 'Yüksek Görüş (180m)',
    description: 'Beton komuta sığınağı, gözetleme kuleleri ve yakıt varilleriyle çevrili kurak kanyon üssü.',
    accentColor: '#f59e0b',
    skyTop: 0x28568a,
    skyMid: 0x7ca6cc,
    skyHorizon: 0xd2c0a3,
    fogColor: 0xc2b298,
    fogDensity: 0.0058,
    sunColor: 0xfff0d4,
    sunIntensity: 1.85,
    hemiSky: 0xa4c8eb,
    hemiGround: 0x6b5a45,
    hemiIntensity: 0.72,
    isNight: false,
    hasSnow: false,
  },
  night_port: {
    id: 'night_port',
    name: 'Gece Limanı',
    subtitle: 'Endüstriyel Tersane · 02:15',
    timeOfDay: '02:15 · Gece Operasyonu',
    visibility: 'Projektör & El Feneri (F)',
    description: 'Islak asfalt, konteyner labirentleri ve yüksek projektör kuleleri altında karanlık baskın.',
    accentColor: '#38bdf8',
    skyTop: 0x060b16,
    skyMid: 0x0e1a2e,
    skyHorizon: 0x1b2b3f,
    fogColor: 0x111a28,
    fogDensity: 0.0135,
    sunColor: 0x8fb8ff,
    sunIntensity: 0.55,
    hemiSky: 0x294466,
    hemiGround: 0x12151a,
    hemiIntensity: 0.42,
    isNight: true,
    hasSnow: false,
  },
  snow_outpost: {
    id: 'snow_outpost',
    name: 'Karlı Dağ Karakolu',
    subtitle: 'Buzul Sınır Hattı · Tipi',
    timeOfDay: '09:10 · Kar Yağışlı',
    visibility: 'Orta Görüş · Soğuk Sis',
    description: 'Karlı dağ zirveleri arasında kurulmuş ahşap/beton sınır karakolu ve kaygan buz siperleri.',
    accentColor: '#67e8f9',
    skyTop: 0x5c7288,
    skyMid: 0x9ab0c4,
    skyHorizon: 0xcfdbe6,
    fogColor: 0xc7d4e0,
    fogDensity: 0.011,
    sunColor: 0xe6f2ff,
    sunIntensity: 1.35,
    hemiSky: 0xd6e6f5,
    hemiGround: 0x7a8a99,
    hemiIntensity: 0.85,
    isNight: false,
    hasSnow: true,
  },
};

export interface OperatorConfig {
  id: OperatorId;
  callsign: string;
  role: string;
  maxHp: number;
  startArmor: number;
  maxArmor: number;
  speedMult: number;
  reloadMult: number;
  headshotMult: number;
  explosiveResist: number;
  startGrenades: number;
  preferredWeapon: WeaponId;
  perkSummary: string;
  sleeveColor: number;
}

export const OPERATORS: Record<OperatorId, OperatorConfig> = {
  assault: {
    id: 'assault',
    callsign: 'Kaan "Kalkan"',
    role: 'Taarruz Piyadesi',
    maxHp: 100,
    startArmor: 75,
    maxArmor: 100,
    speedMult: 1.0,
    reloadMult: 0.82,
    headshotMult: 1.0,
    explosiveResist: 1.0,
    startGrenades: 3,
    preferredWeapon: 'rifle',
    perkSummary: '%18 daha hızlı şarjör değişimi · Dengeli zırh',
    sleeveColor: 0x3b4432,
  },
  recon: {
    id: 'recon',
    callsign: 'Emre "Gölge"',
    role: 'Hızlı Keşif Komandosu',
    maxHp: 90,
    startArmor: 50,
    maxArmor: 85,
    speedMult: 1.18,
    reloadMult: 0.9,
    headshotMult: 1.08,
    explosiveResist: 1.0,
    startGrenades: 4,
    preferredWeapon: 'shotgun',
    perkSummary: '+%18 hareket hızı · +1 El Bombası · Çevik koşu',
    sleeveColor: 0x2a2f36,
  },
  sniper: {
    id: 'sniper',
    callsign: 'Selim "Şahin"',
    role: 'Keskin Nişancı Uzmanı',
    maxHp: 95,
    startArmor: 50,
    maxArmor: 90,
    speedMult: 1.04,
    reloadMult: 0.92,
    headshotMult: 1.25,
    explosiveResist: 1.0,
    startGrenades: 2,
    preferredWeapon: 'sniper',
    perkSummary: '+%25 kafadan vuruş hasarı · Uzun nefes tutma',
    sleeveColor: 0x4c483d,
  },
  heavy: {
    id: 'heavy',
    callsign: 'Demir "Balyoz"',
    role: 'Ağır Destek Operatörü',
    maxHp: 130,
    startArmor: 100,
    maxArmor: 125,
    speedMult: 0.92,
    reloadMult: 1.0,
    headshotMult: 1.0,
    explosiveResist: 0.65,
    startGrenades: 4,
    preferredWeapon: 'shotgun',
    perkSummary: '130 Can · 100 Başlangıç Zırhı · %35 patlama direnci',
    sleeveColor: 0x22303f,
  },
};

export interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  botHpMult: number;
  botDmgMult: number;
  botAccBonus: number;
  botFireRateMult: number;
  cashMult: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  recruit: {
    id: 'recruit',
    label: 'Acemi',
    botHpMult: 0.8,
    botDmgMult: 0.7,
    botAccBonus: -0.1,
    botFireRateMult: 1.25,
    cashMult: 0.9,
  },
  soldier: {
    id: 'soldier',
    label: 'Asker',
    botHpMult: 1.0,
    botDmgMult: 1.0,
    botAccBonus: 0,
    botFireRateMult: 1.0,
    cashMult: 1.0,
  },
  commando: {
    id: 'commando',
    label: 'Komando',
    botHpMult: 1.25,
    botDmgMult: 1.25,
    botAccBonus: 0.08,
    botFireRateMult: 0.85,
    cashMult: 1.2,
  },
  special: {
    id: 'special',
    label: 'Özel Kuvvet',
    botHpMult: 1.5,
    botDmgMult: 1.5,
    botAccBonus: 0.16,
    botFireRateMult: 0.72,
    cashMult: 1.5,
  },
};

export interface MatchConfig {
  mapId: MapId;
  operatorId: OperatorId;
  difficulty: DifficultyId;
  botCount: number;
  mode: GameModeId;
  startingWeapon: WeaponId;
}

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  modelLabel: string;
  caliber: string;
  damage: number;
  fireRateMs: number;
  reloadMs: number;
  magSize: number;
  reserveMax: number;
  hipSpread: number;
  adsSpread: number;
  auto: boolean;
  recoilPitch: number;
  recoilYaw: number;
  pellets?: number;
  adsFov: number;
  adsPos: [number, number, number];
  hipPos: [number, number, number];
  hasScopeOverlay?: boolean;
  accentHex: string;
  tracerColor: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  pistol: {
    id: 'pistol',
    name: 'M9 Taktik',
    modelLabel: 'TABANCA',
    caliber: '9x19mm',
    damage: 28,
    fireRateMs: 200,
    reloadMs: 1150,
    magSize: 15,
    reserveMax: 75,
    hipSpread: 0.012,
    adsSpread: 0.003,
    auto: false,
    recoilPitch: 0.016,
    recoilYaw: 0.005,
    adsFov: 58,
    adsPos: [0.0, -0.115, -0.34],
    hipPos: [0.19, -0.19, -0.38],
    accentHex: '#eab308',
    tracerColor: 0xffd266,
  },
  rifle: {
    id: 'rifle',
    name: 'M4A1 Karbina',
    modelLabel: 'PİYADE TÜFEĞİ',
    caliber: '5.56x45mm',
    damage: 32,
    fireRateMs: 98,
    reloadMs: 1550,
    magSize: 30,
    reserveMax: 150,
    hipSpread: 0.016,
    adsSpread: 0.0022,
    auto: true,
    recoilPitch: 0.012,
    recoilYaw: 0.006,
    adsFov: 50,
    adsPos: [0.0, -0.142, -0.32],
    hipPos: [0.22, -0.21, -0.44],
    accentHex: '#f59e0b',
    tracerColor: 0xffcc44,
  },
  shotgun: {
    id: 'shotgun',
    name: 'M870 Taktik',
    modelLabel: 'POMPALI TÜFEK',
    caliber: '12 Gauge',
    damage: 17,
    fireRateMs: 740,
    reloadMs: 1950,
    magSize: 8,
    reserveMax: 48,
    hipSpread: 0.055,
    adsSpread: 0.036,
    auto: false,
    recoilPitch: 0.038,
    recoilYaw: 0.012,
    pellets: 8,
    adsFov: 56,
    adsPos: [0.0, -0.132, -0.34],
    hipPos: [0.22, -0.22, -0.43],
    accentHex: '#f97316',
    tracerColor: 0xff9933,
  },
  sniper: {
    id: 'sniper',
    name: 'AWP L115A3',
    modelLabel: 'KESKİN NİŞANCI',
    caliber: '.338 Lapua',
    damage: 115,
    fireRateMs: 1300,
    reloadMs: 2250,
    magSize: 5,
    reserveMax: 30,
    hipSpread: 0.065,
    adsSpread: 0.0003,
    auto: false,
    recoilPitch: 0.055,
    recoilYaw: 0.014,
    adsFov: 19,
    adsPos: [0.0, -0.145, -0.28],
    hipPos: [0.23, -0.22, -0.46],
    hasScopeOverlay: true,
    accentHex: '#ef4444',
    tracerColor: 0xff6644,
  },
};

export interface BotConfig {
  id: BotClass;
  label: string;
  vestColor: number;
  camoColor: number;
  helmetColor: number;
  speed: number;
  hp: number;
  damage: number;
  fireRate: number;
  range: number;
  accuracy: number;
  cashReward: number;
  scoreReward: number;
  scale: number;
}

export const BOT_TYPES: Record<BotClass, BotConfig> = {
  rusher: {
    id: 'rusher',
    label: 'Hücumcu',
    vestColor: 0x6e2b25,
    camoColor: 0x453e38,
    helmetColor: 0x262626,
    speed: 5.2,
    hp: 80,
    damage: 8,
    fireRate: 0.55,
    range: 28,
    accuracy: 0.42,
    cashReward: 90,
    scoreReward: 100,
    scale: 0.98,
  },
  assault: {
    id: 'assault',
    label: 'Piyade',
    vestColor: 0x3b4732,
    camoColor: 0x4e5243,
    helmetColor: 0x2b3026,
    speed: 3.4,
    hp: 110,
    damage: 10,
    fireRate: 0.85,
    range: 46,
    accuracy: 0.55,
    cashReward: 120,
    scoreReward: 150,
    scale: 1.0,
  },
  sniper: {
    id: 'sniper',
    label: 'Nişancı',
    vestColor: 0x2f3542,
    camoColor: 0x3b3f46,
    helmetColor: 0x1c2026,
    speed: 2.4,
    hp: 85,
    damage: 26,
    fireRate: 2.4,
    range: 85,
    accuracy: 0.82,
    cashReward: 175,
    scoreReward: 220,
    scale: 0.98,
  },
  heavy: {
    id: 'heavy',
    label: 'Ağır Zırhlı',
    vestColor: 0x243447,
    camoColor: 0x2c343d,
    helmetColor: 0x182028,
    speed: 2.3,
    hp: 220,
    damage: 14,
    fireRate: 1.15,
    range: 42,
    accuracy: 0.5,
    cashReward: 240,
    scoreReward: 300,
    scale: 1.12,
  },
};

export interface KillFeedEntry {
  id: number;
  killer: string;
  victim: string;
  headshot: boolean;
  explosive?: boolean;
  melee?: boolean;
  timestamp: number;
}

export interface DamageIndicator {
  id: number;
  angleRad: number;
  intensity: number;
}

export interface WeaponAmmoState {
  mag: number;
  reserve: number;
}

export interface GameSettings {
  sensitivity: number;
  fov: number;
  volume: number;
}

export type MultiplayerMode = 'ffa' | 'tdm' | 'coop';

export type TeamId = 'alpha' | 'bravo' | 'ffa';

export interface RoomSummary {
  id: string;
  name: string;
  mapId: MapId;
  mode: MultiplayerMode;
  playerCount: number;
  maxPlayers: number;
  botCount: number;
  wave: number;
  isDefault?: boolean;
}

export interface RemotePlayerNetState {
  id: string;
  name: string;
  operatorId: OperatorId;
  team: TeamId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouching: boolean;
  weapon: WeaponId;
  hp: number;
  maxHp: number;
  armor: number;
  kills: number;
  deaths: number;
  score: number;
  alive: boolean;
}

export interface NetBotState {
  id: number;
  type: BotClass;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}

export interface ChatMessage {
  id: number;
  sender: string;
  text: string;
  system?: boolean;
  timestamp: number;
}

export interface HudState {
  phase: 'start' | 'playing' | 'paused' | 'armory' | 'dead';
  pointerLocked: boolean;
  isMultiplayer: boolean;
  mpConnected: boolean;
  mpRoom: RoomSummary | null;
  mpTeam: TeamId;
  mpPlayers: RemotePlayerNetState[];
  mpRespawnTimer: number;
  mpChat: ChatMessage[];
  matchConfig: MatchConfig;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  stamina: number;
  breathMeter: number;
  holdingBreath: boolean;
  flashlightOn: boolean;
  stance: 'standing' | 'crouching' | 'sprinting';
  currentWeapon: WeaponId;
  ammoByWeapon: Record<WeaponId, WeaponAmmoState>;
  grenades: number;
  reloading: boolean;
  reloadProgress: number;
  aiming: boolean;
  sniperScoped: boolean;
  crosshairSpread: number;
  hitmarkerType: 'none' | 'body' | 'head' | 'kill';
  damageFlash: number;
  damageIndicators: DamageIndicator[];
  score: number;
  kills: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  wave: number;
  waveBotsAlive: number;
  waveBotsPending: number;
  cash: number;
  bannerText: string | null;
  killfeed: KillFeedEntry[];
  damageBonusLevel: number;
  pickupToast: string | null;
}
