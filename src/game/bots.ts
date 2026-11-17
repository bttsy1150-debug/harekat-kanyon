import * as THREE from 'three';
import { BotClass, BotConfig, BOT_TYPES, DifficultyConfig } from './types';

export interface BotEntity {
  id: number;
  type: BotClass;
  cfg: BotConfig;
  model: THREE.Group;
  hitParts: THREE.Mesh[];
  pivots: {
    armL: THREE.Group;
    armR: THREE.Group;
    legL: THREE.Group;
    legR: THREE.Group;
  };
  muzzlePoint: THREE.Object3D;
  muzzleFlash: THREE.Mesh;
  sniperLaser?: THREE.Line;
  hp: number;
  maxHp: number;
  alive: boolean;
  dying: boolean;
  deathTimer: number;
  deathTiltDir: THREE.Vector3;
  shootCooldown: number;
  burstRemaining: number;
  burstDelay: number;
  patrolTarget: THREE.Vector3;
  strafeDir: number;
  strafeTimer: number;
  alertTimer: number;
  walkPhase: number;
  flashTimer: number;
}

export function createSoldierModel(botId: number, cfg: BotConfig): {
  group: THREE.Group;
  hitParts: THREE.Mesh[];
  pivots: BotEntity['pivots'];
  muzzlePoint: THREE.Object3D;
  muzzleFlash: THREE.Mesh;
  sniperLaser?: THREE.Line;
} {
  const group = new THREE.Group();
  group.scale.setScalar(cfg.scale);

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc99c78, roughness: 0.72, metalness: 0.02 });
  const camoMat = new THREE.MeshStandardMaterial({ color: cfg.camoColor, roughness: 0.86, metalness: 0.04 });
  const vestMat = new THREE.MeshStandardMaterial({ color: cfg.vestColor, roughness: 0.76, metalness: 0.12 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: cfg.helmetColor, roughness: 0.55, metalness: 0.25 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x1a1917, roughness: 0.85, metalness: 0.08 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.3, metalness: 0.85 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: cfg.id === 'sniper' ? 0xef4444 : cfg.id === 'heavy' ? 0x38bdf8 : 0x111827,
    emissive: cfg.id === 'sniper' ? 0x450a0a : 0x000000,
    roughness: 0.15,
    metalness: 0.8,
  });

  const hitParts: THREE.Mesh[] = [];
  const tag = (mesh: THREE.Mesh, zone: 'head' | 'torso' | 'limb') => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.botId = botId;
    mesh.userData.hitZone = zone;
    hitParts.push(mesh);
    return mesh;
  };

  // Hips / tactical belt (bottom-center grounded at y=0 via legs)
  const hips = tag(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.26), camoMat), 'torso');
  hips.position.y = 0.92;
  group.add(hips);

  // Torso + Tactical Plate Carrier Vest
  const torso = tag(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.54, 0.26), camoMat), 'torso');
  torso.position.y = 1.28;
  group.add(torso);

  const vest = tag(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.44, 0.31), vestMat), 'torso');
  vest.position.set(0, 1.29, 0.01);
  group.add(vest);

  // Chest mag pouches + backpack
  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.06), vestMat);
  pouch.position.set(0, 1.22, -0.17);
  group.add(pouch);

  const pack = tag(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.16), vestMat), 'torso');
  pack.position.set(0, 1.31, 0.21);
  group.add(pack);

  // Heavy shoulder pads
  if (cfg.id === 'heavy') {
    const padL = tag(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.28), helmetMat), 'torso');
    padL.position.set(-0.32, 1.48, 0);
    group.add(padL);
    const padR = padL.clone();
    padR.position.x = 0.32;
    tag(padR, 'torso');
    group.add(padR);
  }

  // Head + Balaclava + Helmet + Tactical Goggles
  const head = tag(new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12), skinMat), 'head');
  head.position.y = 1.69;
  group.add(head);

  const mask = tag(
    new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.145, 0.14, 12), bootMat),
    'head'
  );
  mask.position.y = 1.63;
  group.add(mask);

  const helmet = tag(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.178, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
      helmetMat
    ),
    'head'
  );
  helmet.position.y = 1.72;
  group.add(helmet);

  const visor = tag(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.065, 0.08), visorMat), 'head');
  visor.position.set(0, 1.71, -0.145);
  group.add(visor);

  // Legs with Boots
  const legPivotL = new THREE.Group();
  legPivotL.position.set(-0.12, 0.85, 0);
  group.add(legPivotL);
  const thighL = tag(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.44, 0.18), camoMat), 'limb');
  thighL.position.y = -0.22;
  legPivotL.add(thighL);
  const shinL = tag(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.34, 0.16), camoMat), 'limb');
  shinL.position.y = -0.58;
  legPivotL.add(shinL);
  const bootL = tag(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.24), bootMat), 'limb');
  bootL.position.set(0, -0.79, -0.03);
  legPivotL.add(bootL);

  const legPivotR = new THREE.Group();
  legPivotR.position.set(0.12, 0.85, 0);
  group.add(legPivotR);
  const thighR = tag(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.44, 0.18), camoMat), 'limb');
  thighR.position.y = -0.22;
  legPivotR.add(thighR);
  const shinR = tag(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.34, 0.16), camoMat), 'limb');
  shinR.position.y = -0.58;
  legPivotR.add(shinR);
  const bootR = tag(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.24), bootMat), 'limb');
  bootR.position.set(0, -0.79, -0.03);
  legPivotR.add(bootR);

  // Arms + Weapon mounted on right arm pivot
  const armPivotL = new THREE.Group();
  armPivotL.position.set(-0.29, 1.48, 0);
  group.add(armPivotL);
  const armL = tag(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, 0.14), camoMat), 'limb');
  armL.position.set(0.04, -0.2, -0.14);
  armL.rotation.x = 0.72;
  armL.rotation.z = -0.22;
  armPivotL.add(armL);

  const armPivotR = new THREE.Group();
  armPivotR.position.set(0.29, 1.48, 0);
  group.add(armPivotR);
  const armR = tag(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, 0.14), camoMat), 'limb');
  armR.position.set(-0.02, -0.22, -0.12);
  armR.rotation.x = 0.82;
  armPivotR.add(armR);

  // Bot Weapon
  const gunLen = cfg.id === 'sniper' ? 0.92 : cfg.id === 'heavy' ? 0.72 : 0.56;
  const botGun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, gunLen), gunMat);
  botGun.position.set(-0.04, -0.26, -0.34);
  botGun.castShadow = true;
  armPivotR.add(botGun);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(-0.04, -0.25, -0.34 - gunLen * 0.52);
  armPivotR.add(muzzlePoint);

  const muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0.9 })
  );
  muzzleFlash.position.copy(muzzlePoint.position);
  muzzleFlash.visible = false;
  armPivotR.add(muzzleFlash);

  let sniperLaser: THREE.Line | undefined;
  if (cfg.id === 'sniper') {
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    const laserMat = new THREE.LineBasicMaterial({
      color: 0xff2222,
      transparent: true,
      opacity: 0.38,
    });
    sniperLaser = new THREE.Line(laserGeo, laserMat);
    sniperLaser.visible = false;
    group.add(sniperLaser);
  }

  return {
    group,
    hitParts,
    pivots: { armL: armPivotL, armR: armPivotR, legL: legPivotL, legR: legPivotR },
    muzzlePoint,
    muzzleFlash,
    sniperLaser,
  };
}

export function pickBotClassForWave(wave: number): BotClass {
  const r = Math.random();
  if (wave === 1) {
    return r < 0.45 ? 'rusher' : 'assault';
  }
  if (wave === 2) {
    return r < 0.3 ? 'rusher' : r < 0.75 ? 'assault' : 'sniper';
  }
  if (r < 0.26) return 'rusher';
  if (r < 0.62) return 'assault';
  if (r < 0.82) return 'sniper';
  return 'heavy';
}

export function getBotConfig(type: BotClass, wave: number, diff: DifficultyConfig): BotConfig {
  const base = BOT_TYPES[type];
  return {
    ...base,
    hp: Math.round((base.hp + (wave - 1) * 14) * diff.botHpMult),
    damage: Math.round(base.damage * diff.botDmgMult),
    fireRate: base.fireRate * diff.botFireRateMult,
    accuracy: Math.max(0.18, Math.min(0.92, base.accuracy + (wave - 1) * 0.025 + diff.botAccBonus)),
    cashReward: Math.round(base.cashReward * diff.cashMult),
  };
}
