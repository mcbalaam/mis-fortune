import { ofetch } from "ofetch";
import Emote from "./Emote";
import type { UserPreferences } from "./UserPreferences";

const BOTUSERNAMES = [
  "streamelements",
  "streamlabs",
  "nightbot",
  "moobot",
  "fossabot",
];

class ChatInstance {
  targetChannelUsername: string;
  emotes: Record<string, Emote> = {};
  badges: Record<string, any> = {};
  userBadges: Record<string, any> = {};
  seventvBadges: null = null;
  cheers: Record<string, any> = {};
  lines: any[] = [];
  blockedUsers: string[] = [];
  prefs: UserPreferences;

  async fetchEmotes() {
    this.emotes = {};

    // FrankerFaceZ emotes
    const ffzEndpoints = [
      "emotes/global",
      `users/twitch/${encodeURIComponent(this.targetChannelUsername)}`,
    ];

    for (const endpoint of ffzEndpoints) {
      try {
        const res = await ofetch(`https://api.frankerfacez.com/v1/${endpoint}`);
        res.emotes.forEach((emoteData: any) => {
          const imageUrl =
            emoteData.images["4x"] ||
            emoteData.images["2x"] ||
            emoteData.images["1x"];
          const upscale = !emoteData.images["4x"];

          this.emotes[emoteData.code] = new Emote({
            id: emoteData.id,
            image: imageUrl,
            upscale,
          });
        });
      } catch (error) {
        console.warn(`FFZ emote fetch failed for ${endpoint}:`, error);
      }
    }

    // BetterTTV emotes
    const bttvEndpoints = [
      "emotes/global",
      `users/twitch/${encodeURIComponent(this.targetChannelUsername)}`,
    ];

    for (const endpoint of bttvEndpoints) {
      try {
        const res = await ofetch(
          `https://api.betterttv.net/3/cached/${endpoint}`,
        );
        const emotes = Array.isArray(res)
          ? res
          : res.channelEmotes.concat(res.sharedEmotes);

        emotes.forEach((emoteData: any) => {
          this.emotes[emoteData.code] = new Emote({
            id: emoteData.id,
            image: `https://cdn.betterttv.net/emote/${emoteData.id}/3x`,
            zeroWidth: [
              "5e76d338d6581c3724c0f0b2", // cvHazmat
              "5e76d399d6581c3724c0f0b8", // cvMask
              "567b5b520e984428652809b6", // SoSnowy
              "5849c9a4f52be01a7ee5f79d", // IceCold
              "567b5c080e984428652809ba", // CandyCane
              "567b5dc00e984428652809bd", // ReinDeer
              "58487cc6f52be01a7ee5f79e", // TopHat
            ].includes(emoteData.id),
          });
        });
      } catch (error) {
        console.warn(`BTTV emote fetch failed for ${endpoint}:`, error);
      }
    }

    // 7TV emotes
    const sevEndpoints = [
      "emotes/global",
      `users/${encodeURIComponent(this.targetChannelUsername)}/emotes`,
    ];

    for (const endpoint of sevEndpoints) {
      try {
        const res = await ofetch(`https://api.7tv.app/v2/${endpoint}`);
        res.forEach((emoteData: any) => {
          this.emotes[emoteData.name] = new Emote({
            id: emoteData.id,
            image: emoteData.urls[emoteData.urls.length - 1][1],
            zeroWidth: emoteData.visibility_simple.includes("ZERO_WIDTH"),
          });
        });
      } catch (error) {
        console.warn(`7TV emote fetch failed for ${endpoint}:`, error);
      }
    }
  }

  constructor(channelUsername: string, setPrefs: UserPreferences) {
    this.prefs = setPrefs;
    this.targetChannelUsername = channelUsername;
  }
}

export default ChatInstance;
