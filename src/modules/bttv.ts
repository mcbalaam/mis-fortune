import type { FetchMetadata } from "./metadata";
import Emote from "../primitives/Emote";

interface BttvEmote {
  id: string;
  code: string;
}

type BttvResponse =
  | BttvEmote[]
  | { channelEmotes: BttvEmote[]; sharedEmotes: BttvEmote[] };

export async function fetchBTTVEmotes(
  channelUsername: string,
  fetchMetadata: FetchMetadata,
): Promise<Record<string, Emote>> {
  const emotes: Record<string, Emote> = {};
  const bttvEndpoints = [
    "emotes/global",
    `users/twitch/${encodeURIComponent(channelUsername)}`,
  ];

  for (const endpoint of bttvEndpoints) {
    try {
      const res = await fetchMetadata<BttvResponse>(
        "bttv",
        `/3/cached/${endpoint}`,
        { ignoreResponseError: true, timeout: 5000 },
      );
      const emoteList = Array.isArray(res)
        ? res
        : res.channelEmotes.concat(res.sharedEmotes);
      emoteList.forEach((emoteData) => {
        emotes[emoteData.code] = new Emote({
          id: emoteData.id,
          image: `https://cdn.betterttv.net/emote/${emoteData.id}/3x`,
          zeroWidth: [
            "5e76d338d6581c3724c0f0b2",
            "5e76d399d6581c3724c0f0b8",
          ].includes(emoteData.id),
        });
      });
    } catch (error) {
    }
  }

  return emotes;
}
