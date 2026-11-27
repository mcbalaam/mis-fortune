import { serve } from "bun";
import index from "./index.html";
import { hasMetadataContentType, METADATA_PROXY_PATH } from "./modules/metadata";

const proxyURL = Bun.env.MISFORTUNE_PROXY_URL;
const proxy = proxyURL ? new URL(proxyURL) : undefined;
if (
  proxy &&
  ((proxy.protocol !== "http:" && proxy.protocol !== "https:") ||
    proxy.href !== `${proxy.origin}/`)
) {
  throw new Error("MISFORTUNE_PROXY_URL must be an HTTP(S) origin");
}

function proxyError(status: number, error: string, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  return Response.json({ error }, { status, headers: responseHeaders });
}

async function relayMetadata(request: Request) {
  if (request.method !== "GET") {
    return proxyError(405, "Method not allowed", { Allow: "GET" });
  }
  const { pathname, search } = new URL(request.url);
  if (!pathname.startsWith(`${METADATA_PROXY_PATH}/`)) {
    return proxyError(404, "Unknown metadata route");
  }
  if (!proxy) return proxyError(503, "Metadata proxy is not configured");

  const target = new URL(proxy.origin);
  target.pathname = pathname;
  target.search = search;
  const deadline = AbortSignal.timeout(4500);

  try {
    const upstream = await fetch(target, {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.any([deadline, request.signal]),
    });
    if (
      (upstream.status >= 300 && upstream.status < 400) ||
      upstream.status === 204 ||
      upstream.status === 205 ||
      !hasMetadataContentType(upstream.headers)
    ) {
      await upstream.body?.cancel();
      return proxyError(502, "Invalid metadata proxy response");
    }
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return deadline.aborted
      ? proxyError(504, "Metadata proxy timed out")
      : proxyError(502, "Metadata proxy is unavailable");
  }
}

const server = serve({
  routes: {
    "/": index,
    "/favicon.ico": index,
    [METADATA_PROXY_PATH]: relayMetadata,
    [`${METADATA_PROXY_PATH}/*`]: relayMetadata,

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
