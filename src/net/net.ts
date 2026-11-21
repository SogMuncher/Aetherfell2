import Peer from 'peerjs';
import type { DataConnection, PeerOptions } from 'peerjs';
import type { CheatValue, Command, EntitySnapshot, GuestMessage, HostMessage, InputSnapshot, NetStatus, SharedLog, SimEvent, SimState } from '../types';
import { SharedLogTracker, cleanCheatValue, cleanFriendId, cleanInput, inputHasPress, isGuestMessage, isHostMessage, snapshotFor } from './messages';

const PREFIX = 'aetherfell2-';

/**
 * Signalling server. Defaults to the free public PeerJS cloud. `?peer=host:port` in the URL points
 * at a self-hosted PeerServer instead (handy for LAN parties or locked-down networks).
 */
function peerOptions(): PeerOptions {
  const custom = new URLSearchParams(location.search).get('peer');
  if (!custom) return { debug: 0 };
  const [host, port] = custom.split(':');
  return { host: host || 'localhost', port: Number(port) || 9000, path: '/', secure: location.protocol === 'https:', debug: 0 };
}
const SNAP_EVERY = 2;
/** A guest says "still here" this often (ms), even while its tab is in the background. */
const PING_MS = 2000;

function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)] ?? 'A';
  return s;
}

export interface GuestHandlers {
  welcome(playerId: string, save: Uint8Array): void;
  snapshot(snap: EntitySnapshot): void;
  events(events: SimEvent[]): void;
  /** The party's journal, quests, places and faction feelings changed. */
  shared(log: SharedLog): void;
}

/** How far around each friend things are sent to them (metres). Things are drawn up to 160 m away. */
const INTEREST = 220;

/** This browser's lasting co-op id, so a host keeps our character for us between sessions. */
function friendId(): string {
  const KEY = 'aetherfell2.friendId';
  try {
    const have = localStorage.getItem(KEY);
    if (have && /^[a-z0-9]{8,32}$/.test(have)) return have;
    let id = '';
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 16; i++) id += chars[Math.floor(Math.random() * chars.length)] ?? 'a';
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return '';
  }
}

interface Guest {
  /** The sure road: ordered and reliable. Joining, presses, events, the shared record. */
  sure: DataConnection;
  /** The fast road: unordered and may drop messages. Movement and snapshots, so one late packet never holds the rest up. */
  fast: DataConnection | null;
  playerId: string;
  heard: number;
}

/**
 * Peer-to-peer co-op. The host runs the one true simulation; guests send their input each tick and
 * receive a compressed copy of the world on joining, then a stream of entity snapshots and events.
 * Each friend has two connections: a sure one and a fast one (see Guest). Solo play never touches the network.
 */
export class NetSession {
  status: NetStatus = { role: 'solo', code: null, peers: 0, message: '' };
  private peer: Peer | null = null;
  /** Host: friends by connection id. */
  private guests = new Map<string, Guest>();
  /** Host: fast roads that arrived before their friend said hello. */
  private earlyFast = new Map<string, DataConnection>();
  private host: DataConnection | null = null;
  private hostFast: DataConnection | null = null;
  private tickCount = 0;
  private shared = new SharedLogTracker();
  /** Host: tile changes gathered between snapshots; only the latest state of each tile is sent. */
  private tiles = new Map<string, SimEvent>();
  private pinger: ReturnType<typeof setInterval> | null = null;
  private enqueueLeave: (playerId: string) => void = () => {};
  /** Seconds of silence after which a guest is let go (host setting from content rules). */
  timeout = 20;

  /**
   * Become a host. Joining friends turn into commands for the sim via `enqueue`. A friend's cheat
   * request goes to `cheat`, which decides (host settings) whether to enqueue it.
   */
  startHost(enqueue: (c: Command) => void, makeSave: () => Uint8Array, cheat: (c: Extract<Command, { type: 'cheat' }>) => void = () => {}): void {
    const code = makeCode();
    this.status = { role: 'host', code, peers: 0, message: 'opening the gates…' };
    const peer = new Peer(PREFIX + code, peerOptions());
    this.peer = peer;
    this.enqueueLeave = (id) => enqueue({ type: 'leave', playerId: id });
    peer.on('open', () => {
      this.status.message = 'share the code with friends';
    });
    peer.on('error', (err) => {
      this.status.message = `network: ${err.type}`;
    });
    peer.on('connection', (conn) => {
      if (conn.label === 'fast') {
        const g = this.guests.get(conn.peer);
        if (g) g.fast = conn;
        else this.earlyFast.set(conn.peer, conn);
      }
      conn.on('data', (raw) => {
        if (!isGuestMessage(raw)) return;
        const g = this.guests.get(conn.peer);
        if (g) g.heard = performance.now();
        if (raw.t === 'ping') return;
        if (raw.t === 'hello') {
          if (g || conn.label === 'fast') return;
          // A friend's lasting id, unless someone connected already uses it (then this connection's own id).
          const wanted = cleanFriendId(raw.id);
          const taken = [...this.guests.values()].some((o) => o.playerId === wanted);
          const playerId = wanted && !taken ? wanted : conn.peer;
          const fast = this.earlyFast.get(conn.peer) ?? null;
          this.earlyFast.delete(conn.peer);
          this.guests.set(conn.peer, { sure: conn, fast, playerId, heard: performance.now() });
          this.status.peers = this.guests.size;
          enqueue({ type: 'join', playerId, name: raw.name.slice(0, 16) || 'Friend' });
          // Save is taken after the join command is queued; the guest's player appears in the next snapshot.
          const msg: HostMessage = { t: 'welcome', playerId, save: makeSave() };
          void conn.send(msg);
          return;
        }
        if (!g) return;
        if (raw.t === 'cheat') cheat({ type: 'cheat', playerId: g.playerId, cheat: raw.cheat, value: cleanCheatValue(raw.value) ?? null });
        else enqueue({ type: 'input', playerId: g.playerId, input: cleanInput(raw.input) });
      });
      const gone = (): void => {
        const g = this.guests.get(conn.peer);
        if (conn.label === 'fast') {
          if (g?.fast === conn) g.fast = null;
          this.earlyFast.delete(conn.peer);
          return;
        }
        if (!g || g.sure !== conn) return;
        this.drop(conn.peer, g);
      };
      conn.on('close', gone);
      conn.on('error', gone);
    });
  }

