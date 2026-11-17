import React, { useState } from 'react';
import {
  Shield,
  Heart,
  Flame,
  Package,
  Crosshair,
  Volume2,
  Sliders,
  MapPin,
  UserCheck,
  Users,
  Globe,
  RefreshCw,
  PlusCircle,
  UploadCloud,
  Server,
  Download,
  Terminal,
  Copy,
  Check,
} from 'lucide-react';
import {
  DIFFICULTIES,
  DifficultyId,
  GameModeId,
  GameSettings,
  HudState,
  MAPS,
  MapId,
  MatchConfig,
  MultiplayerMode,
  OPERATORS,
  OperatorId,
  RoomSummary,
  WEAPONS,
  WeaponId,
} from '../game/types';
import { DEFAULT_ONLINE_SERVER_URL, resolveHttpBase } from '../game/net';

interface GameMenusProps {
  hud: HudState;
  settings: GameSettings;
  rooms: RoomSummary[];
  playerName: string;
  serverUrl: string;
  mpError: string | null;
  onPlayerNameChange: (name: string) => void;
  onServerUrlChange: (url: string) => void;
  onRefreshRooms: () => void;
  onCreateRoom: (opts: {
    roomName: string;
    mapId: MapId;
    mode: MultiplayerMode;
    maxPlayers: number;
    botCount: number;
  }) => void;
  onJoinRoom: (roomId: string) => void;
  onLeaveRoom: () => void;
  onUpdateMatchConfig: (next: Partial<MatchConfig>) => void;
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
  onReturnToLobby: () => void;
  onOpenArmory: () => void;
  onCloseArmory: () => void;
  onBuyItem: (item: 'armor' | 'medkit' | 'grenades' | 'ammo' | 'damage') => void;
  onUpdateSettings: (next: Partial<GameSettings>) => void;
}

const MAP_LIST = Object.values(MAPS);
const OP_LIST = Object.values(OPERATORS);
const DIFF_LIST = Object.values(DIFFICULTIES);
const WEAPON_CHOICES: WeaponId[] = ['rifle', 'shotgun', 'sniper', 'pistol'];
const BOT_PRESETS = [4, 8, 12, 16, 20];

const MP_MODE_LABELS: Record<MultiplayerMode, string> = {
  ffa: 'Herkes Tek (FFA)',
  tdm: 'Takım Çatışması',
  coop: 'Co-op Savunma',
};

