import { DurableObjectNamespace, D1Database } from "@cloudflare/workers-types";

export interface Env {
  GLOBAL_CHAT: DurableObjectNamespace;
  POST_ROOM: DurableObjectNamespace;
  DB: D1Database;
}
