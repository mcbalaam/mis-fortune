import { serve } from "bun";
import index from "./index.html";

const server = serve({
  routes: {
    "/": index,
    "/favicon.ico": index,

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
