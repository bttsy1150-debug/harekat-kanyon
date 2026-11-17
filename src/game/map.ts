import * as THREE from 'three';
import { ProceduralTextureSet } from './textures';
import { MapId } from './types';

export interface ObstacleBox {
  box: THREE.Box3;
  mesh: THREE.Object3D;
  blocksSight: boolean;
  materialKind: 'concrete' | 'metal' | 'wood';
}

export interface ExplosiveBarrel {
  id: number;
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  position: THREE.Vector3;
  hp: number;
  exploded: boolean;
  respawnTimer: number;
}

export interface MapRect {
  x: number;
  z: number;
  w: number;
  d: number;
  kind: 'building' | 'container' | 'cover';
}

export interface SupplySpawn {
  position: THREE.Vector3;
  kind: 'medkit' | 'ammo';
}

export interface MapBuildResult {
  obstacles: ObstacleBox[];
  raycastWallMeshes: THREE.Object3D[];
  barrels: ExplosiveBarrel[];
  mapRects: MapRect[];
  supplySpawns: SupplySpawn[];
  coverPoints: THREE.Vector3[];
  groundHeightAt: (x: number, z: number) => number;
}

export function groundHeightAt(x: number, z: number, mapId: MapId): number {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  const edge = Math.max(ax, az);
  if (edge <= 88) return 0;
  const dist = edge - 88;
  if (mapId === 'night_port') {
    // Sea-level drop beyond dock seawall
    return Math.max(-2.2, -dist * 0.45);
  }
  const amp = mapId === 'snow_outpost' ? 0.44 : 0.34;
  const ridge =
    Math.sin(x * 0.045) * Math.cos(z * 0.045) * 4.2 +
    Math.sin(x * 0.11 + z * 0.08) * 1.7;
  return Math.min(34, dist * amp + Math.max(0, ridge));
}

