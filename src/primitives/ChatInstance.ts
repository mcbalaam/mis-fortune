import { ofetch } from "ofetch";
import Emote from "./Emote";
import type { EmoteReplacement } from "./Emote";
import type { UserPreferences } from "./UserPreferences";
import { ChatMessage } from "./ChatMessage";
import type { CheerInfo } from "./ChatMessage";
import type { Badge } from "./Badge";
import Badger from "./Badge";
import parseIRC from "./IRCMessage";

const BOTUSERNAMES = [
  "streamelements",
  "streamlabs",
  "nightbot",
  "moobot",
  "fossabot",
];

class ChatInstance {
  targetChannelUsername: string;
  targetChannelID: string = "0";
  emotes: Record<string, Emote> = {};
  cheers: Record<string, Record<number, CheerInfo>> = {};
  messages: ChatMessage[] = [];
  blockedUsers: string[] = [];
  prefs: UserPreferences;
  badger: Badger;

  // кешируем системные бейджи на инстансе чата
  badges: Record<string, string> = {};

  // чтобы не дёргать бейджера по одному пользователю многократно
  private loadingUserBadges: Set<string> = new Set();

  constructor(channelUsername: string, prefs: UserPreferences) {
    this.prefs = prefs;
    this.targetChannelUsername = channelUsername;
    this.badger = new Badger();
  }

  write(nick: string, info: any, message: string): void {
    if (
      BOTUSERNAMES.includes(nick.toLowerCase()) &&
      this.blockedUsers.includes(nick.toLowerCase())
    ) {
      return;
    }

    const timestamp = Date.now();
    const isAction = /^\x01ACTION.*\x01$/.test(message);
    const rawMessage = message;
    const cleanMessage = isAction
      ? message
          .replace(/^\x01ACTION/, "")
          .replace(/\x01$/, "")
          .trim()
      : message;

    const badges: Badge[] = [];
    const priorityBadges = [
      "predictions",
      "admin",
      "global_mod",
      "staff",
      "twitchbot",
      "broadcaster",
      "moderator",
      "vip",
    ];

    // твич‑бейджи из tags.badges
    if (info.badges && typeof info.badges === "string") {
      info.badges.split(",").forEach((badgeStr: string) => {
        const [type, version] = badgeStr.split("/");
        const badgeUrl = this.badges[`${type}:${version}`];
        if (badgeUrl && type) {
          badges.push({
            description: type,
            url: badgeUrl,
            priority: priorityBadges.includes(type),
          });
        }
      });
    }

    // все остальные бейджи
    const userBadges = this.badger.getUserBadges(nick);
    userBadges.forEach((userBadge) => {
      badges.push({
        ...userBadge,
        priority: priorityBadges.includes(userBadge.description),
      });
    });

    const priorityBadgesList = badges.filter((b) => b.priority);
    const regularBadgesList = badges.filter((b) => !b.priority);
    const sortedBadges = [...priorityBadgesList, ...regularBadgesList];

    let color: string;
    if (typeof info.color === "string" && info.color) {
      const tc = (window as any).tinycolor(info.color);
      color = tc.getBrightness() <= 50 ? tc.lighten(30).toString() : info.color;
    } else {
      const twitchColors = [
        "#FF0000",
        "#0000FF",
        "#008000",
        "#B22222",
        "#FF7F50",
        "#9ACD32",
        "#FF4500",
        "#2E8B57",
        "#DAA520",
        "#D2691E",
        "#5F9EA0",
        "#1E90FF",
        "#FF69B4",
        "#8A2BE2",
        "#00FF7F",
      ];
      color = twitchColors[nick.charCodeAt(0) % 15] || "#FF4500";
    }

    const twitchEmotes: string[] = [];
    if (info.emotes && typeof info.emotes === "string") {
      info.emotes.split("/").forEach((emoteData: string) => {
        const [emoteId] = emoteData.split(":");
        if (!emoteId) return;
        twitchEmotes.push(emoteId);
      });
    }

    const thirdPartyEmotes: EmoteReplacement[] = [];
    Object.entries(this.emotes).forEach(([code, emote]) => {
      if (cleanMessage.search(new RegExp(escapeRegExp(code), "i")) > -1) {
        thirdPartyEmotes.push({ code, emote });
      }
    });

    let cheer: CheerInfo | undefined;
    let bits: number | undefined;
    if (info.bits && parseInt(info.bits) > 0) {
      bits = parseInt(info.bits);
      for (const [prefix, tiers] of Object.entries(this.cheers)) {
        const regex = new RegExp(`${escapeRegExp(prefix)}\\d+\\s*`, "i");
        if (regex.test(cleanMessage)) {
          const tierKeys = Object.keys(tiers)
            .map(Number)
            .sort((a, b) => a - b);
          let closestTier = 1;
          for (const tier of tierKeys) {
            if (bits! >= tier) closestTier = tier;
            else break;
          }
          cheer = tiers[closestTier];
          break;
        }
      }
    }

    const chatMessage = new ChatMessage({
      id: info.id || `${nick}_${timestamp}`,
      nick,
      displayName: info["display-name"] || nick,
      color,
      badges: sortedBadges,
      message: cleanMessage,
      rawMessage,
      timestamp,
      twitchEmotes,
      thirdPartyEmotes,
      cheer,
      isAction,
      bits,
    });

    this.messages.push(chatMessage);
  }

