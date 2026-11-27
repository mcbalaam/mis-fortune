import { ofetch, type FetchOptions } from "ofetch";

const sourceOrigins = {
  ivr: "https://api.ivr.fi",
  ffz: "https://api.frankerfacez.com",
  bttv: "https://api.betterttv.net",
  "7tv": "https://7tv.io",
  chatterino: "https://api.chatterino.com",
  ffzap: "https://api.ffzap.com",
};

export const METADATA_PROXY_PATH = "/api/source-proxy";

export function hasMetadataContentType(headers: Headers): boolean {
  return /^application\/json\s*(?:;|$)/i.test(headers.get("content-type") ?? "");
}

export type FetchMetadata = <T = unknown>(
  source: keyof typeof sourceOrigins,
  path: string,
  options?: Pick<FetchOptions<"json">, "ignoreResponseError" | "timeout">,
) => Promise<T>;

export function createMetadataFetch(
  useProxy: boolean,
  onProxyUnavailable: () => void,
): FetchMetadata {
  if (!useProxy) {
    return (source, path, options) => ofetch(sourceOrigins[source] + path, options);
  }

  let reported = false;
  function reportUnavailable() {
    if (reported) return;
    reported = true;
    onProxyUnavailable();
  }

  return (source, path, options) =>
    ofetch(`${METADATA_PROXY_PATH}/${source}${path}`, {
      timeout: 5000,
      ...options,
      retry: 0,
      redirect: "error",
      onRequestError: reportUnavailable,
      onResponse({ response }) {
        const isJSON = hasMetadataContentType(response.headers);
        if (!isJSON || response.status >= 500) reportUnavailable();
        if (!isJSON) throw new Error("Expected a JSON response from the metadata proxy");
      },
    });
}
