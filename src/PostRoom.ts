import { DurableObject } from "cloudflare:workers";
import { Env } from "./types";

export class PostRoom extends DurableObject {
  sessions: Set<WebSocket>;
  env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sessions = new Set();
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    // Handle WebSocket upgrade (Client Connection)
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      this.handleSession(server);

      return new Response(null, { status: 101, webSocket: client });
    }

    // Handle internal API calls (Server Notification)
    if (request.method === "POST") {
      const data = await request.json();
      
      // Broadcast the update to all connected clients
      this.broadcast(data);
      
      return new Response("OK", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  }

  handleSession(webSocket: WebSocket) {
    this.sessions.add(webSocket);
    webSocket.accept();

    webSocket.addEventListener("close", () => {
      this.sessions.delete(webSocket);
    });
  }

  broadcast(message: any) {
    const msgString = JSON.stringify(message);
    for (const session of this.sessions) {
      try {
        session.send(msgString);
      } catch (err) {
        this.sessions.delete(session);
      }
    }
  }
}