  clearChat(nick: string): void {
    this.messages = this.messages.filter(
      (msg) => msg.nick.toLowerCase() !== nick.toLowerCase(),
    );
  }

  clearMessage(id: string): void {
    this.messages = this.messages.filter((msg) => msg.id !== id);
  }

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

  private async doAPIRequest(endpoint: string): Promise<any> {
    const headers = {
      "Client-ID": "YOUR_TWITCH_CLIENT_ID",
      Accept: "application/vnd.twitchtv.v5+json",
    };

    try {
      return await ofetch(endpoint, { headers });
    } catch (error) {
      console.warn(`Twitch API failed for ${endpoint}:`, error);
      throw error;
    }
  }

  async init() {
    try {
      const userRes = await this.doAPIRequest(
        `https://api.twitch.tv/v5/users?login=${encodeURIComponent(this.targetChannelUsername)}`,
      );
      const channelID = userRes.users[0]._id;
      this.targetChannelID = channelID;

      await this.fetchEmotes();

      // Загружаем twitch‑бейджи (глобальные + канал)
      if (this.prefs.showBadges) {
        const globalBadges = await this.doAPIRequest(
          "https://badges.twitch.tv/v1/badges/global/display",
        );
        Object.entries(globalBadges.badge_sets).forEach((badge: any) => {
          Object.entries(badge[1].versions).forEach((v: any) => {
            this.badges[badge[0] + ":" + v[0]] = v[1].image_url_4x;
          });
        });

        const channelBadges = await this.doAPIRequest(
          `https://badges.twitch.tv/v1/badges/channels/${encodeURIComponent(this.targetChannelID!)}/display`,
        );
        Object.entries(channelBadges.badge_sets).forEach((badge: any) => {
          Object.entries(badge[1].versions).forEach((v: any) => {
            this.badges[badge[0] + ":" + v[0]] = v[1].image_url_4x;
          });
        });

        // FrankerFaceZ room badges (модератор/вип override)
        try {
          const ffzRoom = await ofetch(
            `https://api.frankerfacez.com/v1/_room/id/${encodeURIComponent(this.targetChannelID!)}`,
          );
          if (ffzRoom.room.moderator_badge) {
            this.badges["moderator:1"] =
              `https://cdn.frankerfacez.com/room-badge/mod/${this.targetChannelUsername}/4/rounded`;
          }
          if (ffzRoom.room.vip_badge) {
            this.badges["vip:1"] =
              `https://cdn.frankerfacez.com/room-badge/vip/${this.targetChannelUsername}/4`;
          }
        } catch (error) {
          console.warn("FFZ room badges fetch failed:", error);
        }

        // грузим глобальные бейджи в бэйджере
        await this.badger.loadGlobalBadges();
      }

      // Load cheers
      // Load cheers
      try {
        const cheersRes = await this.doAPIRequest(
          `https://api.twitch.tv/v5/bits/actions?channel_id=${this.targetChannelID}`,
        );
        cheersRes.actions.forEach((action: any) => {
          if (!action.prefix) return;
          this.cheers[action.prefix] = {};
          action.tiers?.forEach((tier: any) => {
            const minBits = tier.min_bits;
            const image = tier.images?.dark?.animated?.["4"];

            if (minBits && image) {
              this.cheers[action.prefix][minBits] = {
                image,
                color: tier.color || "#9146FF",
              };
            }
          });
        });
      } catch (error) {
        console.warn("Cheers fetch failed:", error);
      }
    } catch (error) {
      console.error("Chat load failed:", error);
    }
  }

