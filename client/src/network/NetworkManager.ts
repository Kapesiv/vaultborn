import { Client, Room } from 'colyseus.js';
import type { PlayerInput } from '@saab/shared';

export type RoomType = 'hub' | 'dungeon';

export class NetworkManager {
  private client: Client;
  private room: Room | null = null;

  public onStateChange: ((state: any) => void) | null = null;
  public onMessage: ((type: string, data: any) => void) | null = null;
  public onError: ((err: any) => void) | null = null;
  public onLeave: ((code: number) => void) | null = null;

  constructor() {
    const serverUrl = import.meta.env.VITE_SERVER_URL;
    if (serverUrl) {
      // Production: connect to explicit server URL (e.g. Railway)
      const wsUrl = serverUrl.replace(/^http/, 'ws');
      this.client = new Client(wsUrl);
    } else {
      // Dev: Vite runs on 5173 but game server is on 3000
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host = window.location.hostname;
      const isDev = window.location.port !== '3000' && window.location.port !== '';
      const port = isDev ? '3000' : (window.location.port || (protocol === 'wss' ? '443' : '80'));
      this.client = new Client(`${protocol}://${host}:${port}`);
    }
  }

  async joinRoom(roomType: RoomType, options: Record<string, any> = {}): Promise<Room> {
    // Leave current room if any
    if (this.room) {
      await this.room.leave();
    }

    this.room = await this.client.joinOrCreate(roomType, options);

    this.room.onStateChange((state) => {
      this.onStateChange?.(state);
    });

    this.room.onMessage('*', (type, message) => {
      this.onMessage?.(type as string, message);
    });

    this.room.onError((code, message) => {
      console.error(`Room error: ${code} - ${message}`);
      this.onError?.({ code, message });
    });

    this.room.onLeave((code) => {
      console.log(`Left room with code: ${code}`);
      this.onLeave?.(code);
    });

    return this.room;
  }

  sendInput(input: PlayerInput) {
    this.room?.send('input', input);
  }

  sendMessage(type: string, data: any) {
    this.room?.send(type, data);
  }

  getRoom(): Room | null {
    return this.room;
  }

  getSessionId(): string {
    return this.room?.sessionId || '';
  }

  async leave() {
    if (this.room) {
      await this.room.leave();
      this.room = null;
    }
  }
}
