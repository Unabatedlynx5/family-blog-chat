
// Export the Durable Object class
export { GlobalChat } from './GlobalChat.js';

// Default worker export (required by Wrangler, even if empty)
export default {
  async fetch(request, env) {
    return new Response("Chat Service Active");
  }
};
