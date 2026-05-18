import { createApp } from "./app.ts";
import { loadEnv } from "./shared/config/env.ts";

const env = loadEnv();
const app = createApp();

console.log(`maison-core listening on http://localhost:${env.PORT}`);

export default {
  fetch: app.fetch,
  port: env.PORT,
};