export const GameMenus: React.FC<GameMenusProps> = ({
  hud,
  settings,
  rooms,
  playerName,
  serverUrl,
  mpError,
  onPlayerNameChange,
  onServerUrlChange,
  onRefreshRooms,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onUpdateMatchConfig,
  onStart,
  onResume,
  onRestart,
  onReturnToLobby,
  onOpenArmory,
  onCloseArmory,
  onBuyItem,
  onUpdateSettings,
}) => {
  const [lobbyTab, setLobbyTab] = useState<'solo' | 'multi' | 'itch'>('solo');
  const [newRoomName, setNewRoomName] = useState('Özel Harekat Odası');
  const [newRoomMap, setNewRoomMap] = useState<MapId>('canyon');
  const [newRoomMode, setNewRoomMode] = useState<MultiplayerMode>('ffa');
  const [newRoomMaxPlayers, setNewRoomMaxPlayers] = useState(12);
  const [newRoomBots, setNewRoomBots] = useState(4);
  const [itchUser, setItchUser] = useState('kullaniciadi');
  const [itchGame, setItchGame] = useState('harekat-kanyon');
  const [itchChannel, setItchChannel] = useState('html5');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [zipDownloading, setZipDownloading] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  if (hud.phase === 'playing') return null;

  const butlerTarget = `${itchUser.trim() || 'kullaniciadi'}/${itchGame.trim() || 'harekat-kanyon'}:${itchChannel.trim() || 'html5'}`;
  const butlerPushCmd = `butler push itch-bundle.zip ${butlerTarget}`;
  const npmPushCmd = `ITCH_TARGET="${butlerTarget}" npm run itch:push`;

  const copyText = (key: string, value: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedCmd(key);
    window.setTimeout(() => setCopiedCmd((cur) => (cur === key ? null : cur)), 1800);
  };

  const handleDownloadItchZip = async () => {
    setZipDownloading(true);
    setZipError(null);
    try {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      const isStaticHost =
        host.includes('itch.zone') || host.includes('itch.io') || host.includes('hwcdn.net');
      const base = isStaticHost || serverUrl.trim() ? resolveHttpBase(serverUrl) : '';
      const res = await fetch(`${base}/api/itch-bundle.zip`, {
        method: 'GET',
        cache: 'no-store',
        credentials: isStaticHost ? 'omit' : 'same-origin',
      });
      if (!res.ok) {
        throw new Error(`Sunucu yanıtı: HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (bytes.length < 100 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        throw new Error('Geçersiz ZIP içeriği döndü (PK başlığı doğrulanamadı).');
      }
      const blob = new Blob([buf], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'itch-bundle.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      setZipError(
        err instanceof Error
          ? `${err.message} Terminalde "npm run itch:package" ile üretebilirsiniz.`
          : 'ZIP indirilemedi.'
      );
    } finally {
      setZipDownloading(false);
    }
  };

  const mc = hud.matchConfig;

  // 1. PRE-GAME DEPLOYMENT & SELECTION LOBBY
  if (hud.phase === 'start') {
    const selectedMap = MAPS[mc.mapId];
    const selectedOp = OPERATORS[mc.operatorId];

    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-stone-950/65 p-4 sm:p-6 overflow-y-auto">
        <div className="w-full max-w-5xl bg-stone-950/92 border border-stone-800 rounded-lg p-6 sm:p-7 shadow-2xl my-auto">
          {/* Header Row */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 mb-5 border-b border-stone-800">
            <div>
              <div className="text-xs font-medium tracking-widest text-amber-400 uppercase mb-1">
                Taktiksel Harekat Hazırlığı
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-stone-100">
                Harekat: Kanyon
              </h1>
            </div>

            {/* Mode Switch Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 bg-stone-900 p-1 rounded border border-stone-800">
              <button
                type="button"
                onClick={() => setLobbyTab('solo')}
                className={`px-3.5 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  lobbyTab === 'solo'
                    ? 'bg-amber-500 text-stone-950'
                    : 'text-stone-300 hover:text-stone-100'
                }`}
              >
                Tek Oyunculu (Solo)
              </button>
              <button
                type="button"
                onClick={() => {
                  setLobbyTab('multi');
                  onRefreshRooms();
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  lobbyTab === 'multi'
                    ? 'bg-amber-500 text-stone-950'
                    : 'text-stone-300 hover:text-stone-100'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Online Çok Oyunculu
              </button>
              <button
                type="button"
                onClick={() => setLobbyTab('itch')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  lobbyTab === 'itch'
                    ? 'bg-amber-500 text-stone-950'
                    : 'text-stone-300 hover:text-stone-100'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                itch.io Yayınlama
              </button>
            </div>
          </div>

          {lobbyTab === 'solo' && (
            <>
              {/* 3-Section Deployment Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
            {/* LEFT: MAP SELECTION (4 cols) */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-stone-300 uppercase">
                <MapPin className="w-4 h-4 text-amber-400" />
                <span>01. Operasyon Haritası</span>
              </div>

              <div className="flex flex-col gap-2.5">
                {MAP_LIST.map((m) => {
                  const active = mc.mapId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onUpdateMatchConfig({ mapId: m.id as MapId })}
                      className={`p-3.5 rounded text-left border transition-colors cursor-pointer ${
                        active
                          ? 'bg-stone-900 border-amber-500/80'
                          : 'bg-stone-900/55 border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-display font-bold text-base text-stone-100">
                          {m.name}
                        </span>
                        <span
                          className="text-[11px] font-medium"
                          style={{ color: active ? m.accentColor : '#a8a29e' }}
                        >
                          {active ? 'Seçili' : m.subtitle.split('·')[1]?.trim()}
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-400 mb-1.5">
                        {m.timeOfDay} · {m.visibility}
                      </div>
                      <p className="text-xs text-stone-300/90 leading-relaxed">{m.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* MIDDLE: OPERATOR / CHARACTER SELECTION (4 cols) */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-stone-300 uppercase">
                <UserCheck className="w-4 h-4 text-amber-400" />
                <span>02. Operatör Sınıfı</span>
              </div>

              <div className="flex flex-col gap-2.5">
                {OP_LIST.map((op) => {
                  const active = mc.operatorId === op.id;
                  return (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() =>
                        onUpdateMatchConfig({
                          operatorId: op.id as OperatorId,
                          startingWeapon: op.preferredWeapon,
                        })
                      }
                      className={`p-3 rounded text-left border transition-colors cursor-pointer ${
                        active
                          ? 'bg-stone-900 border-amber-500/80'
                          : 'bg-stone-900/55 border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-display font-bold text-sm text-stone-100">
                          {op.callsign}
                        </span>
                        <span className="text-[11px] text-amber-400/90">{op.role}</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-[11px] font-mono-tech text-stone-300 mt-1">
                        <span>{op.maxHp} Can</span>
                        <span className="text-stone-600">·</span>
                        <span>{op.startArmor} Zırh</span>
                        <span className="text-stone-600">·</span>
                        <span>x{op.speedMult.toFixed(2)} Hız</span>
                      </div>
                      <div className="text-[11px] text-stone-400 mt-1">{op.perkSummary}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: BOT COUNT, DIFFICULTY, MODE & WEAPON (4 cols) */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-stone-300 uppercase">
                <Users className="w-4 h-4 text-amber-400" />
                <span>03. Çatışma Ayarları</span>
              </div>

              <div className="bg-stone-900/75 border border-stone-800 rounded p-4 space-y-4">
                {/* Bot Count Slider + Presets */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-stone-300 font-medium">Düşman Bot Sayısı</span>
                    <span className="font-mono-tech font-bold text-amber-400 text-sm">
                      {mc.botCount} Bot
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={24}
                    step={1}
                    value={mc.botCount}
                    onChange={(e) =>
                      onUpdateMatchConfig({ botCount: parseInt(e.target.value, 10) })
                    }
                    className="w-full accent-amber-500 mb-2"
                  />
                  <div className="grid grid-cols-5 gap-1.5">
                    {BOT_PRESETS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => onUpdateMatchConfig({ botCount: n })}
                        className={`py-1 rounded text-xs font-mono-tech border transition-colors cursor-pointer ${
                          mc.botCount === n
                            ? 'bg-amber-500 text-stone-950 border-amber-400 font-bold'
                            : 'bg-stone-950/80 text-stone-400 border-stone-800 hover:text-stone-200'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Difficulty */}
                <div>
                  <div className="text-xs text-stone-300 font-medium mb-1.5">Zorluk Seviyesi</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {DIFF_LIST.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => onUpdateMatchConfig({ difficulty: d.id as DifficultyId })}
                        className={`py-1.5 px-2.5 rounded text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                          mc.difficulty === d.id
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-stone-950/70 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Game Mode */}
                <div>
                  <div className="text-xs text-stone-300 font-medium mb-1.5">Operasyon Modu</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'waves', label: 'Dalga Savunması' },
                        { id: 'skirmish', label: 'Serbest Çatışma' },
                      ] as Array<{ id: GameModeId; label: string }>
                    ).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => onUpdateMatchConfig({ mode: mode.id })}
                        className={`py-1.5 px-2.5 rounded text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                          mc.mode === mode.id
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-stone-950/70 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Starting Weapon */}
                <div>
                  <div className="text-xs text-stone-300 font-medium mb-1.5">
                    Birincil Başlangıç Silahı
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {WEAPON_CHOICES.map((wId) => {
                      const w = WEAPONS[wId];
                      return (
                        <button
                          key={wId}
                          type="button"
                          onClick={() => onUpdateMatchConfig({ startingWeapon: wId })}
                          className={`py-1.5 px-2.5 rounded text-xs font-medium border transition-colors cursor-pointer truncate ${
                            mc.startingWeapon === wId
                              ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                              : 'bg-stone-950/70 border-stone-800 text-stone-400 hover:text-stone-200'
                          }`}
                        >
                          {w.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Summary Bar + Launch CTA */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-4 border-t border-stone-800">
            <div className="text-xs text-stone-300 flex flex-wrap items-center gap-2">
              <span className="font-semibold text-stone-100">{selectedMap.name}</span>
              <span className="text-stone-600">·</span>
              <span>{selectedOp.callsign}</span>
              <span className="text-stone-600">·</span>
              <span className="font-mono-tech text-amber-400">{mc.botCount} Bot</span>
              <span className="text-stone-600">·</span>
              <span>{DIFFICULTIES[mc.difficulty].label}</span>
              <span className="text-stone-600">·</span>
              <span>{WEAPONS[mc.startingWeapon].name}</span>
            </div>

            <button
              type="button"
              onClick={onStart}
              className="py-3 px-8 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-display font-bold text-base tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Operasyona Başla
            </button>
          </div>
            </>
          )}

          {lobbyTab === 'multi' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* LEFT: CALLSIGN, OPERATOR & SERVER CONNECTION */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-stone-900/75 border border-stone-800 rounded p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-stone-300 mb-1">
                      Oyuncu Çağrı Adı
                    </label>
                    <input
                      type="text"
                      value={playerName}
                      maxLength={18}
                      onChange={(e) => onPlayerNameChange(e.target.value)}
                      placeholder="Komando"
                      className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500 rounded px-3 py-2 text-sm text-stone-100 outline-none"
                    />
                  </div>

                  <div>
                    <div className="text-xs font-medium text-stone-300 mb-1.5">Operatör Sınıfı</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {OP_LIST.map((op) => (
                        <button
                          key={op.id}
                          type="button"
                          onClick={() =>
                            onUpdateMatchConfig({
                              operatorId: op.id as OperatorId,
                              startingWeapon: op.preferredWeapon,
                            })
                          }
                          className={`p-2 rounded text-left border text-xs transition-colors cursor-pointer ${
                            mc.operatorId === op.id
                              ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                              : 'bg-stone-950/70 border-stone-800 text-stone-300 hover:border-stone-700'
                          }`}
                        >
                          <div className="font-semibold truncate">{op.callsign.split(' ')[0]}</div>
                          <div className="text-[10px] text-stone-400 truncate">{op.role}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-stone-800">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="inline-flex items-center gap-1 text-stone-300 font-medium">
                        <Server className="w-3.5 h-3.5 text-amber-400" />
                        Sunucu Adresi
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          hud.mpConnected ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {hud.mpConnected ? 'Çevrimiçi Bağlı' : 'Bağlantı Hazır'}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={serverUrl}
                      onChange={(e) => onServerUrlChange(e.target.value)}
                      placeholder="Varsayılan (Otomatik)"
                      className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500 rounded px-2.5 py-1.5 text-xs font-mono-tech text-stone-200 outline-none"
                    />
                    <div className="text-[10px] text-stone-500 mt-1">
                      Boş bırakılırsa itch.io veya tarayıcı otomatik canlı sunucuya bağlanır.
                    </div>
                  </div>
                </div>
              </div>

              {/* MIDDLE: LIVE ROOM BROWSER */}
              <div className="lg:col-span-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold tracking-wide text-stone-300 uppercase">
                    Aktif Online Odalar ({rooms.length})
                  </div>
                  <button
                    type="button"
                    onClick={onRefreshRooms}
                    className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Yenile
                  </button>
                </div>

                {mpError && (
                  <div className="p-2.5 rounded bg-red-950/60 border border-red-800 text-xs text-red-200">
                    {mpError}
                  </div>
                )}

                <div className="flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-1">
                  {rooms.length === 0 ? (
                    <div className="p-4 rounded bg-stone-900/60 border border-stone-800 text-xs text-stone-400">
                      Odalar yükleniyor veya henüz açık oda yok. Sağdan hemen yeni bir oda kurabilirsin.
                    </div>
                  ) : (
                    rooms.map((r) => (
                      <div
                        key={r.id}
                        className="p-3 rounded bg-stone-900/80 border border-stone-800 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="font-display font-bold text-sm text-stone-100 truncate">
                            {r.name}
                          </div>
                          <div className="text-[11px] text-stone-400 mt-0.5">
                            {MAPS[r.mapId]?.name || r.mapId} · {MP_MODE_LABELS[r.mode]}
                          </div>
                          <div className="text-[11px] font-mono-tech text-amber-400 mt-0.5">
                            {r.playerCount}/{r.maxPlayers} Oyuncu · {r.botCount} Bot
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onJoinRoom(r.id)}
                          disabled={r.playerCount >= r.maxPlayers}
                          className="px-3.5 py-2 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-display font-bold text-xs tracking-wide transition-colors cursor-pointer shrink-0"
                        >
                          Katıl
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* RIGHT: CREATE ROOM FORM */}
              <div className="lg:col-span-4">
                <div className="bg-stone-900/75 border border-stone-800 rounded p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-stone-300 uppercase">
                    <PlusCircle className="w-4 h-4 text-amber-400" />
                    <span>Yeni Online Oda Kur</span>
                  </div>

                  <div>
                    <label className="block text-[11px] text-stone-400 mb-1">Oda Adı</label>
                    <input
                      type="text"
                      value={newRoomName}
                      maxLength={30}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500 rounded px-2.5 py-1.5 text-xs text-stone-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-stone-400 mb-1">Harita</label>
                    <select
                      value={newRoomMap}
                      onChange={(e) => setNewRoomMap(e.target.value as MapId)}
                      className="w-full bg-stone-950 border border-stone-800 rounded px-2.5 py-1.5 text-xs text-stone-100 outline-none"
                    >
                      {MAP_LIST.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-stone-400 mb-1">Oyun Modu</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'ffa', label: 'Herkes Tek' },
                          { id: 'tdm', label: 'Takımlı' },
                          { id: 'coop', label: 'Co-op' },
                        ] as Array<{ id: MultiplayerMode; label: string }>
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setNewRoomMode(m.id)}
                          className={`py-1.5 px-2 rounded text-[11px] font-medium border cursor-pointer ${
                            newRoomMode === m.id
                              ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                              : 'bg-stone-950 border-stone-800 text-stone-400'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                        <span>Maks. Oyuncu</span>
                        <span className="font-mono-tech text-amber-400">{newRoomMaxPlayers}</span>
                      </div>
                      <input
                        type="range"
                        min={2}
                        max={16}
                        value={newRoomMaxPlayers}
                        onChange={(e) => setNewRoomMaxPlayers(parseInt(e.target.value, 10))}
                        className="w-full accent-amber-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                        <span>Sunucu Botu</span>
                        <span className="font-mono-tech text-amber-400">{newRoomBots}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={12}
                        value={newRoomBots}
                        onChange={(e) => setNewRoomBots(parseInt(e.target.value, 10))}
                        className="w-full accent-amber-500"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onCreateRoom({
                        roomName: newRoomName.trim() || 'Harekat Odası',
                        mapId: newRoomMap,
                        mode: newRoomMode,
                        maxPlayers: newRoomMaxPlayers,
                        botCount: newRoomBots,
                      })
                    }
                    className="w-full py-2.5 px-4 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-display font-bold text-sm tracking-wide transition-colors cursor-pointer"
                  >
                    Odayı Kur & Başlat
                  </button>
                </div>
              </div>
            </div>
          )}

          {lobbyTab === 'itch' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm text-stone-300">
              <div className="bg-stone-900/75 border border-stone-800 rounded p-5 space-y-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-amber-400">
                    1. Hazır itch-bundle.zip Paketini İndir
                  </h3>
                  <p className="text-xs text-stone-300 mt-1 leading-relaxed">
                    <code className="text-stone-100">index.html</code> doğrudan ZIP kökünde ve tüm
                    varlık yolları göreceli (<code className="text-stone-100">./assets/...</code>)
                    olacak şekilde paketlenir. Yerel CLI ile üretmek için:{' '}
                    <code className="text-amber-300 font-mono-tech">npm run itch:package</code>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadItchZip}
                  disabled={zipDownloading}
                  className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-display font-bold text-sm tracking-wide transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  {zipDownloading ? 'Paket Doğrulanıyor...' : 'itch-bundle.zip İndir'}
                </button>

                {zipError && (
                  <div className="p-2.5 rounded bg-red-950/60 border border-red-800 text-xs text-red-200">
                    {zipError}
                  </div>
                )}

                <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed text-stone-300 pt-2 border-t border-stone-800">
                  <li>
                    itch.io &rarr; <em>Create new project</em> &rarr; Kind of project:{' '}
                    <strong className="text-stone-100">HTML</strong> seçin.
                  </li>
                  <li>
                    <em>Uploads</em> bölümünden <strong className="text-stone-100">itch-bundle.zip</strong>{' '}
                    dosyasını açmadan yükleyin ve <strong>&quot;This file will be played in the browser&quot;</strong>{' '}
                    kutusunu işaretleyin.
                  </li>
                  <li>
                    Viewport: <strong className="text-stone-100">1280 × 720</strong> + <em>Fullscreen button</em>{' '}
                    seçeneğini açıp yayınlayın.
                  </li>
                </ol>

                <div className="pt-2 border-t border-stone-800 space-y-1.5">
                  <div className="text-[11px] font-semibold text-stone-200">
                    Canlı Çok Oyunculu Sunucu Adresi
                  </div>
                  <div className="p-2 rounded bg-stone-950 border border-stone-800 font-mono-tech text-[11px] text-emerald-400 break-all">
                    {DEFAULT_ONLINE_SERVER_URL}
                  </div>
                </div>
              </div>

              <div className="bg-stone-900/75 border border-stone-800 rounded p-5 space-y-3.5">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  <h3 className="font-display text-lg font-bold text-stone-100">
                    2. Butler CLI ile Otomatik Yükleme
                  </h3>
                </div>
                <p className="text-xs leading-relaxed text-stone-300">
                  itch.io&apos;nun resmi <strong className="text-stone-100">butler</strong> aracıyla
                  tek komutta derleyip doğrudan yayınlayabilirsin. Hedef bilgilerini gir:
                </p>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Kullanıcı Adı</label>
                    <input
                      type="text"
                      value={itchUser}
                      onChange={(e) => setItchUser(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500 rounded px-2 py-1.5 text-xs font-mono-tech text-stone-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Oyun Slug</label>
                    <input
                      type="text"
                      value={itchGame}
                      onChange={(e) => setItchGame(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500 rounded px-2 py-1.5 text-xs font-mono-tech text-stone-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Kanal</label>
                    <input
                      type="text"
                      value={itchChannel}
                      onChange={(e) => setItchChannel(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500 rounded px-2 py-1.5 text-xs font-mono-tech text-stone-100 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] text-stone-400">
                    Derle + paketle + butler ile tek komutta gönder:
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded bg-stone-950 border border-stone-800 font-mono-tech text-[11px] text-amber-300">
                    <span className="truncate">{npmPushCmd}</span>
                    <button
                      type="button"
                      onClick={() => copyText('npm', npmPushCmd)}
                      className="shrink-0 p-1 rounded hover:bg-stone-800 text-stone-300 cursor-pointer"
                      title="Kopyala"
                    >
                      {copiedCmd === 'npm' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <div className="text-[11px] text-stone-400 pt-1">
                    Veya indirdiğin ZIP dosyasıyla doğrudan:
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded bg-stone-950 border border-stone-800 font-mono-tech text-[11px] text-stone-200">
                    <span className="truncate">{butlerPushCmd}</span>
                    <button
                      type="button"
                      onClick={() => copyText('butler', butlerPushCmd)}
                      className="shrink-0 p-1 rounded hover:bg-stone-800 text-stone-300 cursor-pointer"
                      title="Kopyala"
                    >
                      {copiedCmd === 'butler' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-stone-950/80 border border-stone-800 text-[11px] text-stone-400 leading-relaxed">
                  İlk kullanım öncesi terminalde <code className="text-stone-200">butler login</code>{' '}
                  çalıştırın. GitHub Actions CI otomasyonu için{' '}
                  <code className="text-stone-200">.github/workflows/itch-deploy.yml</code> şablonu
                  projeye eklendi.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. ARMORY / SUPPLY SHOP (B Key)
  if (hud.phase === 'armory') {
    const dmgCost = [250, 400, 600][hud.damageBonusLevel] ?? 0;

    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-stone-950/80 p-6">
        <div className="w-full max-w-2xl bg-stone-950/95 border border-stone-800 rounded-lg p-6 shadow-2xl">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-stone-800">
            <div>
              <h2 className="font-display text-2xl font-bold text-stone-100">
                Taktik Cephanelik
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Dalga {hud.wave} · Bütçe ile zırh, sağlık ve mühimmat ikmali yap
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-stone-400">Mevcut Bütçe</div>
              <div className="font-mono-tech text-2xl font-bold text-emerald-400">${hud.cash}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <button
              type="button"
              onClick={() => onBuyItem('armor')}
              disabled={hud.cash < 150 || hud.armor >= hud.maxArmor}
              className="flex items-center justify-between p-3.5 rounded bg-stone-900 border border-stone-800 hover:border-amber-500/60 disabled:opacity-45 disabled:hover:border-stone-800 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-sky-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-stone-100">+50 Kevlar Zırh</div>
                  <div className="text-xs text-stone-400">Mevcut: {hud.armor}/{hud.maxArmor}</div>
                </div>
              </div>
              <span className="font-mono-tech font-bold text-emerald-400 text-sm">$150</span>
            </button>

            <button
              type="button"
              onClick={() => onBuyItem('medkit')}
              disabled={hud.cash < 100 || hud.hp >= hud.maxHp}
              className="flex items-center justify-between p-3.5 rounded bg-stone-900 border border-stone-800 hover:border-amber-500/60 disabled:opacity-45 disabled:hover:border-stone-800 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Heart className="w-5 h-5 text-red-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-stone-100">+60 İlk Yardım Kiti</div>
                  <div className="text-xs text-stone-400">Sağlık: {hud.hp}/{hud.maxHp}</div>
                </div>
              </div>
              <span className="font-mono-tech font-bold text-emerald-400 text-sm">$100</span>
            </button>

            <button
              type="button"
              onClick={() => onBuyItem('grenades')}
              disabled={hud.cash < 120 || hud.grenades >= 6}
              className="flex items-center justify-between p-3.5 rounded bg-stone-900 border border-stone-800 hover:border-amber-500/60 disabled:opacity-45 disabled:hover:border-stone-800 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Flame className="w-5 h-5 text-orange-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-stone-100">+2 El Bombası</div>
                  <div className="text-xs text-stone-400">Taşınan: {hud.grenades}/6</div>
                </div>
              </div>
              <span className="font-mono-tech font-bold text-emerald-400 text-sm">$120</span>
            </button>

            <button
              type="button"
              onClick={() => onBuyItem('ammo')}
              disabled={hud.cash < 110}
              className="flex items-center justify-between p-3.5 rounded bg-stone-900 border border-stone-800 hover:border-amber-500/60 disabled:opacity-45 disabled:hover:border-stone-800 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-stone-100">Tam Cephane İkmali</div>
                  <div className="text-xs text-stone-400">Tüm 4 silahı doldur</div>
                </div>
              </div>
              <span className="font-mono-tech font-bold text-emerald-400 text-sm">$110</span>
            </button>

            <button
              type="button"
              onClick={() => onBuyItem('damage')}
              disabled={hud.damageBonusLevel >= 3 || hud.cash < dmgCost}
              className="sm:col-span-2 flex items-center justify-between p-3.5 rounded bg-stone-900 border border-stone-800 hover:border-amber-500/60 disabled:opacity-45 disabled:hover:border-stone-800 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Crosshair className="w-5 h-5 text-red-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-stone-100">
                    Zırh Delici Mühimmat (Seviye {hud.damageBonusLevel}/3)
                  </div>
                  <div className="text-xs text-stone-400">
                    Tüm silah hasarını kalıcı olarak +%15 artırır
                  </div>
                </div>
              </div>
              <span className="font-mono-tech font-bold text-emerald-400 text-sm">
                {hud.damageBonusLevel >= 3 ? 'Maksimum' : `$${dmgCost}`}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={onCloseArmory}
            className="w-full py-3 px-6 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-display font-bold text-base tracking-wide transition-colors cursor-pointer"
          >
            Çatışmaya Dön (B)
          </button>
        </div>
      </div>
    );
  }

  // 3. PAUSE & SETTINGS SCREEN (ESC)
  if (hud.phase === 'paused') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-stone-950/80 p-6">
        <div className="w-full max-w-md bg-stone-950/95 border border-stone-800 rounded-lg p-6 shadow-2xl">
          <h2 className="font-display text-2xl font-bold text-stone-100 mb-1">
            Oyun Duraklatıldı
          </h2>
          <p className="text-xs text-stone-400 mb-5">
            {MAPS[mc.mapId].name} · {hud.kills} Kill · Bütçe ${hud.cash}
          </p>

          <div className="space-y-4 mb-6 pt-4 border-t border-stone-800">
            <div>
              <div className="flex items-center justify-between text-xs text-stone-300 mb-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  Fare Hassasiyeti
                </span>
                <span className="font-mono-tech">{(settings.sensitivity * 1000).toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0.0008}
                max={0.005}
                step={0.0001}
                value={settings.sensitivity}
                onChange={(e) => onUpdateSettings({ sensitivity: parseFloat(e.target.value) })}
                className="w-full accent-amber-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-stone-300 mb-1.5">
                <span>Görüş Açısı (FOV)</span>
                <span className="font-mono-tech">{settings.fov}°</span>
              </div>
              <input
                type="range"
                min={65}
                max={95}
                step={1}
                value={settings.fov}
                onChange={(e) => onUpdateSettings({ fov: parseInt(e.target.value, 10) })}
                className="w-full accent-amber-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-stone-300 mb-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  Ses Seviyesi
                </span>
                <span className="font-mono-tech">%{Math.round(settings.volume * 100)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.volume}
                onChange={(e) => onUpdateSettings({ volume: parseFloat(e.target.value) })}
                className="w-full accent-amber-500"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-2.5 px-4 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-display font-bold tracking-wide transition-colors cursor-pointer"
            >
              Devam Et
            </button>
            <button
              type="button"
              onClick={onOpenArmory}
              className="w-full py-2.5 px-4 rounded bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-100 text-sm font-semibold transition-colors cursor-pointer"
            >
              Taktik Cephanelik (${hud.cash})
            </button>
            {hud.isMultiplayer ? (
              <button
                type="button"
                onClick={onLeaveRoom}
                className="w-full py-2.5 px-4 rounded bg-stone-900 hover:bg-red-950/70 border border-stone-800 text-red-300 text-sm font-medium transition-colors cursor-pointer"
              >
                Odadan Ayrıl ve Lobiye Dön
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onReturnToLobby}
                  className="w-full py-2.5 px-4 rounded bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 text-sm font-medium transition-colors cursor-pointer"
                >
                  Harita ve Operatör Seçimine Dön
                </button>
                <button
                  type="button"
                  onClick={onRestart}
                  className="w-full py-2.5 px-4 rounded bg-stone-900 hover:bg-red-950/70 border border-stone-800 text-red-300 text-sm font-medium transition-colors cursor-pointer"
                >
                  Operasyonu Sıfırla
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 4. DEATH / COMBAT REPORT SCREEN
  const accuracyPct =
    hud.shotsFired > 0 ? Math.round((hud.shotsHit / hud.shotsFired) * 100) : 0;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-red-950/75 p-6">
      <div className="w-full max-w-lg bg-stone-950/95 border border-red-900/60 rounded-lg p-7 shadow-2xl text-center">
        <div className="text-xs font-medium tracking-widest text-red-400 uppercase mb-1">
          Operasyon Raporu · {MAPS[mc.mapId].name}
        </div>
        <h2 className="font-display text-4xl font-bold text-stone-100 mb-5">
          Saf Dışı Kaldın
        </h2>

        <div className="grid grid-cols-3 gap-3 mb-6 text-left">
          <div className="bg-stone-900 border border-stone-800 rounded p-3">
            <div className="text-xs text-stone-400">Skor</div>
            <div className="font-mono-tech text-xl font-bold text-stone-100">{hud.score}</div>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded p-3">
            <div className="text-xs text-stone-400">Etkisiz Hedef</div>
            <div className="font-mono-tech text-xl font-bold text-stone-100">{hud.kills}</div>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded p-3">
            <div className="text-xs text-stone-400">Kafadan Vuruş</div>
            <div className="font-mono-tech text-xl font-bold text-red-400">{hud.headshots}</div>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded p-3">
            <div className="text-xs text-stone-400">İsabet Oranı</div>
            <div className="font-mono-tech text-xl font-bold text-amber-400">%{accuracyPct}</div>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded p-3">
            <div className="text-xs text-stone-400">Toplam Hasar</div>
            <div className="font-mono-tech text-xl font-bold text-stone-100">{hud.damageDealt}</div>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded p-3">
            <div className="text-xs text-stone-400">Ulaşılan Dalga</div>
            <div className="font-mono-tech text-xl font-bold text-amber-400">{hud.wave}</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onRestart}
            className="flex-1 py-3 px-6 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-display font-bold text-base tracking-wide transition-colors cursor-pointer"
          >
            Yeniden Başla
          </button>
          <button
            type="button"
            onClick={onReturnToLobby}
            className="py-3 px-5 rounded bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 font-medium text-sm transition-colors cursor-pointer"
          >
            Hazırlık Lobisi
          </button>
        </div>
      </div>
    </div>
  );
};
