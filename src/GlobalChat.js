export class GlobalChat {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // this.sockets = new Map(); // Not needed with Hibernation API
    // No need to load messages from storage anymore
  }

  async fetch(request) {
    try {
      if (request.method === 'DELETE') {
        // return this.cleanupMessages();
        return new Response('Not implemented', { status: 501 });
      }

      const upgrade = request.headers.get('Upgrade') || '';
      if (upgrade.toLowerCase() !== 'websocket') {
        return new Response('Expected websocket', { status: 400 });
      }
      
      const pair = new WebSocketPair();
      const [client, server] = pair;
      
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
    
      // History is now fetched from D1 via API, so we don't send it here.
      
      return new Response(null, { status: 101, webSocket: client });
    } catch (err) {
      console.error('[GlobalChat] Fetch error:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  async webSocketMessage(ws, message) {
    try {
      let data;
      try {
        data = JSON.parse(message);
      } catch (e) {
        console.error('[GlobalChat] Invalid JSON received:', message);
        return;
      }
      
      if (data.type !== 'message') {
          return;
      }

      const attachment = ws.deserializeAttachment();

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

  async webSocketClose(ws, code, reason, wasClean) {
    console.log(`[GlobalChat] WebSocket closed. Code: ${code}, Reason: ${reason}, Clean: ${wasClean}`);
  }
  
  async webSocketError(ws, error) {
    console.error('[GlobalChat] WebSocket error:', error);
  }
}