  runSocketConnection() {
    console.log("jChat: Connecting to IRC server...");

    const socket = new WebSocket("wss://irc-ws.chat.twitch.tv", "irc");

    socket.onopen = () => {
      console.log("mis-fortune: socket connection established");
      socket.send("PASS blah\r\n");
      socket.send(`NICK justinfan${Math.floor(Math.random() * 99999)}\r\n`);
      socket.send("CAP REQ :twitch.tv/commands twitch.tv/tags\r\n");
      socket.send(`JOIN #${this.targetChannelUsername}\r\n`);
    };

    socket.onclose = () => {
      console.log("mis-fortune: disconnected");
    };

    socket.onerror = (error) => {
      console.error("mis-fortune: WebSocket error:", error);
    };

    socket.onmessage = (event: MessageEvent) => {
      (event.data as string).split("\r\n").forEach((line) => {
        if (!line) return;
        const message = parseIRC(line);
        if (!message || !message.command) return;

        switch (message.command) {
          case "PING":
            socket.send(`PONG ${message.params[0]}`);
            return;
          case "JOIN":
            console.log(
              `mis-fortune: channel #${this.targetChannelUsername} joined`,
            );
            return;
          case "CLEARMSG":
            if (
              message.tags &&
              message.tags["target-msg-id"] &&
              typeof message.tags["target-msg-id"] === "string"
            )
              this.clearMessage(message.tags["target-msg-id"]);
            return;
          case "CLEARCHAT":
            if (message.params[1]) this.clearChat(message.params[1]);
            return;
          case "PRIVMSG":
            if (
              message.params[0] !== `#${this.targetChannelUsername}` ||
              !message.params[1]
            )
              return;
            const nick = message.prefix?.split("@")[0].split("!")[0];
            if (!nick) return;

            if (
              message.params[1].toLowerCase() === "!refreshoverlay" &&
              message.tags.badges &&
              typeof message.tags.badges === "string"
            ) {
              let flag = false;
              message.tags.badges.split(",").forEach((badge) => {
                const badgeParts = badge.split("/");
                if (
                  badgeParts[0] === "moderator" ||
                  badgeParts[0] === "broadcaster"
                ) {
                  flag = true;
                }
              });
              if (flag) {
                this.fetchEmotes();
                console.log("mis-fortune: refreshing emotes now...");
                return;
              }
            }

            if (this.prefs.hideCommands) {
              if (/^!.+/.test(message.params[1])) return;
            }

            if (!this.prefs.showBots) {
              if (BOTUSERNAMES.includes(nick)) return;
            }

            if (this.blockedUsers) {
              if (this.blockedUsers.includes(nick)) return;
            }

            // Загрузка пользовательских бейджей через Badger
            if (this.prefs.showBadges) {
              const cacheKey = nick.toLowerCase();
              const hasBadges = this.badger.hasBadges(cacheKey);
              const isLoading = this.loadingUserBadges.has(cacheKey);

              if (
                !hasBadges &&
                !isLoading &&
                message.tags["user-id"] &&
                typeof message.tags["user-id"] === "string"
              ) {
                this.loadingUserBadges.add(cacheKey);
                this.badger
                  .loadUserBadges(nick, message.tags["user-id"])
                  .catch((err) =>
                    console.warn(
                      `Failed to load user badges for ${nick}:`,
                      err,
                    ),
                  )
                  .finally(() => {
                    this.loadingUserBadges.delete(cacheKey);
                  });
              }
            }

            this.write(nick, message.tags || {}, message.params[1]);
            return;
        }
      });
    };
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default ChatInstance;
