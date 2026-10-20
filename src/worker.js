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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/ws\/([A-Z2-9]{5})$/);
    if (m) {
      const id = env.ROOMS.idFromName(m[1]);
      return env.ROOMS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
