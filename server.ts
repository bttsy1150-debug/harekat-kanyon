import express from 'express';
import fs from 'fs';
import http from 'http';
import JSZip from 'jszip';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MapId = 'canyon' | 'night_port' | 'snow_outpost';
type OperatorId = 'assault' | 'recon' | 'sniper' | 'heavy';
type WeaponId = 'pistol' | 'rifle' | 'shotgun' | 'sniper';
type BotClass = 'rusher' | 'assault' | 'sniper' | 'heavy';
type MultiplayerMode = 'ffa' | 'tdm' | 'coop';
type TeamId = 'alpha' | 'bravo' | 'ffa';

interface ServerPlayer {
  id: string;
  ws: WebSocket;
  roomId: string;
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
  respawnTimer: number;
}

interface ServerBot {
  id: number;
  type: BotClass;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  range: number;
  fireRate: number;
  shootCooldown: number;
  alive: boolean;
  respawnTimer: number;
}

interface ServerBarrel {
  id: number;
  x: number;
  z: number;
  hp: number;
  exploded: boolean;
  respawnTimer: number;
}

interface ServerRoom {
  id: string;
  name: string;
  mapId: MapId;
  mode: MultiplayerMode;
  maxPlayers: number;
  botCount: number;
  wave: number;
  isDefault: boolean;
  players: Map<string, ServerPlayer>;
  bots: Map<number, ServerBot>;
  barrels: ServerBarrel[];
  nextBotId: number;
}

const WEAPON_DAMAGE: Record<WeaponId, number> = {
  pistol: 28,
  rifle: 32,
  shotgun: 18,
  sniper: 115,
};

const OP_STATS: Record<OperatorId, { maxHp: number; startArmor: number }> = {
  assault: { maxHp: 100, startArmor: 75 },
  recon: { maxHp: 90, startArmor: 50 },
  sniper: { maxHp: 95, startArmor: 50 },
  heavy: { maxHp: 130, startArmor: 100 },
};

