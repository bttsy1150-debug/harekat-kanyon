import * as THREE from 'three';
import { WeaponId } from './types';

export interface WeaponRig {
  id: WeaponId;
  group: THREE.Group;
  slideOrBolt: THREE.Object3D;
  pumpForend?: THREE.Object3D;
  muzzlePoint: THREE.Object3D;
  ejectPoint: THREE.Object3D;
  muzzleFlashMesh: THREE.Mesh;
  muzzleLight: THREE.PointLight;
  slideRestZ: number;
  pumpRestZ?: number;
  sleeveMeshes: THREE.Mesh[];
}

function makeMuzzleFlash(): [THREE.Mesh, THREE.PointLight] {
  const geo = new THREE.ConeGeometry(0.065, 0.22, 6);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffc857,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;

  const light = new THREE.PointLight(0xffaa33, 0, 10, 2);
  return [mesh, light];
}

function addTacticalHands(
  weaponGroup: THREE.Group,
  sleeveMat: THREE.MeshStandardMaterial,
  gloveMat: THREE.MeshStandardMaterial,
  triggerGripPos: [number, number, number],
  supportHandPos: [number, number, number] | null,
  sleeveMeshes: THREE.Mesh[]
) {
  // Primary firing hand + sleeve
  const rightGlove = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.085, 0.075), gloveMat);
  rightGlove.position.set(triggerGripPos[0], triggerGripPos[1], triggerGripPos[2]);
  rightGlove.rotation.x = 0.28;
  weaponGroup.add(rightGlove);

  const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.044, 0.34, 10), sleeveMat);
  rightArm.rotation.x = Math.PI * 0.44;
  rightArm.rotation.z = -0.18;
  rightArm.position.set(triggerGripPos[0] + 0.045, triggerGripPos[1] - 0.055, triggerGripPos[2] + 0.19);
  weaponGroup.add(rightArm);
  sleeveMeshes.push(rightArm);

  // Support hand + forearm (for rifles/shotgun/sniper, or cupped under pistol grip)
  if (supportHandPos) {
    const leftGlove = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.058, 0.085), gloveMat);
    leftGlove.position.set(supportHandPos[0], supportHandPos[1], supportHandPos[2]);
    weaponGroup.add(leftGlove);

    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.044, 0.42, 10), sleeveMat);
    leftArm.rotation.x = Math.PI * 0.42;
    leftArm.rotation.z = 0.48;
    leftArm.position.set(supportHandPos[0] - 0.14, supportHandPos[1] - 0.08, supportHandPos[2] + 0.21);
    weaponGroup.add(leftArm);
    sleeveMeshes.push(leftArm);
  }
}