export function buildMapEnvironment(
  mapRoot: THREE.Group,
  textures: ProceduralTextureSet,
  mapId: MapId,
  isSoftwareGl: boolean
): MapBuildResult {
  const obstacles: ObstacleBox[] = [];
  const raycastWallMeshes: THREE.Object3D[] = [];
  const barrels: ExplosiveBarrel[] = [];
  const mapRects: MapRect[] = [];
  const coverPoints: THREE.Vector3[] = [];

  // 1. Continuous Terrain Mesh
  const terrainGeo = new THREE.PlaneGeometry(520, 520, 96, 96);
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);

  const cBase = new THREE.Color(
    mapId === 'night_port' ? 0x626a75 : mapId === 'snow_outpost' ? 0xeef5fc : 0x8d816c
  );
  const cMid = new THREE.Color(
    mapId === 'night_port' ? 0x2a333f : mapId === 'snow_outpost' ? 0xc2d2e3 : 0x6e5b47
  );
  const cHigh = new THREE.Color(
    mapId === 'night_port' ? 0x16202b : mapId === 'snow_outpost' ? 0x7a8ca0 : 0x574839
  );
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const h = groundHeightAt(x, z, mapId);
    posAttr.setY(i, h);

    if (mapId === 'night_port') {
      tmpColor.copy(h < -0.2 ? cMid : cBase);
    } else if (h <= 0.05) {
      tmpColor.copy(cBase);
    } else if (h < 12) {
      tmpColor.copy(cBase).lerp(cMid, h / 12);
    } else {
      tmpColor.copy(cMid).lerp(cHigh, Math.min(1, (h - 12) / 16));
    }
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    map:
      mapId === 'night_port'
        ? textures.asphaltColor
        : mapId === 'snow_outpost'
        ? textures.snowColor
        : textures.groundColor,
    bumpMap:
      mapId === 'night_port'
        ? textures.asphaltBump
        : mapId === 'snow_outpost'
        ? textures.snowBump
        : textures.groundBump,
    bumpScale: mapId === 'night_port' ? 0.05 : 0.08,
    vertexColors: true,
    roughness: mapId === 'night_port' ? 0.36 : mapId === 'snow_outpost' ? 0.85 : 0.92,
    metalness: mapId === 'night_port' ? 0.22 : 0.04,
  });
  const groundMesh = new THREE.Mesh(terrainGeo, groundMat);
  groundMesh.receiveShadow = true;
  mapRoot.add(groundMesh);

  // Harbor dark reflective water beyond Night Port dock
  if (mapId === 'night_port') {
    const waterGeo = new THREE.PlaneGeometry(540, 540);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0b1624,
      roughness: 0.14,
      metalness: 0.72,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = -1.2;
    mapRoot.add(water);
  }

  // Central concrete pad
  const padMat = new THREE.MeshStandardMaterial({
    map: textures.concreteColor,
    bumpMap: textures.concreteBump,
    bumpScale: 0.04,
    color: mapId === 'night_port' ? 0x454a52 : mapId === 'snow_outpost' ? 0x9aa4ae : 0x706c64,
    roughness: mapId === 'night_port' ? 0.42 : 0.88,
    metalness: mapId === 'night_port' ? 0.18 : 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const centralPad = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), padMat);
  centralPad.rotation.x = -Math.PI / 2;
  centralPad.position.y = 0.02;
  centralPad.receiveShadow = true;
  mapRoot.add(centralPad);

  // Shared PBR Materials
  const concreteMat = new THREE.MeshStandardMaterial({
    map: textures.concreteColor,
    bumpMap: textures.concreteBump,
    bumpScale: 0.06,
    color: mapId === 'snow_outpost' ? 0xcfd6de : 0xffffff,
    roughness: 0.86,
    metalness: 0.05,
  });
  const darkConcreteMat = new THREE.MeshStandardMaterial({
    map: textures.concreteColor,
    bumpMap: textures.concreteBump,
    bumpScale: 0.05,
    color: mapId === 'night_port' ? 0x484c52 : 0x625f58,
    roughness: 0.88,
    metalness: 0.06,
  });
  const crateMat = new THREE.MeshStandardMaterial({
    map: textures.crateColor,
    bumpMap: textures.crateBump,
    bumpScale: 0.05,
    roughness: 0.78,
    metalness: 0.06,
  });
  const containerOliveMat = new THREE.MeshStandardMaterial({
    map: textures.containerOlive,
    bumpMap: textures.containerBump,
    bumpScale: 0.08,
    roughness: 0.52,
    metalness: 0.65,
  });
  const containerRustMat = new THREE.MeshStandardMaterial({
    map: textures.containerRust,
    bumpMap: textures.containerBump,
    bumpScale: 0.08,
    roughness: 0.58,
    metalness: 0.6,
  });
  const containerBlueMat = new THREE.MeshStandardMaterial({
    map: textures.containerOlive,
    bumpMap: textures.containerBump,
    bumpScale: 0.08,
    color: 0x3a648c,
    roughness: 0.45,
    metalness: 0.7,
  });
  const steelFrameMat = new THREE.MeshStandardMaterial({
    color: 0x2c3034,
    roughness: 0.4,
    metalness: 0.86,
  });
  const sandbagMat = new THREE.MeshStandardMaterial({
    map: mapId === 'snow_outpost' ? textures.snowColor : textures.sandbagColor,
    roughness: 0.94,
    metalness: 0.02,
  });

  function addSolidBox(
    x: number,
    yBottom: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    materialKind: 'concrete' | 'metal' | 'wood',
    mapKind?: 'building' | 'container' | 'cover',
    blocksSight = true
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, yBottom + h / 2, z);
    mesh.castShadow = !isSoftwareGl || h >= 2;
    mesh.receiveShadow = true;
    mesh.userData.materialKind = materialKind;
    mapRoot.add(mesh);

    const box = new THREE.Box3().setFromObject(mesh);
    obstacles.push({ box, mesh, blocksSight, materialKind });
    raycastWallMeshes.push(mesh);

    if (mapKind) {
      mapRects.push({ x, z, w, d, kind: mapKind });
    }
    return mesh;
  }

  // 2. Perimeter Bastions / Seawall
  const wallHeight = mapId === 'night_port' ? 3.4 : 4.4;
  const wallSegments: Array<[number, number, number, number]> = [
    [-55, -86, 62, 2.2],
    [0, -86, 36, 2.2],
    [55, -86, 62, 2.2],
    [-55, 86, 62, 2.2],
    [0, 86, 36, 2.2],
    [55, 86, 62, 2.2],
    [-86, -55, 2.2, 62],
    [-86, 0, 2.2, 36],
    [-86, 55, 2.2, 62],
    [86, -55, 2.2, 62],
    [86, 0, 2.2, 36],
    [86, 55, 2.2, 62],
  ];
  wallSegments.forEach(([x, z, w, d]) => {
    addSolidBox(x, 0, z, w, wallHeight, d, concreteMat, 'concrete', 'building');
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.35, d + 0.35), darkConcreteMat);
    cap.position.set(x, wallHeight + 0.15, z);
    cap.castShadow = true;
    cap.receiveShadow = true;
    mapRoot.add(cap);
  });

  // Corner Guard Bunkers
  const corners: Array<[number, number]> = [
    [-84, -84],
    [84, -84],
    [-84, 84],
    [84, 84],
  ];
  corners.forEach(([cx, cz]) => {
    addSolidBox(cx, 0, cz, 8, 6.5, 8, darkConcreteMat, 'concrete', 'building');
    const roof = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.5, 9.2), concreteMat);
    roof.position.set(cx, 6.75, cz);
    roof.castShadow = true;
    roof.receiveShadow = true;
    mapRoot.add(roof);
  });

  // 3. Central Structure (Map-Specific Layout)
  if (mapId === 'night_port') {
    // Port Logistics Office + Overhead Crane Gantry
    addSolidBox(-9, 0, -14, 1.5, 4.8, 12, darkConcreteMat, 'concrete', 'building');
    addSolidBox(9, 0, -14, 1.5, 4.8, 12, darkConcreteMat, 'concrete', 'building');
    addSolidBox(-4.8, 0, -20, 7.2, 4.8, 1.5, darkConcreteMat, 'concrete', 'building');
    addSolidBox(4.8, 0, -20, 7.2, 4.8, 1.5, darkConcreteMat, 'concrete', 'building');
    const roof = new THREE.Mesh(new THREE.BoxGeometry(19.6, 0.6, 14), steelFrameMat);
    roof.position.set(0, 5.1, -14);
    roof.castShadow = true;
    roof.receiveShadow = true;
    mapRoot.add(roof);

    // Tall Industrial Gantry Crane Bridge
    const craneMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.45, metalness: 0.7 });
    const legCoords: Array<[number, number]> = [
      [-18, -6],
      [18, -6],
      [-18, 12],
      [18, 12],
    ];
    legCoords.forEach(([lx, lz]) => {
      addSolidBox(lx, 0, lz, 1.6, 13.5, 1.6, craneMat, 'metal', 'building');
    });
    const beam1 = new THREE.Mesh(new THREE.BoxGeometry(39, 1.6, 2.2), craneMat);
    beam1.position.set(0, 14.1, 3);
    beam1.castShadow = true;
    mapRoot.add(beam1);
  } else {
    // Central Command Bunker (Canyon & Snow Outpost)
    addSolidBox(-7, 0, -14, 1.5, 4.8, 12, concreteMat, 'concrete', 'building');
    addSolidBox(7, 0, -14, 1.5, 4.8, 12, concreteMat, 'concrete', 'building');
    addSolidBox(-3.8, 0, -20, 6.4, 4.8, 1.5, concreteMat, 'concrete', 'building');
    addSolidBox(3.8, 0, -20, 6.4, 4.8, 1.5, concreteMat, 'concrete', 'building');
    addSolidBox(-4.2, 0, -8, 5.2, 4.8, 1.5, concreteMat, 'concrete', 'building');
    addSolidBox(4.2, 0, -8, 5.2, 4.8, 1.5, concreteMat, 'concrete', 'building');

    const bunkerRoof = new THREE.Mesh(new THREE.BoxGeometry(16.4, 0.65, 14.2), darkConcreteMat);
    bunkerRoof.position.set(0, 5.1, -14);
    bunkerRoof.castShadow = true;
    bunkerRoof.receiveShadow = true;
    bunkerRoof.userData.materialKind = 'concrete';
    mapRoot.add(bunkerRoof);
    raycastWallMeshes.push(bunkerRoof);

    // Snow roof layer for Snow Outpost
    if (mapId === 'snow_outpost') {
      const snowCap = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.28, 14.4), sandbagMat);
      snowCap.position.set(0, 5.55, -14);
      snowCap.receiveShadow = true;
      mapRoot.add(snowCap);
    }

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 7.5, 8), steelFrameMat);
    mast.position.set(5.5, 9.1, -16);
    mast.castShadow = true;
    mapRoot.add(mast);
    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.45, 16), steelFrameMat);
    dish.rotation.x = Math.PI * 0.65;
    dish.position.set(5.5, 11.4, -15.6);
    mapRoot.add(dish);
  }

  // 4. Shipping Containers / Mountain Cabins
  const containers =
    mapId === 'night_port'
      ? [
          { x: -30, y: 0, z: -26, w: 3.4, h: 3.2, d: 9.2, mat: containerBlueMat },
          { x: -30, y: 3.2, z: -26, w: 3.4, h: 3.2, d: 9.2, mat: containerRustMat },
          { x: -20, y: 0, z: -36, w: 9.2, h: 3.2, d: 3.4, mat: containerOliveMat },
          { x: -38, y: 0, z: 12, w: 3.4, h: 3.2, d: 9.2, mat: containerBlueMat },
          { x: 30, y: 0, z: -24, w: 9.2, h: 3.2, d: 3.4, mat: containerRustMat },
          { x: 30, y: 3.2, z: -24, w: 9.2, h: 3.2, d: 3.4, mat: containerBlueMat },
          { x: 35, y: 0, z: 18, w: 3.4, h: 3.2, d: 9.2, mat: containerOliveMat },
          { x: 24, y: 0, z: 32, w: 9.2, h: 3.2, d: 3.4, mat: containerBlueMat },
          { x: -26, y: 0, z: 38, w: 9.2, h: 3.2, d: 3.4, mat: containerRustMat },
          { x: 0, y: 0, z: 46, w: 9.2, h: 3.2, d: 3.4, mat: containerOliveMat },
        ]
      : [
          { x: -32, y: 0, z: -26, w: 3.4, h: 3.2, d: 9.2, mat: containerOliveMat },
          { x: -32, y: 3.2, z: -26, w: 3.4, h: 3.2, d: 9.2, mat: containerRustMat },
          { x: -24, y: 0, z: -34, w: 9.2, h: 3.2, d: 3.4, mat: containerRustMat },
          { x: -38, y: 0, z: 14, w: 3.4, h: 3.2, d: 9.2, mat: containerOliveMat },
          { x: 30, y: 0, z: -24, w: 9.2, h: 3.2, d: 3.4, mat: containerOliveMat },
          { x: 35, y: 0, z: 18, w: 3.4, h: 3.2, d: 9.2, mat: containerRustMat },
          { x: 35, y: 3.2, z: 18, w: 3.4, h: 3.2, d: 9.2, mat: containerOliveMat },
          { x: 24, y: 0, z: 32, w: 9.2, h: 3.2, d: 3.4, mat: containerOliveMat },
          { x: -26, y: 0, z: 38, w: 9.2, h: 3.2, d: 3.4, mat: containerRustMat },
        ];

  containers.forEach((c) => {
    addSolidBox(c.x, c.y, c.z, c.w, c.h, c.d, c.mat, 'metal', 'container');
    const trim = new THREE.Mesh(new THREE.BoxGeometry(c.w + 0.08, 0.22, c.d + 0.08), steelFrameMat);
    trim.position.set(c.x, c.y + c.h - 0.11, c.z);
    mapRoot.add(trim);
  });

  // 5. Watchtowers & Floodlight Towers
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: mapId === 'night_port' ? 0xdbeafe : 0xfef3c7 });
  function buildTower(tx: number, tz: number, addFloodLight: boolean) {
    const legGeo = new THREE.CylinderGeometry(0.14, 0.16, 6.2, 8);
    [
      [-2.1, -2.1],
      [2.1, -2.1],
      [-2.1, 2.1],
      [2.1, 2.1],
    ].forEach(([ox, oz]) => {
      const leg = new THREE.Mesh(legGeo, steelFrameMat);
      leg.position.set(tx + ox, 3.1, tz + oz);
      leg.castShadow = true;
      mapRoot.add(leg);
    });
    addSolidBox(tx, 5.8, tz, 5.2, 0.45, 5.2, steelFrameMat, 'metal', 'building', false);
    addSolidBox(tx, 6.25, tz - 2.4, 5.2, 1.1, 0.22, steelFrameMat, 'metal', undefined, false);
    addSolidBox(tx, 6.25, tz + 2.4, 5.2, 1.1, 0.22, steelFrameMat, 'metal', undefined, false);
    addSolidBox(tx - 2.4, 6.25, tz, 0.22, 1.1, 5.2, steelFrameMat, 'metal', undefined, false);
    addSolidBox(tx + 2.4, 6.25, tz, 0.22, 1.1, 5.2, steelFrameMat, 'metal', undefined, false);

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.28, 5.6), containerOliveMat);
    canopy.position.set(tx, 8.9, tz);
    canopy.castShadow = true;
    mapRoot.add(canopy);

    if (addFloodLight) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.5), lampHeadMat);
      lamp.position.set(tx, 8.6, tz);
      mapRoot.add(lamp);

      const flood = new THREE.PointLight(
        mapId === 'night_port' ? 0x9ec5ff : 0xffdfaa,
        mapId === 'night_port' ? 38 : 14,
        46,
        1.5
      );
      flood.position.set(tx, 8.2, tz);
      mapRoot.add(flood);
    }

    obstacles.push({
      box: new THREE.Box3(
        new THREE.Vector3(tx - 2.4, 0, tz - 2.4),
        new THREE.Vector3(tx + 2.4, 6, tz + 2.4)
      ),
      mesh: canopy,
      blocksSight: false,
      materialKind: 'metal',
    });
    mapRects.push({ x: tx, z: tz, w: 5.2, d: 5.2, kind: 'building' });
  }

  const addFlood = mapId === 'night_port' || mapId === 'snow_outpost';
  buildTower(-48, -50, addFlood);
  buildTower(48, -48, addFlood);
  buildTower(48, 50, addFlood);
  if (mapId === 'night_port') {
    buildTower(-48, 48, true);
  }

  // 6. Tactical Barriers & Sandbags / Snowbanks
  const barriers: Array<[number, number, number, number]> = [
    [-12, 8, 5.5, 1.0],
    [12, 8, 5.5, 1.0],
    [0, 18, 6.5, 1.1],
    [-16, -2, 1.0, 5.5],
    [16, -2, 1.0, 5.5],
    [-46, -4, 5.5, 1.1],
    [46, -6, 5.5, 1.1],
    [0, -42, 8.0, 1.2],
    [-22, -56, 6.0, 1.1],
    [22, -56, 6.0, 1.1],
    [-48, 34, 6.0, 1.1],
    [46, -26, 1.1, 6.0],
  ];
  barriers.forEach(([x, z, w, d]) => {
    addSolidBox(x, 0, z, w, 1.35, d, concreteMat, 'concrete', 'cover', false);
    coverPoints.push(new THREE.Vector3(x, 0, z + (d > w ? 0 : 2.5)));
    coverPoints.push(new THREE.Vector3(x, 0, z - (d > w ? 0 : 2.5)));
  });

  const sandbags: Array<[number, number, number, number]> = [
    [-8, 32, 5.2, 1.3],
    [10, 32, 5.2, 1.3],
    [-18, -32, 4.8, 1.3],
    [18, -32, 4.8, 1.3],
    [0, 56, 7.0, 1.4],
  ];
  sandbags.forEach(([x, z, w, d]) => {
    addSolidBox(x, 0, z, w, 1.15, d, sandbagMat, 'concrete', 'cover', false);
  });

  // 7. Military Wooden Supply Crate Clusters
  const crateClusters: Array<[number, number, number]> = [
    [-9, 2, 1.6],
    [-10.8, 2.2, 1.4],
    [10, -2, 1.7],
    [11.8, -1.6, 1.3],
    [-20, 22, 1.8],
    [20, -14, 1.7],
    [4, -30, 1.6],
    [-5, -30.5, 1.4],
    [-34, -8, 1.8],
    [32, 42, 1.7],
    [-38, 52, 1.6],
    [14, 48, 1.8],
  ];
  crateClusters.forEach(([x, z, s], idx) => {
    addSolidBox(x, 0, z, s, s, s, crateMat, 'wood', 'cover', s >= 1.7);
    if (idx % 3 === 0) {
      addSolidBox(x + 0.15, s, z - 0.1, s * 0.72, s * 0.72, s * 0.72, crateMat, 'wood', undefined, true);
    }
  });

  // 8. Destructible Explosive Red Fuel Barrels
  const barrelMat = new THREE.MeshStandardMaterial({
    map: textures.barrelColor,
    roughness: 0.42,
    metalness: 0.65,
  });
  const barrelRimMat = new THREE.MeshStandardMaterial({
    color: 0x262626,
    roughness: 0.35,
    metalness: 0.85,
  });
  const barrelCoords: Array<[number, number]> = [
    [-6.5, 6],
    [8.5, -5.5],
    [-26, -29],
    [28, -20],
    [-34, 16],
    [31, 16],
    [2, -37],
    [-14, 34],
    [18, 30],
    [-44, -22],
    [42, -36],
    [0, 44],
  ];

  barrelCoords.forEach(([bx, bz], i) => {
    const group = new THREE.Group();
    group.position.set(bx, 0, bz);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.38, 16), barrelMat);
    body.position.y = 0.69;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.barrelId = i;
    body.userData.materialKind = 'metal';
    group.add(body);

    const topRim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.035, 8, 16), barrelRimMat);
    topRim.rotation.x = Math.PI / 2;
    topRim.position.y = 1.37;
    group.add(topRim);

    const midRim = topRim.clone();
    midRim.position.y = 0.92;
    group.add(midRim);

    mapRoot.add(group);
    raycastWallMeshes.push(body);
    obstacles.push({
      box: new THREE.Box3(
        new THREE.Vector3(bx - 0.55, 0, bz - 0.55),
        new THREE.Vector3(bx + 0.55, 1.45, bz + 0.55)
      ),
      mesh: body,
      blocksSight: false,
      materialKind: 'metal',
    });

    barrels.push({
      id: i,
      group,
      hitMesh: body,
      position: new THREE.Vector3(bx, 0.7, bz),
      hp: 40,
      exploded: false,
      respawnTimer: 0,
    });
  });

  // 9. Outer Perimeter Landmarks (Rocks/Trees for Canyon & Snow, Harbor Buoys/Silhouettes for Night Port)
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  if (mapId === 'night_port') {
    // Distant dockside cargo cranes / silhouettes across the harbor
    const buoyGeo = new THREE.CylinderGeometry(0.6, 0.8, 2.2, 8);
    const buoyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.7 });
    const buoys = new THREE.InstancedMesh(buoyGeo, buoyMat, 28);
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2;
      const rad = 112 + (i % 3) * 28;
      dummy.position.set(Math.cos(angle) * rad, -0.4, Math.sin(angle) * rad);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.set(1.2, 1 + (i % 4) * 0.8, 1.2);
      dummy.updateMatrix();
      buoys.setMatrixAt(i, dummy.matrix);
    }
    buoys.instanceMatrix.needsUpdate = true;
    buoys.computeBoundingSphere();
    mapRoot.add(buoys);
  } else {
    const rockGeo = new THREE.DodecahedronGeometry(1.4, 1);
    const rockMat = new THREE.MeshStandardMaterial({
      color: mapId === 'snow_outpost' ? 0x9aa8b8 : 0x766451,
      roughness: 0.92,
      metalness: 0.04,
    });
    const rockCount = 90;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rocks.castShadow = !isSoftwareGl;
    rocks.receiveShadow = true;

    for (let i = 0; i < rockCount; i++) {
      const angle = (i / rockCount) * Math.PI * 2 + Math.random() * 0.15;
      const radius = 94 + Math.random() * 110;
      const rx = Math.cos(angle) * radius;
      const rz = Math.sin(angle) * radius;
      const ry = groundHeightAt(rx, rz, mapId);
      const scale = 1.2 + Math.random() * 3.8;
      dummy.position.set(rx, ry + scale * 0.45, rz);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      dummy.scale.set(scale * (0.9 + Math.random() * 0.5), scale * (0.6 + Math.random() * 0.5), scale);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);

      const shade = 0.78 + Math.random() * 0.35;
      tint.setRGB(shade, shade * 0.96, shade * (mapId === 'snow_outpost' ? 1.05 : 0.85));
      rocks.setColorAt(i, tint);
    }
    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    rocks.computeBoundingSphere();
    mapRoot.add(rocks);

    const treeCount = 75;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 2.4, 7);
    trunkGeo.translate(0, 1.2, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x453425, roughness: 0.92 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);

    const foliageGeo = new THREE.ConeGeometry(1.5, 4.8, 7);
    foliageGeo.translate(0, 4.1, 0);
    const foliageMat = new THREE.MeshStandardMaterial({
      color: mapId === 'snow_outpost' ? 0x9eb8b2 : 0x384d31,
      roughness: 0.88,
    });
    const foliages = new THREE.InstancedMesh(foliageGeo, foliageMat, treeCount);
    foliages.castShadow = !isSoftwareGl;

    for (let i = 0; i < treeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 96 + Math.random() * 95;
      const tx = Math.cos(angle) * radius;
      const tz = Math.sin(angle) * radius;
      const ty = groundHeightAt(tx, tz, mapId);
      const sc = 0.85 + Math.random() * 0.8;

      dummy.position.set(tx, ty - 0.1, tz);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      foliages.setMatrixAt(i, dummy.matrix);

      const gShade = 0.8 + Math.random() * 0.32;
      tint.setRGB(gShade * 0.85, gShade, gShade * (mapId === 'snow_outpost' ? 1.05 : 0.8));
      foliages.setColorAt(i, tint);
    }
    trunks.instanceMatrix.needsUpdate = true;
    foliages.instanceMatrix.needsUpdate = true;
    if (foliages.instanceColor) foliages.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    foliages.computeBoundingSphere();
    mapRoot.add(trunks, foliages);
  }

  const supplySpawns: SupplySpawn[] = [
    { position: new THREE.Vector3(0, 0, -14), kind: 'ammo' },
    { position: new THREE.Vector3(-24, 0, 0), kind: 'medkit' },
    { position: new THREE.Vector3(24, 0, 0), kind: 'ammo' },
    { position: new THREE.Vector3(0, 0, 38), kind: 'medkit' },
    { position: new THREE.Vector3(-42, 0, -34), kind: 'ammo' },
    { position: new THREE.Vector3(42, 0, 34), kind: 'medkit' },
  ];

  return {
    obstacles,
    raycastWallMeshes,
    barrels,
    mapRects,
    supplySpawns,
    coverPoints,
    groundHeightAt: (x: number, z: number) => groundHeightAt(x, z, mapId),
  };
}
