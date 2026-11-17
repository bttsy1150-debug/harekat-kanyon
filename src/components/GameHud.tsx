import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Shield, Heart, Flame, Flashlight, Swords, MessageSquare, Trophy } from 'lucide-react';
import { HudState, MAPS, OPERATORS, WEAPONS, WeaponId } from '../game/types';

interface GameHudProps {
  hud: HudState;
  minimapRef: React.RefObject<HTMLCanvasElement | null>;
  onSendChat: (text: string) => void;
  onChatTypingChange: (typing: boolean) => void;
}

const WEAPON_ORDER: WeaponId[] = ['pistol', 'rifle', 'shotgun', 'sniper'];

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  minimapRef,
  onSendChat,
  onChatTypingChange,
}) => {
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!hud.isMultiplayer || hud.phase !== 'playing') {
      setScoreboardOpen(false);
      if (chatOpen) {
        setChatOpen(false);
        onChatTypingChange(false);
      }
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setScoreboardOpen(true);
      } else if ((e.code === 'KeyT' || e.code === 'Enter') && !chatOpen) {
        e.preventDefault();
        setChatOpen(true);
        onChatTypingChange(true);
        setTimeout(() => chatInputRef.current?.focus(), 20);
      } else if (e.code === 'Escape' && chatOpen) {
        e.preventDefault();
        setChatOpen(false);
        setChatInput('');
        onChatTypingChange(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setScoreboardOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [hud.isMultiplayer, hud.phase, chatOpen, onChatTypingChange]);

  const activeWeapon = WEAPONS[hud.currentWeapon];
  const activeAmmo = hud.ammoByWeapon[hud.currentWeapon];
  const showHud = hud.phase === 'playing' || hud.phase === 'paused' || hud.phase === 'armory';

  if (!showHud) return null;

  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const armorPct = Math.max(0, Math.min(100, (hud.armor / hud.maxArmor) * 100));
  const lowHp = hud.hp <= 30;
  const stanceLabel =
    hud.stance === 'crouching' ? 'Eğilmiş' : hud.stance === 'sprinting' ? 'Koşu' : 'Ayakta';
  const activeMap = MAPS[hud.matchConfig.mapId];
  const activeOp = OPERATORS[hud.matchConfig.operatorId];
  const teamLabel =
    hud.mpTeam === 'alpha' ? 'Alfa Takımı' : hud.mpTeam === 'bravo' ? 'Bravo Takımı' : 'Herkes Tek';

  const submitChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      onSendChat(chatInput);
    }
    setChatInput('');
    setChatOpen(false);
    onChatTypingChange(false);
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-10 overflow-hidden">
      {/* Low HP / Damage Edge Vignette */}
      <div
        className="fixed inset-0 transition-opacity duration-150"
        style={{
          opacity: Math.max(hud.damageFlash * 0.85, lowHp ? 0.35 : 0),
          background:
            'radial-gradient(ellipse at center, transparent 48%, rgba(185, 28, 28, 0.78) 100%)',
        }}
      />

      {/* Directional Damage Indicators */}
      {hud.damageIndicators.map((ind) => (
        <div
          key={ind.id}
          className="fixed top-1/2 left-1/2 w-56 h-56 -ml-28 -mt-28"
          style={{
            transform: `rotate(${ind.angleRad}rad)`,
            opacity: ind.intensity,
          }}
        >
          <div className="mx-auto w-14 h-2.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]" />
        </div>
      ))}

      {/* Sniper Scope Overlay */}
      {hud.sniperScoped && (
        <div className="fixed inset-0 flex items-center justify-center">
          <div
            className="fixed inset-0"
            style={{
              background:
                'radial-gradient(circle at center, transparent 27%, rgba(5,5,5,0.96) 28.5%, #000 45%)',
            }}
          />
          <div className="relative w-[56vmin] h-[56vmin] rounded-full border border-stone-700/80">
            <div className="absolute left-0 right-0 top-1/2 h-px bg-stone-950/90" />
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-stone-950/90" />
            <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 -ml-[3px] -mt-[3px] rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
            {[-2, -1, 1, 2].map((n) => (
              <React.Fragment key={n}>
                <div
                  className="absolute top-1/2 w-px h-2.5 -mt-[5px] bg-stone-950/90"
                  style={{ left: `${50 + n * 8}%` }}
                />
                <div
                  className="absolute left-1/2 h-px w-2.5 -ml-[5px] bg-stone-950/90"
                  style={{ top: `${50 + n * 8}%` }}
                />
              </React.Fragment>
            ))}
          </div>

          {/* Breath Hold Gauge */}
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-48 bg-stone-950/85 border border-stone-700/80 rounded px-3 py-1.5 text-center">
            <div className="flex items-center justify-between text-[11px] text-stone-300 mb-1">
              <span>{hud.holdingBreath ? 'Nefes Tutuluyor' : 'Shift · Nefes Tut'}</span>
              <span className="font-mono-tech">%{hud.breathMeter}</span>
            </div>
            <div className="h-1 bg-stone-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-75 ${
                  hud.holdingBreath ? 'bg-sky-400' : 'bg-stone-400'
                }`}
                style={{ width: `${hud.breathMeter}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Pointer Lock Hint if browser cooldown prevented immediate re-lock */}
      {hud.phase === 'playing' && !hud.pointerLocked && !chatOpen && hud.mpRespawnTimer <= 0 && (
        <div className="fixed top-[41%] left-1/2 -translate-x-1/2 bg-stone-950/90 border border-amber-500/60 px-4 py-1.5 rounded text-xs font-medium text-amber-300 shadow-lg">
          Fareyi kilitlemek için ekrana tıkla
        </div>
      )}

      {/* Dynamic Tactical Crosshair */}
      {!hud.sniperScoped && hud.phase === 'playing' && hud.mpRespawnTimer <= 0 && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {!hud.aiming && (
            <div className="w-1 h-1 rounded-full bg-amber-300/90 shadow-[0_0_3px_rgba(0,0,0,0.9)]" />
          )}
          <div
            className="absolute left-1/2 -translate-x-1/2 w-[2px] h-2.5 bg-stone-100 shadow-[0_0_3px_rgba(0,0,0,0.9)]"
            style={{ bottom: `${hud.crosshairSpread}px` }}
          />
          <div
            className="absolute left-1/2 -translate-x-1/2 w-[2px] h-2.5 bg-stone-100 shadow-[0_0_3px_rgba(0,0,0,0.9)]"
            style={{ top: `${hud.crosshairSpread}px` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-[2px] w-2.5 bg-stone-100 shadow-[0_0_3px_rgba(0,0,0,0.9)]"
            style={{ right: `${hud.crosshairSpread}px` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-[2px] w-2.5 bg-stone-100 shadow-[0_0_3px_rgba(0,0,0,0.9)]"
            style={{ left: `${hud.crosshairSpread}px` }}
          />
        </div>
      )}

      {/* Hitmarker X */}
      {hud.hitmarkerType !== 'none' && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          {[45, -45].map((deg) => (
            <div
              key={deg}
              className="absolute top-1/2 left-1/2 w-6 h-[2px] -ml-3 -mt-px"
              style={{
                transform: `rotate(${deg}deg)`,
                backgroundColor:
                  hud.hitmarkerType === 'kill' || hud.hitmarkerType === 'head'
                    ? '#ef4444'
                    : '#f5f5f4',
                boxShadow:
                  hud.hitmarkerType === 'kill' || hud.hitmarkerType === 'head'
                    ? '0 0 8px rgba(239,68,68,0.9)'
                    : '0 0 4px rgba(0,0,0,0.8)',
              }}
            />
          ))}
        </div>
      )}

      {/* Reload Progress */}
      {hud.reloading && (
        <div className="fixed top-[57%] left-1/2 -translate-x-1/2 w-40 bg-stone-950/85 border border-stone-700/80 rounded px-2.5 py-1.5 text-center">
          <div className="text-[11px] font-medium tracking-wider text-amber-400 mb-1">
            Şarjör Değiştiriliyor
          </div>
          <div className="h-1 bg-stone-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all duration-75"
              style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Wave / Pickup Banners */}
      {hud.bannerText && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-stone-950/90 border border-amber-500/40 px-6 py-2.5 rounded text-center shadow-lg">
          <div className="font-display text-2xl font-bold tracking-wider text-amber-400">
            {hud.bannerText}
          </div>
        </div>
      )}

      {hud.pickupToast && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 bg-stone-950/85 border border-emerald-500/40 px-4 py-1.5 rounded text-xs font-medium tracking-wide text-emerald-300">
          {hud.pickupToast}
        </div>
      )}

      {/* TOP-LEFT: Tactical Radar Minimap */}
      <div className="fixed top-5 left-5 flex flex-col items-start gap-2">
        <div className="w-40 h-40 rounded-full border-2 border-stone-700/90 bg-stone-950/85 shadow-xl overflow-hidden">
          <canvas ref={minimapRef} width={160} height={160} className="w-full h-full block" />
        </div>
        {hud.isMultiplayer && hud.mpRoom ? (
          <div className="flex items-center gap-2 text-xs text-stone-300 bg-stone-950/85 border border-stone-800 px-3 py-1 rounded">
            <span className="font-display font-semibold text-amber-400">
              {hud.mpRoom.name}
            </span>
            <span className="text-stone-600">·</span>
            <span
              className={`font-medium ${
                hud.mpTeam === 'alpha'
                  ? 'text-sky-400'
                  : hud.mpTeam === 'bravo'
                  ? 'text-red-400'
                  : 'text-amber-300'
              }`}
            >
              {teamLabel}
            </span>
            <span className="text-stone-600">·</span>
            <span className="font-mono-tech">{hud.mpPlayers.length} Oyuncu</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-stone-300 bg-stone-950/85 border border-stone-800 px-3 py-1 rounded">
            <span className="font-display font-semibold text-amber-400">
              {hud.matchConfig.mode === 'skirmish' ? 'Çatışma' : `Dalga ${hud.wave}`}
            </span>
            <span className="text-stone-600">·</span>
            <span className="font-mono-tech">
              Hedef {hud.waveBotsAlive + (hud.matchConfig.mode === 'waves' ? hud.waveBotsPending : 0)}
            </span>
            <span className="text-stone-600">·</span>
            <span className="text-stone-400">{activeMap.name}</span>
          </div>
        )}
      </div>

      {/* MULTIPLAYER TACTICAL CHAT (Mid-Left) */}
      {hud.isMultiplayer && (
        <div className="fixed left-5 top-56 w-72 flex flex-col gap-1.5">
          <div className="flex flex-col gap-1">
            {hud.mpChat.slice(-5).map((m) => (
              <div
                key={m.id}
                className="bg-stone-950/80 border border-stone-800/80 px-2.5 py-1 rounded text-[11px] leading-snug"
              >
                <span className={m.system ? 'text-amber-400 font-semibold' : 'text-sky-400 font-semibold'}>
                  {m.sender}:{' '}
                </span>
                <span className="text-stone-200">{m.text}</span>
              </div>
            ))}
          </div>
          {chatOpen && (
            <form onSubmit={submitChat} className="pointer-events-auto flex items-center gap-1.5 mt-1">
              <div className="flex-1 flex items-center gap-1.5 bg-stone-950/95 border border-amber-500/70 rounded px-2.5 py-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  maxLength={140}
                  placeholder="Mesaj yaz (Enter gönder, ESC iptal)..."
                  className="w-full bg-transparent text-xs text-stone-100 outline-none placeholder:text-stone-500"
                />
              </div>
            </form>
          )}
        </div>
      )}

      {/* MULTIPLAYER RESPAWN COUNTDOWN */}
      {hud.isMultiplayer && hud.mpRespawnTimer > 0 && (
        <div className="fixed inset-0 flex items-center justify-center bg-red-950/45">
          <div className="bg-stone-950/92 border border-red-800/70 rounded-lg px-8 py-5 text-center shadow-2xl">
            <div className="text-xs uppercase tracking-widest text-red-400 font-semibold mb-1">
              Saf Dışı Kaldın
            </div>
            <div className="font-display text-3xl font-bold text-stone-100">
              Yeniden Doğuş: <span className="font-mono-tech text-amber-400">{hud.mpRespawnTimer.toFixed(1)}s</span>
            </div>
          </div>
        </div>
      )}

      {/* MULTIPLAYER TAB SCOREBOARD */}
      {hud.isMultiplayer && scoreboardOpen && hud.mpRoom && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-stone-950/70 p-6">
          <div className="w-full max-w-2xl bg-stone-950/95 border border-stone-800 rounded-lg p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h3 className="font-display text-lg font-bold text-stone-100">
                  {hud.mpRoom.name} — Skor Tablosu
                </h3>
              </div>
              <span className="text-xs text-stone-400">{activeMap.name}</span>
            </div>

            <div className="grid grid-cols-12 text-[11px] font-semibold text-stone-400 uppercase pb-2 border-b border-stone-800/80 px-2">
              <div className="col-span-5">Operatör</div>
              <div className="col-span-2">Takım</div>
              <div className="col-span-1 text-right">Kill</div>
              <div className="col-span-2 text-right">Ölüm</div>
              <div className="col-span-2 text-right">Skor</div>
            </div>
            <div className="divide-y divide-stone-800/60 max-h-72 overflow-y-auto">
              {[...hud.mpPlayers]
                .sort((a, b) => b.score - a.score)
                .map((p) => (
                  <div
                    key={p.id}
                    className="grid grid-cols-12 items-center py-2 px-2 text-xs text-stone-200"
                  >
                    <div className="col-span-5 font-medium truncate">
                      {p.name}{' '}
                      <span className="text-[10px] text-stone-500">
                        ({OPERATORS[p.operatorId]?.role.split(' ')[0] || 'Asker'})
                      </span>
                    </div>
                    <div
                      className={`col-span-2 text-[11px] font-medium ${
                        p.team === 'alpha'
                          ? 'text-sky-400'
                          : p.team === 'bravo'
                          ? 'text-red-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {p.team === 'alpha' ? 'Alfa' : p.team === 'bravo' ? 'Bravo' : 'Solo'}
                    </div>
                    <div className="col-span-1 text-right font-mono-tech">{p.kills}</div>
                    <div className="col-span-2 text-right font-mono-tech text-stone-400">{p.deaths}</div>
                    <div className="col-span-2 text-right font-mono-tech font-bold text-amber-400">
                      {p.score}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TOP-RIGHT: Combat Telemetry & Killfeed */}
      <div className="fixed top-5 right-5 flex flex-col items-end gap-2.5">
        <div className="flex items-center gap-4 bg-stone-950/85 border border-stone-800 px-4 py-2 rounded text-sm">
          <div>
            <span className="text-stone-400 text-xs mr-1.5">Skor</span>
            <span className="font-mono-tech font-bold text-stone-100">{hud.score}</span>
          </div>
          <span className="text-stone-700">/</span>
          <div>
            <span className="text-stone-400 text-xs mr-1.5">Kill</span>
            <span className="font-mono-tech font-bold text-stone-100">{hud.kills}</span>
          </div>
          <span className="text-stone-700">/</span>
          <div>
            <span className="text-stone-400 text-xs mr-1.5">Bütçe</span>
            <span className="font-mono-tech font-bold text-emerald-400">${hud.cash}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {hud.killfeed.map((k) => (
            <div
              key={k.id}
              className="killfeed-item flex items-center gap-2 bg-stone-950/85 border border-stone-800/90 px-3 py-1 rounded text-xs"
            >
              <span className="font-medium text-emerald-400">{k.killer}</span>
              <span className="text-stone-500">→</span>
              {k.headshot && (
                <span className="inline-flex items-center gap-1 text-red-400 font-semibold">
                  <Crosshair className="w-3 h-3" />
                  Kafadan
                </span>
              )}
              {k.explosive && (
                <span className="inline-flex items-center gap-1 text-orange-400 font-semibold">
                  <Flame className="w-3 h-3" />
                  Patlama
                </span>
              )}
              {k.melee && (
                <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                  <Swords className="w-3 h-3" />
                  Yakın Dövüş
                </span>
              )}
              <span className="text-stone-200">{k.victim}</span>
            </div>
          ))}
        </div>
      </div>

      {/* BOTTOM-LEFT: Operator Vitals */}
      <div className="fixed bottom-5 left-5 w-72 bg-stone-950/85 border border-stone-800 rounded p-3.5">
        <div className="flex items-center justify-between text-[11px] text-stone-400 pb-2 mb-2 border-b border-stone-800/80">
          <span className="font-medium text-stone-200">{activeOp.callsign}</span>
          <span>{activeOp.role}</span>
        </div>

        <div className="flex items-center justify-between text-xs mb-1">
          <span className="inline-flex items-center gap-1.5 text-stone-300 font-medium">
            <Heart className="w-3.5 h-3.5 text-red-400" />
            Sağlık
          </span>
          <span className="font-mono-tech font-bold text-base text-stone-100">{hud.hp}</span>
        </div>
        <div className="h-2.5 bg-stone-800 rounded-sm overflow-hidden mb-2.5">
          <div
            className="h-full transition-all duration-150"
            style={{
              width: `${hpPct}%`,
              backgroundColor: lowHp ? '#ef4444' : '#22c55e',
            }}
          />
        </div>

        <div className="flex items-center justify-between text-xs mb-1">
          <span className="inline-flex items-center gap-1.5 text-stone-300 font-medium">
            <Shield className="w-3.5 h-3.5 text-sky-400" />
            Kevlar Zırh
          </span>
          <span className="font-mono-tech font-semibold text-sky-300">{hud.armor}</span>
        </div>
        <div className="h-1.5 bg-stone-800 rounded-sm overflow-hidden mb-2.5">
          <div
            className="h-full bg-sky-400 transition-all duration-150"
            style={{ width: `${armorPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-stone-400">
          <span>Durum: {stanceLabel}</span>
          <span className="font-mono-tech">Dayanıklılık %{hud.stamina}</span>
        </div>
        <div className="h-1 bg-stone-800 rounded-sm overflow-hidden mt-1">
          <div
            className="h-full bg-amber-400/90 transition-all duration-75"
            style={{ width: `${hud.stamina}%` }}
          />
        </div>
      </div>

      {/* BOTTOM-RIGHT: Weapon, Ammo, Grenades & Flashlight */}
      <div className="fixed bottom-5 right-5 bg-stone-950/85 border border-stone-800 rounded p-3.5 min-w-68">
        <div className="flex items-baseline justify-between gap-6">
          <div>
            <div className="font-display font-bold text-lg text-stone-100 leading-tight">
              {activeWeapon.name}
            </div>
            <div className="text-[11px] text-stone-400">
              {activeWeapon.modelLabel} · {activeWeapon.caliber}
            </div>
          </div>

          <div className="text-right">
            <span
              className="font-mono-tech text-3xl font-bold leading-none"
              style={{
                color: activeAmmo.mag <= Math.ceil(activeWeapon.magSize * 0.25) ? '#ef4444' : '#f59e0b',
              }}
            >
              {activeAmmo.mag}
            </span>
            <span className="font-mono-tech text-sm text-stone-400 ml-1.5">
              / {activeAmmo.reserve}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-stone-800/90">
          <div className="flex items-center gap-1.5">
            {WEAPON_ORDER.map((wId, idx) => {
              const active = hud.currentWeapon === wId;
              return (
                <div
                  key={wId}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono-tech border ${
                    active
                      ? 'bg-amber-500/20 border-amber-500/70 text-amber-300 font-bold'
                      : 'bg-stone-900/70 border-stone-800 text-stone-500'
                  }`}
                >
                  {idx + 1}·{WEAPONS[wId].modelLabel.split(' ')[0]}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-xs font-mono-tech pl-2 border-l border-stone-800">
            <span className="text-stone-300">G·{hud.grenades}</span>
            <span
              className={`inline-flex items-center gap-1 ${
                hud.flashlightOn ? 'text-amber-300' : 'text-stone-500'
              }`}
            >
              <Flashlight className="w-3.5 h-3.5" />F
            </span>
          </div>
        </div>
      </div>

      {/* Bottom-Center Hotkey Hint */}
      {hud.phase === 'playing' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-stone-400 bg-stone-950/75 border border-stone-800/80 px-3 py-1 rounded whitespace-nowrap">
          {hud.isMultiplayer
            ? 'T Sohbet · TAB Skor · B Cephanelik · F Fener · E Dipçik · G Bomba · ESC Menü'
            : 'B Cephanelik · F Fener · E Dipçik · C Eğil · G Bomba · ESC Duraklat'}
        </div>
      )}
    </div>
  );
};
