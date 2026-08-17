import { ofetch } from "ofetch";
import Emote from "../primitives/Emote";

export async function fetchFFZEmotes(
  channelUsername: string,
): Promise<Record<string, Emote>> {
  const emotes: Record<string, Emote> = {};
  const ffzEndpoints = [
    "emotes/global",
    `users/twitch/${encodeURIComponent(channelUsername)}`,
  ];

  for (const endpoint of ffzEndpoints) {
    try {
      const res = await ofetch(
        `https://api.frankerfacez.com/v1/${endpoint}`,
        { ignoreResponseError: true, timeout: 5000 },
      );
      const sets = res.sets || {};
      Object.values(sets).forEach((set: any) => {
        set.emoticons.forEach((emoteData: any) => {
          const imageUrl =
            emoteData.urls["4"] || emoteData.urls["2"] || emoteData.urls["1"];
          emotes[emoteData.name] = new Emote({
            id: emoteData.id,
            image: imageUrl.startsWith("//") ? `https:${imageUrl}` : imageUrl,
          });
        });
      });
    } catch (error) {
    }
  }

  return emotes;
}
