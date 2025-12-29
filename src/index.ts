import { Env } from "./types";

// Export the Durable Object class
export { GlobalChat } from './GlobalChat';
export { PostRoom } from './PostRoom';

// Default worker export (required by Wrangler, even if empty)
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/feed/live') {
      const id = env.POST_ROOM.idFromName('FEED');
      const stub = env.POST_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response("Chat Service Active");
  }
};
