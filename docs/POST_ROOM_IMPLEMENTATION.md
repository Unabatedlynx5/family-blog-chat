# PostRoom Durable Object Implementation

This document describes how to implement the `PostRoom` Durable Object in the `family-blog-chat` repository to support live like updates for the feed.

## Overview

The `PostRoom` Durable Object acts as a real-time broadcast server. For the feed, we use a single instance (singleton) named `'FEED'` to manage updates for all posts. This avoids opening hundreds of WebSocket connections.

## Implementation Details

### 1. Class Structure

The `PostRoom` class should handle:
- WebSocket connections from clients (browsers viewing the feed).
- HTTP requests from the API (when a user likes a post).
- Broadcasting updates to all connected clients.

### 2. Code (`src/PostRoom.ts`)

```typescript
import { DurableObject } from "cloudflare:workers";

export class PostRoom extends DurableObject {
  sessions: Set<WebSocket>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sessions = new Set();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket upgrade (Client Connection)
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

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
```

### 3. Usage Pattern

1.  **Client (Feed Page)**: Connects to `wss://.../api/feed/live`. This endpoint maps to `env.POST_ROOM.idFromName('FEED')`.
2.  **Server (Like API)**: When a like occurs, it sends a POST request to the same DO instance (`idFromName('FEED')`) with the payload:
    ```json
    {
      "type": "LIKE_UPDATE",
      "postId": "123",
      "count": 5
    }
    ```
3.  **Durable Object**: Receives the POST, and broadcasts the JSON to all connected WebSockets.
4.  **Client**: Receives the message and updates the DOM for post `123`.

## Why this is efficient

- **Single Connection**: Clients only maintain one WebSocket connection for the entire feed, rather than one per post.
- **Low Latency**: Updates are pushed immediately.
- **Scalable**: Cloudflare handles the distribution. If the feed gets very busy, we could shard it (e.g., `FEED_1`, `FEED_2`), but for a family blog, a single room is perfect.
