// Cage Ball live rooms.
// One Durable Object per room code. It only relays messages between the two
// players (host and guest); the host's phone runs the game.

function send(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch (e) { /* socket already gone */ }
}

export class Room {
  constructor(state, env) {
    this.state = state;
    this.socks = []; // [{ ws, role }]
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket connection', { status: 426 });
    }
    if (this.socks.length >= 2) {
      return new Response('Room is full', { status: 409 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const role = this.socks.some((s) => s.role === 'host') ? 'guest' : 'host';
    const entry = { ws: server, role };
    this.socks.push(entry);

    send(server, { t: 'role', role });
    if (this.socks.length === 2) {
      for (const s of this.socks) send(s.ws, { t: 'peer' });
    }

    server.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string' || ev.data.length > 8192) return;
      const other = this.socks.find((s) => s !== entry);
      if (other) {
        try { other.ws.send(ev.data); } catch (e) { /* ignore */ }
      }
    });

    const gone = () => {
      const i = this.socks.indexOf(entry);
      if (i < 0) return;
      this.socks.splice(i, 1);
      for (const s of this.socks) send(s.ws, { t: 'left' });
      // The host's phone runs the game, so when the host leaves the room is over.
      if (role === 'host') {
        for (const s of this.socks) {
          try { s.ws.close(1000, 'host left'); } catch (e) { /* ignore */ }
        }
      }
    };
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);

    return new Response(null, { status: 101, webSocket: client });
  }
}

// Quick match: one global queue. The first player waits; when a second arrives,
// both are given the same fresh room code and the queue sockets close.
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  const a = new Uint8Array(5);
  crypto.getRandomValues(a);
  let c = '';
  for (let i = 0; i < 5; i++) c += CODE_CH[a[i] % CODE_CH.length];
  return c;
}

export class Matchmaker {
  constructor(state, env) {
    this.state = state;
    this.waiting = null;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket connection', { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const w = this.waiting;
    if (w) {
      this.waiting = null;
      const code = newCode();
      send(w, { t: 'match', code });
      send(server, { t: 'match', code });
      try { w.close(1000, 'matched'); } catch (e) { /* ignore */ }
      try { server.close(1000, 'matched'); } catch (e) { /* ignore */ }
    } else {
      this.waiting = server;
      const gone = () => { if (this.waiting === server) this.waiting = null; };
      server.addEventListener('close', gone);
      server.addEventListener('error', gone);
    }
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws/queue') {
      return env.MATCH.get(env.MATCH.idFromName('queue')).fetch(request);
    }
    const m = url.pathname.match(/^\/ws\/([A-Z2-9]{5})$/);
    if (m) {
      const id = env.ROOMS.idFromName(m[1]);
      return env.ROOMS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