  private drop(key: string, g: Guest): void {
    this.guests.delete(key);
    this.status.peers = this.guests.size;
    for (const c of [g.sure, g.fast]) {
      try {
        c?.close();
      } catch {
        // already closed
      }
    }
    this.enqueueLeave(g.playerId);
  }

  /** Host: let go of friends we have not heard from in a while (their connection died without a word). */
  private dropSilent(): void {
    const now = performance.now();
    for (const [key, g] of this.guests) if (now - g.heard > this.timeout * 1000) this.drop(key, g);
  }

  /** Host: after each tick, send what happened. */
  broadcast(state: SimState, events: SimEvent[]): void {
    if (this.status.role !== 'host' || this.guests.size === 0) {
      this.tiles.clear();
      return;
    }
    this.tickCount++;
    if (this.tickCount % 20 === 0) this.dropSilent();
    // Tile changes (a big fire makes hundreds) wait for the next snapshot and are sent once per tile.
    const now: SimEvent[] = [];
    for (const e of events) {
      if (e.type === 'tileChanged') this.tiles.set(`${e.x},${e.y}`, e);
      else if (e.type === 'volumeChanged') this.tiles.set(`b${e.brick.bx},${e.brick.by},${e.brick.bz}`, e);
      else now.push(e);
    }
    const snapTick = this.tickCount % SNAP_EVERY === 0;
    if (snapTick && this.tiles.size) {
      now.push(...this.tiles.values());
      this.tiles.clear();
    }
    if (now.length) {
      const msg: HostMessage = { t: 'events', events: now };
      for (const g of this.guests.values()) if (g.sure.open) void g.sure.send(msg);
    }
    if (!snapTick) return;
    for (const g of this.guests.values()) {
      const msg: HostMessage = { t: 'snap', snap: snapshotFor(state, g.playerId, INTEREST) };
      const road = g.fast?.open ? g.fast : g.sure;
      if (road.open) void road.send(msg);
    }
    const log = this.shared.next(state);
    if (log) {
      const m: HostMessage = { t: 'shared', log };
      for (const g of this.guests.values()) if (g.sure.open) void g.sure.send(m);
    }
  }

  /** Become a guest of a friend's world. */
  join(code: string, name: string, h: GuestHandlers): void {
    this.status = { role: 'guest', code, peers: 1, message: 'finding your friend…' };
    const peer = new Peer(peerOptions());
    this.peer = peer;
    peer.on('error', (err) => {
      this.status.message = `network: ${err.type}`;
    });
    peer.on('open', () => {
      const onData = (raw: unknown): void => {
        if (!isHostMessage(raw)) return;
        if (raw.t === 'welcome') h.welcome(raw.playerId, raw.save instanceof Uint8Array ? raw.save : new Uint8Array(raw.save as ArrayBuffer));
        else if (raw.t === 'snap') h.snapshot(raw.snap);
        else if (raw.t === 'shared') h.shared(raw.log);
        else h.events(raw.events);
      };
      const conn = peer.connect(PREFIX + code, { reliable: true });
      this.host = conn;
      conn.on('open', () => {
        this.status.message = 'joined';
        const hello: GuestMessage = { t: 'hello', name, id: friendId() };
        void conn.send(hello);
        // Timers keep running (slowly) in a background tab, unlike drawing: the host knows we are still here.
        if (this.pinger) clearInterval(this.pinger);
        this.pinger = setInterval(() => {
          if (!conn.open) return;
          const ping: GuestMessage = { t: 'ping' };
          void conn.send(ping);
        }, PING_MS);
        // The fast road, opened once the sure one is up.
        const fast = peer.connect(PREFIX + code, { reliable: false, label: 'fast' });
        this.hostFast = fast;
        fast.on('data', onData);
        fast.on('close', () => {
          if (this.hostFast === fast) this.hostFast = null;
        });
      });
      conn.on('data', onData);
      conn.on('close', () => {
        this.status.message = 'the host has left';
        if (this.pinger) clearInterval(this.pinger);
        this.pinger = null;
      });
    });
  }

  get localPeerId(): string | null {
    return this.peer?.id ?? null;
  }

  /** Guest: ask the host to run a debug cheat for us. */
  sendCheat(cheat: string, value: CheatValue): boolean {
    if (!this.host?.open) return false;
    const msg: GuestMessage = { t: 'cheat', cheat, value };
    void this.host.send(msg);
    return true;
  }

  /** Guest: presses go by the sure road, plain movement by the fast one (a lost one is replaced 50 ms later). */
  sendInput(input: InputSnapshot): void {
    if (!this.host?.open) return;
    const msg: GuestMessage = { t: 'input', input };
    const road = !inputHasPress(input) && this.hostFast?.open ? this.hostFast : this.host;
    void road.send(msg);
  }
}
