import { DurableObject } from "cloudflare:workers";
import { Env } from "./types";

export class GlobalChat extends DurableObject {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method === 'DELETE') {
        return new Response('Not implemented', { status: 501 });
      }

      const upgrade = request.headers.get('Upgrade') || '';
      if (upgrade.toLowerCase() !== 'websocket') {
        return new Response('Expected websocket', { status: 400 });
      }
      
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      
      // Use Hibernation API
      this.state.acceptWebSocket(server);
      console.log(`[GlobalChat] WebSocket accepted. Active connections: ${this.state.getWebSockets().length}`);
      
      // Attach user info
      server.serializeAttachment({
        userId: request.headers.get('X-User-ID'),
        email: request.headers.get('X-User-Email'),
        name: request.headers.get('X-User-Name'),
        avatar: request.headers.get('X-User-Avatar')
      });
      
      return new Response(null, { status: 101, webSocket: client });
    } catch (err) {
      console.error('[GlobalChat] Fetch error:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      let data: any;
      try {
        if (typeof message === 'string') {
            data = JSON.parse(message);
        } else {
            // Handle ArrayBuffer if necessary, or ignore
            return;
        }
      } catch (e) {
        console.error('[GlobalChat] Invalid JSON received:', message);
        return;
      }
      
      if (data.type !== 'message') {
          return;
      }

      const attachment = ws.deserializeAttachment() as any;

      const msg = {
        id: crypto.randomUUID(),
        user: attachment?.name || data.user || 'Anonymous',
        user_id: attachment?.userId || data.userId || 'anon',
        user_email: attachment?.email || data.email || null,
        avatar_url: attachment?.avatar || null,
        text: data.text || '',
        created_at: Date.now()
      };
      
      // Insert into D1
      try {
        await this.env.DB.prepare(
          'INSERT INTO chat_messages (id, user_id, user_name, user_email, message, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(msg.id, msg.user_id, msg.user, msg.user_email, msg.text, msg.created_at)
        .run();
      } catch (err) {
        console.error('[GlobalChat] Failed to save message to D1:', err);
      }

      // Broadcast
      const broadcastMsg = JSON.stringify({ type: 'message', message: msg });
      const sockets = this.state.getWebSockets();
      console.log(`[GlobalChat] Broadcasting message to ${sockets.length} clients`);
      
      for (const client of sockets) {
        try { 
          client.send(broadcastMsg); 
        } catch (e) {
          console.error('[GlobalChat] Failed to send to client:', e);
        }
      }
    } catch (e) {
      console.error('[GlobalChat] Unexpected error in webSocketMessage:', e);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    console.log(`[GlobalChat] WebSocket closed. Code: ${code}, Reason: ${reason}, Clean: ${wasClean}`);
  }
  
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('[GlobalChat] WebSocket error:', error);
  }
}
