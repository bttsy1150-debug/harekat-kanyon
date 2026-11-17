import { RoomSummary } from './types';

export const DEFAULT_ONLINE_SERVER_URL =
  'https://ais-pre-ipyhxiebvrgsoxpco7gob7-153481080213.europe-west1.run.app';

const STORAGE_KEY_SERVER = 'harekat_server_url';
const STORAGE_KEY_NAME = 'harekat_callsign';

export function getSavedServerUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_SERVER) || '';
  } catch {
    return '';
  }
}

export function saveServerUrl(url: string) {
  try {
    const trimmed = url.trim();
    if (trimmed) localStorage.setItem(STORAGE_KEY_SERVER, trimmed);
    else localStorage.removeItem(STORAGE_KEY_SERVER);
  } catch {
    // Ignore storage quota errors
  }
}

export function getSavedCallsign(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_NAME) || 'Komando';
  } catch {
    return 'Komando';
  }
}

export function saveCallsign(name: string) {
  try {
    localStorage.setItem(STORAGE_KEY_NAME, name.trim().slice(0, 18) || 'Komando');
  } catch {
    // Ignore
  }
}

export function resolveHttpBase(customUrl?: string): string {
  const raw = (customUrl ?? getSavedServerUrl()).trim();
  if (raw) {
    let normalized = raw.replace(/\/+$/, '');
    if (normalized.startsWith('ws://')) normalized = 'http://' + normalized.slice(5);
    else if (normalized.startsWith('wss://')) normalized = 'https://' + normalized.slice(6);
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = 'https://' + normalized;
    }
    return normalized;
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname || '';
    const proto = window.location.protocol || '';
    // When packaged & hosted on itch.io static CDN or opened locally, route WS/REST to our live multiplayer backend
    if (
      host.includes('itch.zone') ||
      host.includes('itch.io') ||
      host.includes('hwcdn.net') ||
      proto === 'file:'
    ) {
      return DEFAULT_ONLINE_SERVER_URL;
    }
    return window.location.origin;
  }

  return DEFAULT_ONLINE_SERVER_URL;
}

export function resolveWsUrl(customUrl?: string): string {
  const httpBase = resolveHttpBase(customUrl);
  const wsBase = httpBase.replace(/^http/i, 'ws');
  return `${wsBase}/ws`;
}

export async function fetchRoomsHttp(customUrl?: string): Promise<RoomSummary[]> {
  const base = resolveHttpBase(customUrl);
  const res = await fetch(`${base}/api/rooms`, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { rooms?: RoomSummary[] };
  return Array.isArray(data.rooms) ? data.rooms : [];
}

export interface ServerMessage {
  type: string;
  [key: string]: unknown;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private onMessage: (msg: ServerMessage) => void;
  private onStatusChange: (connected: boolean) => void;
  private pendingQueue: string[] = [];
  private currentUrl = '';

  constructor(
    onMessage: (msg: ServerMessage) => void,
    onStatusChange: (connected: boolean) => void
  ) {
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public connect(customUrl?: string) {
    const targetUrl = resolveWsUrl(customUrl);
    if (
      this.ws &&
      this.currentUrl === targetUrl &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.disconnect();
    this.currentUrl = targetUrl;

    try {
      const ws = new WebSocket(targetUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.onStatusChange(true);
        while (this.pendingQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
          const raw = this.pendingQueue.shift();
          if (raw) ws.send(raw);
        }
      };

      ws.onmessage = (ev) => {
        if (this.ws !== ws) return;
        try {
          const parsed = JSON.parse(String(ev.data)) as ServerMessage;
          this.onMessage(parsed);
        } catch {
          // Ignore malformed packet
        }
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.onStatusChange(false);
      };

      ws.onerror = () => {
        if (this.ws !== ws) return;
        this.onStatusChange(false);
      };
    } catch {
      this.onStatusChange(false);
    }
  }

  public disconnect() {
    this.pendingQueue.length = 0;
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      try {
        old.close();
      } catch {
        // Ignore
      }
      this.onStatusChange(false);
    }
  }

  public send(payload: Record<string, unknown>) {
    const raw = JSON.stringify(payload);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
    } else if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      if (this.pendingQueue.length < 32) {
        this.pendingQueue.push(raw);
      }
    }
  }
}