const BARREL_COORDS: Array<[number, number]> = [
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

const SPAWN_POINTS: Array<[number, number]> = [
  [0, 26],
  [0, -34],
  [-42, 0],
  [42, 0],
  [-36, 36],
  [36, -36],
  [-36, -36],
  [36, 36],
  [-16, 48],
  [16, -48],
];

const rooms = new Map<string, ServerRoom>();
let nextPlayerSeq = 1;
let nextChatSeq = 1;

function createBarrels(): ServerBarrel[] {
  return BARREL_COORDS.map(([x, z], idx) => ({
    id: idx,
    x,
    z,
    hp: 40,
    exploded: false,
    respawnTimer: 0,
  }));
}

function createServerBot(room: ServerRoom): ServerBot {
  const r = Math.random();
  const type: BotClass = r < 0.28 ? 'rusher' : r < 0.65 ? 'assault' : r < 0.85 ? 'sniper' : 'heavy';
  const baseHp = type === 'heavy' ? 210 : type === 'assault' ? 110 : type === 'sniper' ? 85 : 80;
  const speed = type === 'rusher' ? 4.8 : type === 'assault' ? 3.2 : 2.3;
  const dmg = type === 'sniper' ? 22 : type === 'heavy' ? 14 : type === 'assault' ? 10 : 8;
  const range = type === 'sniper' ? 75 : type === 'rusher' ? 26 : 42;
  const fireRate = type === 'sniper' ? 2.4 : type === 'rusher' ? 0.65 : 0.95;

  const angle = Math.random() * Math.PI * 2;
  const dist = 34 + Math.random() * 34;
  return {
    id: room.nextBotId++,
    type,
    x: Math.cos(angle) * dist,
    z: Math.sin(angle) * dist,
    yaw: 0,
    hp: baseHp + (room.wave - 1) * 12,
    maxHp: baseHp + (room.wave - 1) * 12,
    damage: dmg,
    speed,
    range,
    fireRate,
    shootCooldown: 0.9 + Math.random(),
    alive: true,
    respawnTimer: 0,
  };
}

function createRoom(opts: {
  id: string;
  name: string;
  mapId: MapId;
  mode: MultiplayerMode;
  maxPlayers: number;
  botCount: number;
  isDefault: boolean;
}): ServerRoom {
  const room: ServerRoom = {
    id: opts.id,
    name: opts.name,
    mapId: opts.mapId,
    mode: opts.mode,
    maxPlayers: Math.max(2, Math.min(16, opts.maxPlayers)),
    botCount: Math.max(0, Math.min(16, opts.botCount)),
    wave: 1,
    isDefault: opts.isDefault,
    players: new Map(),
    bots: new Map(),
    barrels: createBarrels(),
    nextBotId: 1,
  };
  for (let i = 0; i < room.botCount; i++) {
    const bot = createServerBot(room);
    room.bots.set(bot.id, bot);
  }
  rooms.set(room.id, room);
  return room;
}

// Seed default public rooms so anyone joining online immediately has lobbies
createRoom({
  id: 'kanyon-ffa',
  name: 'Kanyon Arena · Herkes Tek',
  mapId: 'canyon',
  mode: 'ffa',
  maxPlayers: 12,
  botCount: 4,
  isDefault: true,
});
createRoom({
  id: 'liman-tdm',
  name: 'Gece Limanı · Takım Çatışması',
  mapId: 'night_port',
  mode: 'tdm',
  maxPlayers: 12,
  botCount: 0,
  isDefault: true,
});
createRoom({
  id: 'kar-coop',
  name: 'Karlı Karakol · Co-op Savunma',
  mapId: 'snow_outpost',
  mode: 'coop',
  maxPlayers: 8,
  botCount: 8,
  isDefault: true,
});

function serializePlayer(p: ServerPlayer) {
  return {
    id: p.id,
    name: p.name,
    operatorId: p.operatorId,
    team: p.team,
    x: p.x,
    y: p.y,
    z: p.z,
    yaw: p.yaw,
    pitch: p.pitch,
    crouching: p.crouching,
    weapon: p.weapon,
    hp: p.hp,
    maxHp: p.maxHp,
    armor: p.armor,
    kills: p.kills,
    deaths: p.deaths,
    score: p.score,
    alive: p.alive,
  };
}

function getRoomSummaries() {
  return Array.from(rooms.values()).map((r) => ({
    id: r.id,
    name: r.name,
    mapId: r.mapId,
    mode: r.mode,
    playerCount: r.players.size,
    maxPlayers: r.maxPlayers,
    botCount: r.botCount,
    wave: r.wave,
    isDefault: r.isDefault,
  }));
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room: ServerRoom, payload: unknown, excludeId?: string) {
  const raw = JSON.stringify(payload);
  for (const p of room.players.values()) {
    if (excludeId && p.id === excludeId) continue;
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(raw);
    }
  }
}

function pickSpawn(room: ServerRoom, team: TeamId): [number, number] {
  if (room.mode === 'tdm') {
    const base = team === 'alpha' ? [0, 48] : [0, -48];
    return [base[0] + (Math.random() - 0.5) * 24, base[1] + (Math.random() - 0.5) * 10];
  }
  const pt = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  return [pt[0] + (Math.random() - 0.5) * 4, pt[1] + (Math.random() - 0.5) * 4];
}

function assignTeam(room: ServerRoom): TeamId {
  if (room.mode === 'coop') return 'alpha';
  if (room.mode === 'ffa') return 'ffa';
  let alpha = 0;
  let bravo = 0;
  for (const p of room.players.values()) {
    if (p.team === 'alpha') alpha++;
    else if (p.team === 'bravo') bravo++;
  }
  return alpha <= bravo ? 'alpha' : 'bravo';
}

function applyDamageToServerPlayer(
  room: ServerRoom,
  target: ServerPlayer,
  rawDmg: number,
  attackerName: string,
  attackerId: string | null,
  headshot: boolean,
  explosive: boolean,
  melee: boolean,
  sourceX: number,
  sourceZ: number
) {
  if (!target.alive) return;
  let dmg = rawDmg;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, Math.round(rawDmg * 0.58));
    target.armor -= absorbed;
    dmg = Math.max(1, rawDmg - absorbed);
  }
  target.hp = Math.max(0, target.hp - dmg);

  sendJson(target.ws, {
    type: 'player:damaged',
    hp: target.hp,
    armor: target.armor,
    sourceX,
    sourceZ,
  });

  if (target.hp <= 0) {
    target.alive = false;
    target.deaths++;
    target.respawnTimer = 3.5;

    if (attackerId && attackerId !== target.id) {
      const attacker = room.players.get(attackerId);
      if (attacker) {
        attacker.kills++;
        attacker.score += headshot ? 150 : 100;
      }
    }

    broadcastRoom(room, {
      type: 'player:killed',
      victimId: target.id,
      victimName: target.name,
      killerId: attackerId,
      killerName: attackerName,
      headshot,
      explosive,
      melee,
    });
  }
}