export function buildAllWeapons(): Record<WeaponId, WeaponRig> {
  const gunmetal = new THREE.MeshStandardMaterial({
    color: 0x22262b,
    metalness: 0.92,
    roughness: 0.24,
  });
  const darkSteel = new THREE.MeshStandardMaterial({
    color: 0x141619,
    metalness: 0.85,
    roughness: 0.34,
  });
  const chromeBolt = new THREE.MeshStandardMaterial({
    color: 0x9fa6ad,
    metalness: 0.96,
    roughness: 0.14,
  });
  const polymer = new THREE.MeshStandardMaterial({
    color: 0x1c1c1e,
    metalness: 0.06,
    roughness: 0.82,
  });
  const tanPolymer = new THREE.MeshStandardMaterial({
    color: 0x5c5343,
    metalness: 0.06,
    roughness: 0.78,
  });
  const oliveStock = new THREE.MeshStandardMaterial({
    color: 0x3a4633,
    metalness: 0.08,
    roughness: 0.74,
  });
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: 0x3b4432,
    metalness: 0.04,
    roughness: 0.88,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x171717,
    metalness: 0.08,
    roughness: 0.76,
  });
  const opticGlass = new THREE.MeshPhysicalMaterial({
    color: 0x33aaee,
    metalness: 0.1,
    roughness: 0.08,
    transparent: true,
    opacity: 0.45,
    clearcoat: 1.0,
  });
  const tritiumGreen = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
  const redDotMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

  // 1. PISTOL (M9 Tactical)
  const pistolGroup = new THREE.Group();
  const pSleeves: THREE.Mesh[] = [];
  const pFrame = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.032, 0.2), polymer);
  pFrame.position.set(0, -0.005, -0.05);
  pistolGroup.add(pFrame);

  const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.11, 0.048), polymer);
  pGrip.position.set(0, -0.065, 0.025);
  pGrip.rotation.x = 0.24;
  pistolGroup.add(pGrip);

  const pGuard = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.028, 0.05), polymer);
  pGuard.position.set(0, -0.032, -0.03);
  pistolGroup.add(pGuard);

  const pSlide = new THREE.Group();
  const pSlideBody = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.036, 0.22), gunmetal);
  pSlideBody.position.set(0, 0.024, -0.05);
  pSlide.add(pSlideBody);
  const pRearSightL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.01, 0.012), darkSteel);
  pRearSightL.position.set(-0.01, 0.046, 0.045);
  pSlide.add(pRearSightL);
  const pRearSightR = pRearSightL.clone();
  pRearSightR.position.x = 0.01;
  pSlide.add(pRearSightR);
  const pFrontSight = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.012, 0.01), darkSteel);
  pFrontSight.position.set(0, 0.046, -0.145);
  pSlide.add(pFrontSight);
  const pDot = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.003), tritiumGreen);
  pDot.position.set(0, 0.049, -0.14);
  pSlide.add(pDot);
  pistolGroup.add(pSlide);

  const pBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.22, 12), chromeBolt);
  pBarrel.rotation.x = Math.PI / 2;
  pBarrel.position.set(0, 0.023, -0.065);
  pistolGroup.add(pBarrel);

  addTacticalHands(pistolGroup, sleeveMat, gloveMat, [0, -0.06, 0.03], [-0.01, -0.075, 0.02], pSleeves);

  const pMuzzle = new THREE.Object3D();
  pMuzzle.position.set(0, 0.023, -0.185);
  pistolGroup.add(pMuzzle);
  const pEject = new THREE.Object3D();
  pEject.position.set(0.024, 0.035, -0.03);
  pistolGroup.add(pEject);
  const [pFlash, pLight] = makeMuzzleFlash();
  pFlash.position.copy(pMuzzle.position);
  pLight.position.copy(pMuzzle.position);
  pistolGroup.add(pFlash, pLight);

  // 2. RIFLE (M4A1 Carbine)
  const rifleGroup = new THREE.Group();
  const rSleeves: THREE.Mesh[] = [];
  const rUpper = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.062, 0.28), gunmetal);
  rUpper.position.set(0, 0.015, -0.03);
  rifleGroup.add(rUpper);

  const rLower = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.045, 0.22), darkSteel);
  rLower.position.set(0, -0.025, 0.0);
  rifleGroup.add(rLower);

  const rHandguard = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.056, 0.25), tanPolymer);
  rHandguard.position.set(0, 0.016, -0.29);
  rifleGroup.add(rHandguard);

  const rRail = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.48), darkSteel);
  rRail.position.set(0, 0.05, -0.15);
  rifleGroup.add(rRail);

  const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.36, 12), darkSteel);
  rBarrel.rotation.x = Math.PI / 2;
  rBarrel.position.set(0, 0.018, -0.52);
  rifleGroup.add(rBarrel);

  const rFlashHider = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.055, 8), gunmetal);
  rFlashHider.rotation.x = Math.PI / 2;
  rFlashHider.position.set(0, 0.018, -0.71);
  rifleGroup.add(rFlashHider);

  const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.068), tanPolymer);
  rMag.position.set(0, -0.1, -0.055);
  rMag.rotation.x = -0.16;
  rifleGroup.add(rMag);

  const rGrip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.11, 0.046), polymer);
  rGrip.position.set(0, -0.08, 0.075);
  rGrip.rotation.x = 0.28;
  rifleGroup.add(rGrip);

  const rForegrip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.085, 10), polymer);
  rForegrip.position.set(0, -0.052, -0.3);
  rifleGroup.add(rForegrip);

  const rStock = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.105, 0.22), polymer);
  rStock.position.set(0, -0.01, 0.21);
  rifleGroup.add(rStock);

  const rHoloHousing = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.046, 0.068), darkSteel);
  rHoloHousing.position.set(0, 0.075, -0.05);
  rifleGroup.add(rHoloHousing);
  const rHoloLens = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.03), opticGlass);
  rHoloLens.position.set(0, 0.078, -0.017);
  rifleGroup.add(rHoloLens);
  const rDot = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 8), redDotMat);
  rDot.position.set(0, 0.078, -0.05);
  rifleGroup.add(rDot);

  const rBolt = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.07), chromeBolt);
  rBolt.position.set(0.025, 0.02, -0.02);
  rifleGroup.add(rBolt);

  addTacticalHands(rifleGroup, sleeveMat, gloveMat, [0, -0.07, 0.075], [-0.01, -0.038, -0.3], rSleeves);

  const rMuzzle = new THREE.Object3D();
  rMuzzle.position.set(0, 0.018, -0.75);
  rifleGroup.add(rMuzzle);
  const rEject = new THREE.Object3D();
  rEject.position.set(0.034, 0.022, -0.02);
  rifleGroup.add(rEject);
  const [rFlash, rLight] = makeMuzzleFlash();
  rFlash.position.copy(rMuzzle.position);
  rLight.position.copy(rMuzzle.position);
  rifleGroup.add(rFlash, rLight);

  // 3. SHOTGUN (M870 Tactical)
  const shotGroup = new THREE.Group();
  const sSleeves: THREE.Mesh[] = [];
  const sRec = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.072, 0.24), gunmetal);
  sRec.position.set(0, 0.0, -0.04);
  shotGroup.add(sRec);

  const sBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.56, 12), darkSteel);
  sBarrel.rotation.x = Math.PI / 2;
  sBarrel.position.set(0, 0.022, -0.42);
  shotGroup.add(sBarrel);

  const sTube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.48, 10), gunmetal);
  sTube.rotation.x = Math.PI / 2;
  sTube.position.set(0, -0.012, -0.38);
  shotGroup.add(sTube);

  const sPump = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.18, 12), polymer);
  sPump.rotation.x = Math.PI / 2;
  sPump.position.set(0, -0.014, -0.32);
  shotGroup.add(sPump);

  const sStock = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.1, 0.26), polymer);
  sStock.position.set(0, -0.035, 0.19);
  sStock.rotation.x = 0.15;
  shotGroup.add(sStock);

  const sGhostRing = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 16), darkSteel);
  sGhostRing.position.set(0, 0.05, 0.04);
  shotGroup.add(sGhostRing);
  const sBead = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 8), tritiumGreen);
  sBead.position.set(0, 0.045, -0.68);
  shotGroup.add(sBead);

  const sBolt = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.024, 0.075), chromeBolt);
  sBolt.position.set(0.026, 0.01, -0.04);
  shotGroup.add(sBolt);

  addTacticalHands(shotGroup, sleeveMat, gloveMat, [0, -0.05, 0.09], [-0.01, -0.03, -0.32], sSleeves);

  const sMuzzle = new THREE.Object3D();
  sMuzzle.position.set(0, 0.022, -0.71);
  shotGroup.add(sMuzzle);
  const sEject = new THREE.Object3D();
  sEject.position.set(0.034, 0.01, -0.04);
  shotGroup.add(sEject);
  const [sFlash, sLight] = makeMuzzleFlash();
  sFlash.scale.setScalar(1.35);
  sFlash.position.copy(sMuzzle.position);
  sLight.position.copy(sMuzzle.position);
  shotGroup.add(sFlash, sLight);

  // 4. SNIPER (AWP L115A3)
  const sniperGroup = new THREE.Group();
  const nSleeves: THREE.Mesh[] = [];
  const nChassis = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.068, 0.56), oliveStock);
  nChassis.position.set(0, -0.008, -0.08);
  sniperGroup.add(nChassis);

  const nButt = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.11, 0.24), oliveStock);
  nButt.position.set(0, -0.022, 0.24);
  sniperGroup.add(nButt);

  const nBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.019, 0.64, 14), darkSteel);
  nBarrel.rotation.x = Math.PI / 2;
  nBarrel.position.set(0, 0.022, -0.58);
  sniperGroup.add(nBarrel);

  const nBrake = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.032, 0.07), gunmetal);
  nBrake.position.set(0, 0.022, -0.92);
  sniperGroup.add(nBrake);

  const nMag = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.09, 0.085), darkSteel);
  nMag.position.set(0, -0.075, -0.06);
  sniperGroup.add(nMag);

  const nScopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 16), darkSteel);
  nScopeTube.rotation.x = Math.PI / 2;
  nScopeTube.position.set(0, 0.075, -0.08);
  sniperGroup.add(nScopeTube);

  const nScopeFront = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.024, 0.07, 16), darkSteel);
  nScopeFront.rotation.x = Math.PI / 2;
  nScopeFront.position.set(0, 0.075, -0.25);
  sniperGroup.add(nScopeFront);

  const nScopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 16), opticGlass);
  nScopeLens.position.set(0, 0.075, 0.072);
  sniperGroup.add(nScopeLens);

  const nBoltHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.045, 8), chromeBolt);
  nBoltHandle.rotation.z = Math.PI / 2;
  nBoltHandle.position.set(0.035, 0.022, 0.01);
  sniperGroup.add(nBoltHandle);

  const nBipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 8), darkSteel);
  nBipodL.rotation.x = Math.PI / 2;
  nBipodL.position.set(-0.026, -0.045, -0.44);
  sniperGroup.add(nBipodL);
  const nBipodR = nBipodL.clone();
  nBipodR.position.x = 0.026;
  sniperGroup.add(nBipodR);

  addTacticalHands(sniperGroup, sleeveMat, gloveMat, [0, -0.055, 0.09], [-0.01, -0.03, -0.26], nSleeves);

  const nMuzzle = new THREE.Object3D();
  nMuzzle.position.set(0, 0.022, -0.96);
  sniperGroup.add(nMuzzle);
  const nEject = new THREE.Object3D();
  nEject.position.set(0.035, 0.028, -0.02);
  sniperGroup.add(nEject);
  const [nFlash, nLight] = makeMuzzleFlash();
  nFlash.scale.setScalar(1.5);
  nFlash.position.copy(nMuzzle.position);
  nLight.position.copy(nMuzzle.position);
  sniperGroup.add(nFlash, nLight);

  return {
    pistol: {
      id: 'pistol',
      group: pistolGroup,
      slideOrBolt: pSlide,
      muzzlePoint: pMuzzle,
      ejectPoint: pEject,
      muzzleFlashMesh: pFlash,
      muzzleLight: pLight,
      slideRestZ: 0,
      sleeveMeshes: pSleeves,
    },
    rifle: {
      id: 'rifle',
      group: rifleGroup,
      slideOrBolt: rBolt,
      muzzlePoint: rMuzzle,
      ejectPoint: rEject,
      muzzleFlashMesh: rFlash,
      muzzleLight: rLight,
      slideRestZ: -0.02,
      sleeveMeshes: rSleeves,
    },
    shotgun: {
      id: 'shotgun',
      group: shotGroup,
      slideOrBolt: sBolt,
      pumpForend: sPump,
      muzzlePoint: sMuzzle,
      ejectPoint: sEject,
      muzzleFlashMesh: sFlash,
      muzzleLight: sLight,
      slideRestZ: -0.04,
      pumpRestZ: -0.32,
      sleeveMeshes: sSleeves,
    },
    sniper: {
      id: 'sniper',
      group: sniperGroup,
      slideOrBolt: nBoltHandle,
      muzzlePoint: nMuzzle,
      ejectPoint: nEject,
      muzzleFlashMesh: nFlash,
      muzzleLight: nLight,
      slideRestZ: 0.01,
      sleeveMeshes: nSleeves,
    },
  };
}
