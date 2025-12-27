import { serve } from "bun";
import index from "./index.html";
import { createPreferences } from "./primitives/UserPreferences";

const server = serve({
  routes: {
    "/": index,
    "/favicon.ico": index,

    // Все остальное отдаем чистый index.html
    "/*": index,

    "/api/hello": {
      async GET() {
        return Response.json({ message: "Hello!" });
      },
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
