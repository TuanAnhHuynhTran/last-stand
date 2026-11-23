/**
 * In-process realtime bus (Phase 12). Services publish here; the Socket.IO hub forwards to the
 * right sockets and tracks presence. Without a hub (tests, scripts) events are simply dropped.
 *
 * Scaling note: one Node process holds all sockets today. To run several processes, plug the
 * Socket.IO Redis adapter into the hub and move presence to Redis — services stay unchanged.
 */
import { EventEmitter } from 'node:events';

export type RealtimeTarget = { user: string } | { room: string };

export interface RealtimeMessage {
  target: RealtimeTarget;
  event: string;
  data: unknown;
}

export class RealtimeBus extends EventEmitter {
  private readonly presence = new Map<string, number>();

  emitToUser(userId: string, event: string, data: unknown): void {
    this.emit('message', { target: { user: userId }, event, data } satisfies RealtimeMessage);
  }

  emitToRoom(room: string, event: string, data: unknown): void {
    this.emit('message', { target: { room }, event, data } satisfies RealtimeMessage);
  }

  connected(userId: string): void {
    const n = (this.presence.get(userId) ?? 0) + 1;
    this.presence.set(userId, n);
    if (n === 1) this.emit('presence', { userId, online: true });
  }

  disconnected(userId: string): void {
    const n = (this.presence.get(userId) ?? 1) - 1;
    if (n <= 0) {
      this.presence.delete(userId);
      this.emit('presence', { userId, online: false });
    } else this.presence.set(userId, n);
  }

  isOnline(userId: string): boolean {
    return (this.presence.get(userId) ?? 0) > 0;
  }
}
