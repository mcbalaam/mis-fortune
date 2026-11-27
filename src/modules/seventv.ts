import type { FetchMetadata } from "./metadata";
import Emote from "../primitives/Emote";

const isZeroWidth = (flags: number) =>
  (flags & 256) !== 0 || (flags & 1) !== 0;

const fetchOptions = { ignoreResponseError: true, timeout: 5000 };

export async function fetchSeventvEmotes(
  channelID: string,
  fetchMetadata: FetchMetadata,
): Promise<Record<string, Emote>> {
  const emotes: Record<string, Emote> = {};

  let globalRes: any = {};
  try {
    globalRes = await fetchMetadata("7tv", "/v3/emote-sets/global", fetchOptions);
  } catch (e) {
    console.warn("[7TV] Global emotes timeout or error");
  }

  if (globalRes && globalRes.emotes) {
    globalRes.emotes.forEach((emote: any) => {
      emotes[emote.name] = new Emote({
        id: emote.id,
        image: `https://cdn.7tv.app/emote/${emote.id}/4x.webp`,
        zeroWidth: isZeroWidth(emote.flags),
      });
    });
  }

  if (channelID && channelID !== "0") {
    let userRes: any = null;
    try {
      userRes = await fetchMetadata(
        "7tv",
        `/v3/users/twitch/${channelID}`,
        fetchOptions,
      );
    } catch (e) {
      console.warn("[7TV] Channel emotes timeout or error");
    }

    if (userRes && userRes.emote_set?.emotes) {
      userRes.emote_set.emotes.forEach((emote: any) => {
        const code = emote.name;
        const data = emote.data || emote;

        emotes[code] = new Emote({
          id: data.id,
          image: `https://cdn.7tv.app/emote/${data.id}/4x.webp`,
          zeroWidth:
            data.flags === 1 ||
            data.flags === 256 ||
            emote.flags === 1 ||
            emote.flags === 256,
        });
      });
    }
  }

  return emotes;
}