function removePlayerFromRoom(player: ServerPlayer | null) {
  if (!player) return;
  const room = rooms.get(player.roomId);
  if (!room) return;
  room.players.delete(player.id);
  broadcastRoom(room, {
    type: 'player:left',
    playerId: player.id,
    name: player.name,
  });
  if (!room.isDefault && room.players.size === 0) {
    rooms.delete(room.id);
  }
}

async function bootstrap() {
  const app = express();
  app.use(express.json());

  // Permissive CORS so itch.io iframe builds can talk to this server cleanly
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: getRoomSummaries() });
  });

  app.get('/api/itch-bundle.zip', async (_req, res) => {
    const distDir = path.resolve(__dirname, 'dist');
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      res.status(404).send('Derlenmiş dist paketi bulunamadı. Önce npm run build çalıştırın.');
      return;
    }
    try {
      const zipBuf = await buildZipFromDirectory(distDir);
      res.status(200);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="itch-bundle.zip"');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', String(zipBuf.length));
      res.end(zipBuf);
    } catch (err) {
      res.status(500).send(`ZIP oluşturulamadı: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let currentPlayer: ServerPlayer | null = null;

    ws.on('message', (rawBuf) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(rawBuf.toString());
      } catch {
        return;
      }

      const type = String(msg.type || '');

      if (type === 'room:list') {
        sendJson(ws, { type: 'room:list', rooms: getRoomSummaries() });
        return;
      }

      if (type === 'room:create') {
        if (currentPlayer) removePlayerFromRoom(currentPlayer);
        const id = 'oda-' + Math.random().toString(36).slice(2, 7);
        const mapId = (['canyon', 'night_port', 'snow_outpost'].includes(String(msg.mapId))
          ? msg.mapId
          : 'canyon') as MapId;
        const mode = (['ffa', 'tdm', 'coop'].includes(String(msg.mode))
          ? msg.mode
          : 'ffa') as MultiplayerMode;
        const room = createRoom({
          id,
          name: String(msg.roomName || 'Özel Operasyon Odası').slice(0, 32),
          mapId,
          mode,
          maxPlayers: Number(msg.maxPlayers) || 10,
          botCount: Number(msg.botCount) || 0,
          isDefault: false,
        });
        joinRoom(room);
        return;
      }

      if (type === 'room:join') {
        if (currentPlayer) removePlayerFromRoom(currentPlayer);
        const roomId = String(msg.roomId || 'kanyon-ffa');
        const room = rooms.get(roomId) || Array.from(rooms.values())[0];
        if (!room) return;
        if (room.players.size >= room.maxPlayers) {
          sendJson(ws, { type: 'error', message: 'Oda dolu' });
          return;
        }
        joinRoom(room);
        return;
      }

      if (!currentPlayer) return;
      const room = rooms.get(currentPlayer.roomId);
      if (!room) return;

      if (type === 'room:leave') {
        removePlayerFromRoom(currentPlayer);
        currentPlayer = null;
        return;
      }

      if (type === 'player:state') {
        currentPlayer.x = Number(msg.x) || 0;
        currentPlayer.y = Number(msg.y) || 1.72;
        currentPlayer.z = Number(msg.z) || 0;
        currentPlayer.yaw = Number(msg.yaw) || 0;
        currentPlayer.pitch = Number(msg.pitch) || 0;
        currentPlayer.crouching = Boolean(msg.crouching);
        if (['pistol', 'rifle', 'shotgun', 'sniper'].includes(String(msg.weapon))) {
          currentPlayer.weapon = msg.weapon as WeaponId;
        }
        return;
      }

      if (type === 'player:shoot') {
        if (!currentPlayer.alive) return;
        broadcastRoom(
          room,
          {
            type: 'player:shoot',
            playerId: currentPlayer.id,
            weapon: msg.weapon,
            start: msg.start,
            end: msg.end,
          },
          currentPlayer.id
        );
        return;
      }

      if (type === 'shot:hit') {
        if (!currentPlayer.alive) return;
        const target = room.players.get(String(msg.targetId || ''));
        if (!target || !target.alive || target.id === currentPlayer.id) return;
        if (room.mode === 'coop') return;
        if (room.mode === 'tdm' && target.team === currentPlayer.team) return;

        const weapon = (['pistol', 'rifle', 'shotgun', 'sniper'].includes(String(msg.weapon))
          ? msg.weapon
          : 'rifle') as WeaponId;
        const zone = String(msg.hitZone || 'torso');
        const zoneMult = zone === 'head' ? 2.4 : zone === 'limb' ? 0.75 : 1.0;
        const opHeadMult = currentPlayer.operatorId === 'sniper' && zone === 'head' ? 1.2 : 1.0;
        const dmgLvl = Math.max(0, Math.min(3, Number(msg.damageBonusLevel) || 0));
        const dmg = Math.round(WEAPON_DAMAGE[weapon] * zoneMult * opHeadMult * (1 + dmgLvl * 0.15));

        const killedBefore = !target.alive;
        applyDamageToServerPlayer(
          room,
          target,
          dmg,
          currentPlayer.name,
          currentPlayer.id,
          zone === 'head',
          false,
          false,
          currentPlayer.x,
          currentPlayer.z
        );

        sendJson(ws, {
          type: 'hit:confirm',
          headshot: zone === 'head',
          killed: !killedBefore && !target.alive,
          damage: dmg,
        });
        return;
      }

      if (type === 'melee:hit') {
        if (!currentPlayer.alive) return;
        const target = room.players.get(String(msg.targetId || ''));
        if (!target || !target.alive || target.id === currentPlayer.id) return;
        if (room.mode === 'coop') return;
        if (room.mode === 'tdm' && target.team === currentPlayer.team) return;
        const dist = Math.hypot(target.x - currentPlayer.x, target.z - currentPlayer.z);
        if (dist > 3.8) return;

        applyDamageToServerPlayer(
          room,
          target,
          80,
          currentPlayer.name,
          currentPlayer.id,
          false,
          false,
          true,
          currentPlayer.x,
          currentPlayer.z
        );
        sendJson(ws, {
          type: 'hit:confirm',
          headshot: false,
          killed: !target.alive,
          damage: 80,
        });
        return;
      }

      if (type === 'bot:hit') {
        if (!currentPlayer.alive) return;
        const bot = room.bots.get(Number(msg.botId));
        if (!bot || !bot.alive) return;
        const weapon = (['pistol', 'rifle', 'shotgun', 'sniper'].includes(String(msg.weapon))
          ? msg.weapon
          : 'rifle') as WeaponId;
        const zone = String(msg.hitZone || 'torso');
        const zoneMult = zone === 'head' ? 2.5 : zone === 'limb' ? 0.75 : 1.0;
        const dmg = Math.round(WEAPON_DAMAGE[weapon] * zoneMult);
        bot.hp -= dmg;

        if (bot.hp <= 0) {
          bot.alive = false;
          bot.respawnTimer = 4.0;
          currentPlayer.kills++;
          currentPlayer.score += zone === 'head' ? 140 : 90;
          broadcastRoom(room, {
            type: 'bot:killed',
            botId: bot.id,
            killerId: currentPlayer.id,
            killerName: currentPlayer.name,
            headshot: zone === 'head',
          });
        }
        sendJson(ws, {
          type: 'hit:confirm',
          headshot: zone === 'head',
          killed: !bot.alive,
          damage: dmg,
        });
        return;
      }

      if (type === 'grenade:throw') {
        if (!currentPlayer.alive) return;
        const shooterId = currentPlayer.id;
        const shooterName = currentPlayer.name;
        const shooterTeam = currentPlayer.team;
        broadcastRoom(
          room,
          {
            type: 'grenade:throw',
            playerId: shooterId,
            pos: msg.pos,
            vel: msg.vel,
          },
          shooterId
        );
        return;
      }

      if (type === 'grenade:explode') {
        if (!currentPlayer.alive) return;
        const gx = Number(msg.x) || 0;
        const gz = Number(msg.z) || 0;
        for (const target of room.players.values()) {
          if (!target.alive) continue;
          if (room.mode === 'coop' && target.id !== currentPlayer.id) continue;
          if (room.mode === 'tdm' && target.team === currentPlayer.team && target.id !== currentPlayer.id) continue;
          const d = Math.hypot(target.x - gx, target.z - gz);
          if (d < 10.5) {
            const dmg = Math.round(160 * (1 - d / 10.5));
            applyDamageToServerPlayer(
              room,
              target,
              dmg,
              currentPlayer.name,
              currentPlayer.id,
              false,
              true,
              false,
              gx,
              gz
            );
          }
        }
        for (const bot of room.bots.values()) {
          if (!bot.alive) continue;
          const d = Math.hypot(bot.x - gx, bot.z - gz);
          if (d < 10.5) {
            bot.hp -= Math.round(180 * (1 - d / 10.5));
            if (bot.hp <= 0) {
              bot.alive = false;
              bot.respawnTimer = 4.0;
              currentPlayer.kills++;
              currentPlayer.score += 100;
              broadcastRoom(room, {
                type: 'bot:killed',
                botId: bot.id,
                killerId: currentPlayer.id,
                killerName: currentPlayer.name,
                headshot: false,
              });
            }
          }
        }
        return;
      }

      if (type === 'barrel:damage') {
        const b = room.barrels[Number(msg.barrelId)];
        if (!b || b.exploded) return;
        b.hp -= Number(msg.damage) || 30;
        if (b.hp <= 0) {
          b.exploded = true;
          b.respawnTimer = 35;
          broadcastRoom(room, { type: 'barrel:detonate', barrelId: b.id });
          for (const target of room.players.values()) {
            if (!target.alive) continue;
            const d = Math.hypot(target.x - b.x, target.z - b.z);
            if (d < 9.5) {
              applyDamageToServerPlayer(
                room,
                target,
                Math.round(140 * (1 - d / 9.5)),
                currentPlayer.name,
                currentPlayer.id,
                false,
                true,
                false,
                b.x,
                b.z
              );
            }
          }
        }
        return;
      }

      if (type === 'chat:send') {
        const text = String(msg.text || '').trim().slice(0, 140);
        if (!text) return;
        broadcastRoom(room, {
          type: 'chat:msg',
          id: nextChatSeq++,
          sender: currentPlayer.name,
          text,
        });
      }

      function joinRoom(roomToJoin: ServerRoom) {
        const pid = 'p-' + nextPlayerSeq++;
        const opId = (['assault', 'recon', 'sniper', 'heavy'].includes(String(msg.operatorId))
          ? msg.operatorId
          : 'assault') as OperatorId;
        const team = assignTeam(roomToJoin);
        const [sx, sz] = pickSpawn(roomToJoin, team);
        const stats = OP_STATS[opId];

        const player: ServerPlayer = {
          id: pid,
          ws,
          roomId: roomToJoin.id,
          name: String(msg.name || `Komando-${nextPlayerSeq}`).trim().slice(0, 18) || `Komando-${pid}`,
          operatorId: opId,
          team,
          x: sx,
          y: 1.72,
          z: sz,
          yaw: 0,
          pitch: 0,
          crouching: false,
          weapon: 'rifle',
          hp: stats.maxHp,
          maxHp: stats.maxHp,
          armor: stats.startArmor,
          kills: 0,
          deaths: 0,
          score: 0,
          alive: true,
          respawnTimer: 0,
        };

        currentPlayer = player;
        roomToJoin.players.set(pid, player);

        sendJson(ws, {
          type: 'room:joined',
          selfId: pid,
          self: serializePlayer(player),
          room: {
            id: roomToJoin.id,
            name: roomToJoin.name,
            mapId: roomToJoin.mapId,
            mode: roomToJoin.mode,
            playerCount: roomToJoin.players.size,
            maxPlayers: roomToJoin.maxPlayers,
            botCount: roomToJoin.botCount,
            wave: roomToJoin.wave,
          },
          players: Array.from(roomToJoin.players.values()).map(serializePlayer),
          bots: Array.from(roomToJoin.bots.values()),
        });

        broadcastRoom(
          roomToJoin,
          {
            type: 'player:joined',
            player: serializePlayer(player),
          },
          pid
        );
      }
    });

    ws.on('close', () => {
      removePlayerFromRoom(currentPlayer);
      currentPlayer = null;
    });
  });

  // 20 Hz Room Snapshot & Server Simulation Loop
  setInterval(() => {
    const dt = 0.05;
    for (const room of rooms.values()) {
      if (room.players.size === 0) continue;

      // Player respawns
      for (const p of room.players.values()) {
        if (!p.alive) {
          p.respawnTimer -= dt;
          if (p.respawnTimer <= 0) {
            const [sx, sz] = pickSpawn(room, p.team);
            const stats = OP_STATS[p.operatorId];
            p.x = sx;
            p.y = 1.72;
            p.z = sz;
            p.hp = stats.maxHp;
            p.armor = stats.startArmor;
            p.alive = true;
            sendJson(p.ws, {
              type: 'player:respawned',
              x: sx,
              z: sz,
              hp: p.hp,
              armor: p.armor,
            });
          }
        }
      }

      // Barrel respawns
      for (const b of room.barrels) {
        if (b.exploded) {
          b.respawnTimer -= dt;
          if (b.respawnTimer <= 0) {
            b.exploded = false;
            b.hp = 40;
          }
        }
      }

      // Server-authoritative Bots AI tick
      const alivePlayers = Array.from(room.players.values()).filter((p) => p.alive);
      for (const bot of room.bots.values()) {
        if (!bot.alive) {
          bot.respawnTimer -= dt;
          if (bot.respawnTimer <= 0) {
            const fresh = createServerBot(room);
            bot.x = fresh.x;
            bot.z = fresh.z;
            bot.hp = fresh.hp;
            bot.maxHp = fresh.maxHp;
            bot.alive = true;
          }
          continue;
        }
        if (alivePlayers.length === 0) continue;

        let nearest = alivePlayers[0];
        let bestDist = Infinity;
        for (const p of alivePlayers) {
          const d = Math.hypot(p.x - bot.x, p.z - bot.z);
          if (d < bestDist) {
            bestDist = d;
            nearest = p;
          }
        }

        const dx = nearest.x - bot.x;
        const dz = nearest.z - bot.z;
        bot.yaw = Math.atan2(-dx, -dz);

        if (bestDist > 8) {
          bot.x += (dx / bestDist) * bot.speed * dt;
          bot.z += (dz / bestDist) * bot.speed * dt;
        }

        if (bestDist < bot.range) {
          bot.shootCooldown -= dt;
          if (bot.shootCooldown <= 0) {
            bot.shootCooldown = bot.fireRate * (0.8 + Math.random() * 0.5);
            broadcastRoom(room, {
              type: 'bot:shoot',
              botId: bot.id,
              from: [bot.x, 1.4, bot.z],
              to: [nearest.x + (Math.random() - 0.5) * 1.4, 1.4, nearest.z + (Math.random() - 0.5) * 1.4],
            });
            if (Math.random() < Math.max(0.15, 0.55 - bestDist / (bot.range * 1.6))) {
              applyDamageToServerPlayer(
                room,
                nearest,
                bot.damage,
                `Bot (${bot.type})`,
                null,
                false,
                false,
                false,
                bot.x,
                bot.z
              );
            }
          }
        }
      }

      broadcastRoom(room, {
        type: 'room:snapshot',
        players: Array.from(room.players.values()).map(serializePlayer),
        bots: Array.from(room.bots.values()).map((b) => ({
          id: b.id,
          type: b.type,
          x: b.x,
          z: b.z,
          yaw: b.yaw,
          hp: b.hp,
          maxHp: b.maxHp,
          alive: b.alive,
        })),
      });
    }
  }, 50);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`Harekat: Kanyon multiplayer server listening on port ${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});

function collectFiles(rootDir: string, currentDir: string, out: Array<{ rel: string; abs: string }>) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(currentDir, entry.name);
    const rel = path.relative(rootDir, abs).split(path.sep).join('/');
    if (rel === 'assets/aistudio' || rel.startsWith('assets/aistudio/')) {
      continue;
    }
    if (entry.isDirectory()) {
      collectFiles(rootDir, abs, out);
    } else if (entry.isFile()) {
      out.push({ rel, abs });
    }
  }
}

async function buildZipFromDirectory(rootDir: string): Promise<Buffer> {
  const files: Array<{ rel: string; abs: string }> = [];
  collectFiles(rootDir, rootDir, files);

  const zip = new JSZip();
  const now = new Date();
  for (const f of files) {
    const raw = fs.readFileSync(f.abs);
    zip.file(f.rel, raw, {
      binary: true,
      date: now,
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
  }

  return zip.generateAsync({
    type: 'nodebuffer',
    platform: 'DOS',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}
