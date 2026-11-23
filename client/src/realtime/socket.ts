/**
 * Realtime connection (Phase 12): one Socket.IO socket per signed-in tab, authenticated with
 * the access token. It reconnects by itself (token re-read on every attempt); pages subscribe
 * with `onRealtime(event, fn)`. The server stays authoritative — events only say "something
 * changed", the page then reads the state over REST (or gets it in the ack).
 */
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

const URL = (import.meta.env.VITE_SOCKET_URL as string | undefined) || '';
let socket: Socket | null = null;
const handlers = new Map<string, Set<(data: unknown) => void>>();

export type Ack<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function ensure(): Socket | null {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  if (socket) return socket;
  socket = io(URL || undefined, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: useAuthStore.getState().accessToken ?? '' }),
    reconnectionDelay: 800,
    reconnectionDelayMax: 6000,
  });
  socket.onAny((event: string, data: unknown) => {
    for (const fn of handlers.get(event) ?? []) fn(data);
  });
  socket.on('connect', () => {
    for (const fn of handlers.get('connect') ?? []) fn(null);
  });
  return socket;
}

export function connectRealtime(): void {
  ensure();
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
}

export function isRealtimeConnected(): boolean {
  return Boolean(socket?.connected);
}

export function onRealtime<T = unknown>(event: string, fn: (data: T) => void): () => void {
  ensure();
  const set = handlers.get(event) ?? new Set();
  set.add(fn as (d: unknown) => void);
  handlers.set(event, set);
  return () => set.delete(fn as (d: unknown) => void);
}

/** Emit with acknowledgement; rejects after `timeoutMs` (caller falls back to REST). */
export function emitRealtime<T>(event: string, payload: unknown, timeoutMs = 6000): Promise<Ack<T>> {
  const s = ensure();
  if (!s || !s.connected) return Promise.reject(new Error('offline'));
  return new Promise((resolve, reject) => {
    s.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: Ack<T>) => (err ? reject(err) : resolve(res)));
  });
}

// Signing out closes the socket.
useAuthStore.subscribe((s, prev) => {
  if (prev.accessToken && !s.accessToken) disconnectRealtime();
});
