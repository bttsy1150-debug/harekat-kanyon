import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { GameMenus } from './components/GameMenus';
import { FpsGameEngine } from './game/engine';
import {
  fetchRoomsHttp,
  getSavedCallsign,
  getSavedServerUrl,
  saveCallsign,
  saveServerUrl,
} from './game/net';
import {
  GameSettings,
  HudState,
  MapId,
  MatchConfig,
  MultiplayerMode,
  RoomSummary,
  WEAPONS,
} from './game/types';

const DEFAULT_MATCH_CONFIG: MatchConfig = {
  mapId: 'canyon',
  operatorId: 'assault',
  difficulty: 'soldier',
  botCount: 8,
  mode: 'waves',
  startingWeapon: 'rifle',
};

const INITIAL_HUD: HudState = {
  phase: 'start',
  pointerLocked: false,
  isMultiplayer: false,
  mpConnected: false,
  mpRoom: null,
  mpTeam: 'ffa',
  mpPlayers: [],
  mpRespawnTimer: 0,
  mpChat: [],
  matchConfig: DEFAULT_MATCH_CONFIG,
  hp: 100,
  maxHp: 100,
  armor: 75,
  maxArmor: 100,
  stamina: 100,
  breathMeter: 100,
  holdingBreath: false,
  flashlightOn: false,
  stance: 'standing',
  currentWeapon: 'rifle',
  ammoByWeapon: {
    pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserveMax },
    rifle: { mag: WEAPONS.rifle.magSize, reserve: WEAPONS.rifle.reserveMax },
    shotgun: { mag: WEAPONS.shotgun.magSize, reserve: WEAPONS.shotgun.reserveMax },
    sniper: { mag: WEAPONS.sniper.magSize, reserve: WEAPONS.sniper.reserveMax },
  },
  grenades: 3,
  reloading: false,
  reloadProgress: 0,
  aiming: false,
  sniperScoped: false,
  crosshairSpread: 12,
  hitmarkerType: 'none',
  damageFlash: 0,
  damageIndicators: [],
  score: 0,
  kills: 0,
  headshots: 0,
  shotsFired: 0,
  shotsHit: 0,
  damageDealt: 0,
  wave: 1,
  waveBotsAlive: 0,
  waveBotsPending: 0,
  cash: 150,
  bannerText: null,
  killfeed: [],
  damageBonusLevel: 0,
  pickupToast: null,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<FpsGameEngine | null>(null);

  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [mpError, setMpError] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string>(() => getSavedCallsign());
  const [serverUrl, setServerUrl] = useState<string>(() => getSavedServerUrl());
  const [settings, setSettings] = useState<GameSettings>({
    sensitivity: 0.0021,
    fov: 75,
    volume: 0.72,
  });

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new FpsGameEngine(mount, (nextHud) => {
      setHud(nextHud);
    });
    engine.setMultiplayerCallbacks(
      (nextRooms) => {
        setRooms(nextRooms);
        setMpError(null);
      },
      (err) => {
        setMpError(err);
      }
    );
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setMinimapCanvas(minimapRef.current);
    }
  }, [hud.phase]);

  const handleRefreshRooms = useCallback(() => {
    setMpError(null);
    engineRef.current?.refreshRooms(serverUrl);
    fetchRoomsHttp(serverUrl)
      .then((list) => setRooms(list))
      .catch(() => {
        // WebSocket fallback will still populate rooms when connected
      });
  }, [serverUrl]);

  const handlePlayerNameChange = (name: string) => {
    setPlayerName(name);
    saveCallsign(name);
  };

  const handleServerUrlChange = (url: string) => {
    setServerUrl(url);
    saveServerUrl(url);
  };

  const handleCreateRoom = (opts: {
    roomName: string;
    mapId: MapId;
    mode: MultiplayerMode;
    maxPlayers: number;
    botCount: number;
  }) => {
    setMpError(null);
    engineRef.current?.createMultiplayerRoom({
      ...opts,
      playerName: playerName.trim() || 'Komando',
      operatorId: hud.matchConfig.operatorId,
      serverUrl,
    });
  };

  const handleJoinRoom = (roomId: string) => {
    setMpError(null);
    engineRef.current?.joinMultiplayerRoom({
      roomId,
      playerName: playerName.trim() || 'Komando',
      operatorId: hud.matchConfig.operatorId,
      serverUrl,
    });
  };

  const handleSendChat = useCallback((text: string) => {
    engineRef.current?.sendChatMessage(text);
  }, []);

  const handleChatTypingChange = useCallback((typing: boolean) => {
    engineRef.current?.setChatTyping(typing);
  }, []);

  const handleUpdateSettings = (next: Partial<GameSettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      engineRef.current?.updateSettings(merged);
      return merged;
    });
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-stone-950">
      <div ref={canvasMountRef} className="fixed inset-0" />

      <GameHud
        hud={hud}
        minimapRef={minimapRef}
        onSendChat={handleSendChat}
        onChatTypingChange={handleChatTypingChange}
      />
      <GameMenus
        hud={hud}
        settings={settings}
        rooms={rooms}
        playerName={playerName}
        serverUrl={serverUrl}
        mpError={mpError}
        onPlayerNameChange={handlePlayerNameChange}
        onServerUrlChange={handleServerUrlChange}
        onRefreshRooms={handleRefreshRooms}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onLeaveRoom={() => engineRef.current?.leaveMultiplayerRoom()}
        onUpdateMatchConfig={(next) => engineRef.current?.updateMatchConfig(next)}
        onStart={() => engineRef.current?.startGame()}
        onResume={() => engineRef.current?.resumeGame()}
        onRestart={() => engineRef.current?.restartGame()}
        onReturnToLobby={() => engineRef.current?.returnToLobby()}
        onOpenArmory={() => engineRef.current?.openArmory()}
        onCloseArmory={() => engineRef.current?.closeArmory()}
        onBuyItem={(item) => engineRef.current?.buyItem(item)}
        onUpdateSettings={handleUpdateSettings}
      />
    </div>
  );
}
