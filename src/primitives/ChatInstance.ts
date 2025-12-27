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

interface BitsTier {
  min_bits: number;
  images: {
    dark: {
      animated: Record<string, string>;
    };
  };
  color?: string;
}

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

  private isColorDark(hex: string): boolean {
    hex = hex.replace("#", "");

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

  private lightenColor(hex: string, percent: number): string {
    hex = hex.replace("#", "");

    const r = Math.min(
      255,
      parseInt(hex.slice(0, 2), 16) + Math.floor((255 * percent) / 100),
    );
    const g = Math.min(
      255,
      parseInt(hex.slice(2, 4), 16) + Math.floor((255 * percent) / 100),
    );
    const b = Math.min(
      255,
      parseInt(hex.slice(4, 6), 16) + Math.floor((255 * percent) / 100),
    );

    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  write(username: string, info: any, message: string): void {
    if (
      BOTUSERNAMES.includes(username.toLowerCase()) &&
      this.blockedUsers.includes(username.toLowerCase())
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
    const userBadges = this.badger.getUserBadges(username);
    userBadges.forEach((userBadge) => {
      badges.push({
        ...userBadge,
        priority: priorityBadges.includes(userBadge.description),
      });
    });

    const priorityBadgesList = badges.filter((b) => b.priority);
    const regularBadgesList = badges.filter((b) => !b.priority);
    const sortedBadges = [...priorityBadgesList, ...regularBadgesList];

    // Цвет ника с авто-осветлением
    let color: string;
    if (typeof info.color === "string" && info.color) {
      color = this.isColorDark(info.color)
        ? this.lightenColor(info.color, 30)
        : info.color;
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
      color = twitchColors[username.charCodeAt(0) % 15];
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
    const words = cleanMessage.split(/\s+/);

    for (const word of words) {
      const emote = this.emotes[word];
      if (emote) {
        thirdPartyEmotes.push({ code: word, emote });
      }
    }

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
      id: info.id || `${username}_${timestamp}`,
      username,
      displayName: info["display-name"] || username,
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

  clearChat(username: string): void {
    this.messages = this.messages.filter(
      (msg) => msg.username.toLowerCase() !== username.toLowerCase(),
    );
  }

  clearMessage(id: string): void {
    this.messages = this.messages.filter((msg) => msg.id !== id);
  }

  async fetchEmotes() {
    this.emotes = {};

    // FrankerFaceZ эмоуты
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
      } catch (error) {}
    }

    // BetterTTV эмоуты
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
      } catch (error) {}
    }

    // 7TV emotes
    try {
      // 1. Глобальные эмоуты (Global Emote Set)
      // Используем endpoint emote-sets/global, он надежнее
      const globalRes: any = await ofetch(
        "https://7tv.io/v3/emote-sets/global",
      );

      // В v3 эмоуты лежат внутри свойства .emotes
      if (globalRes.emotes) {
        globalRes.emotes.forEach((emote: any) => {
          this.emotes[emote.name] = new Emote({
            id: emote.id,
            // Используем прямой CDN шаблон — это надежнее парсинга host.files
            image: `https://cdn.7tv.app/emote/${emote.id}/4x.webp`,
            zeroWidth: emote.flags === 1 || emote.flags === 256, // Bitmask for zero-width in v3 often indicates overlay
          });
        });
      }

      // 2. Эмоуты канала
      // ВАЖНО: 7TV API v3 лучше работает с ID пользователя, но поддерживает и логин.
      // Структура ответа: User Object -> emote_set -> emotes
      const userRes: any = await ofetch(
        `https://7tv.io/v3/users/twitch/${encodeURIComponent(this.targetChannelID)}`,
      );

      // Проверяем наличие emote_set
      const channelEmotes = userRes.emote_set?.emotes || [];

      channelEmotes.forEach((emote: any) => {
        // Эмоут может быть объектом или ссылкой, берем data если есть
        const emoteData = emote.data || emote;

        this.emotes[emoteData.name] = new Emote({
          id: emoteData.id,
          image: `https://cdn.7tv.app/emote/${emoteData.id}/4x.webp`,
          zeroWidth: emoteData.flags === 1 || emoteData.flags === 256,
        });
      });
    } catch (err) {}
  }

  async getChannelID(username: string): Promise<string | null> {
    try {
      const response = await ofetch("https://gql.twitch.tv/gql", {
        method: "POST",
        headers: {
          "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko", // Это публичный ID веб-сайта Twitch
        },
        body: {
          query: `
            query GetChannelID($login: String!) {
              user(login: $login) {
                id
              }
            }
          `,
          variables: {
            login: username,
          },
        },
      });

      return response.data?.user?.id || null;
    } catch (e) {
      return null;
    }
  }

  async init() {
    console.log("[mf] init() called");

    const id = await this.getChannelID(this.targetChannelUsername);

    if (id) {
      this.targetChannelID = id;
    } else {
    }

    await this.fetchEmotes();
    console.log("[mf] emotes fetched");

    if (this.prefs.showBadges) {
      await this.badger.loadGlobalBadges();
    }

    console.log("[mf] init finished OK");
  }

  // async init() {
  //   console.log("running init...");
  //   try {

  //     this.targetChannelID = channelID;

  //     await this.fetchEmotes();

  //     // грузим twitch‑бейджи (глобальные + канал)
  //     if (this.prefs.showBadges) {
  //       const globalBadges = await this.doAPIRequest(
  //         "https://badges.twitch.tv/v1/badges/global/display",
  //       );
  //       Object.entries(globalBadges.badge_sets).forEach((badge: any) => {
  //         Object.entries(badge[1].versions).forEach((v: any) => {
  //           this.badges[badge[0] + ":" + v[0]] = v[1].image_url_4x;
  //         });
  //       });

  //       const channelBadges = await this.doAPIRequest(
  //         `https://badges.twitch.tv/v1/badges/channels/${encodeURIComponent(this.targetChannelID!)}/display`,
  //       );
  //       Object.entries(channelBadges.badge_sets).forEach((badge: any) => {
  //         Object.entries(badge[1].versions).forEach((v: any) => {
  //           this.badges[badge[0] + ":" + v[0]] = v[1].image_url_4x;
  //         });
  //       });

  //       // FrankerFaceZ рум бейджи (модератор/вип override)
  //       try {
  //         const ffzRoom = await ofetch(
  //           `https://api.frankerfacez.com/v1/_room/id/${encodeURIComponent(this.targetChannelID!)}`,
  //         );
  //         if (ffzRoom.room.moderator_badge) {
  //           this.badges["moderator:1"] =
  //             `https://cdn.frankerfacez.com/room-badge/mod/${this.targetChannelUsername}/4/rounded`;
  //         }
  //         if (ffzRoom.room.vip_badge) {
  //           this.badges["vip:1"] =
  //             `https://cdn.frankerfacez.com/room-badge/vip/${this.targetChannelUsername}/4`;
  //         }
  //       } catch (error) {
  //         console.warn("FFZ room badges fetch failed:", error);
  //       }

  //       // грузим глобальные бейджи в бэйджере
  //       await this.badger.loadGlobalBadges();
  //     }

  //     // грузим чирсы (для богачей)
  //     try {
  //       const cheersRes = await this.doAPIRequest(
  //         `https://api.twitch.tv/v5/bits/actions?channel_id=${this.targetChannelID}`,
  //       );
  //       cheersRes.actions.forEach((action: any) => {
  //         if (!action.prefix || !action.tiers) return;

  //         this.cheers[action.prefix] = {};

  //         (action.tiers as BitsTier[]).forEach((tier) => {
  //           const image = tier.images.dark?.animated?.["4"];
  //           if (image) {
  //             this.cheers[action.prefix]![tier.min_bits] = {
  //               image,
  //               color: tier.color || "#9146FF",
  //             };
  //           }
  //         });
  //       });
  //     } catch (error) {
  //       console.warn("Cheers fetch failed:", error);
  //     }
  //   } catch (error) {
  //     console.error("Chat load failed:", error);
  //   }
  // }

  runSocketConnection() {
    console.log("[mf] connecting to IRC...");

    const socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443", "irc");

    socket.onopen = () => {
      socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands"); // 1. Сначала CAP
      socket.send("NICK justinfan0"); // 2. Фиксированный username
      socket.send("PASS oauth:"); // 3. Пустой OAuth для анонимки
      socket.send(`JOIN #${this.targetChannelUsername.toLowerCase()}`); // 4. Канал в lowercase
    };

    socket.onclose = () => {
      console.log("[mf] socket connection lost - reconnecting in 3s...");
      setTimeout(() => this.runSocketConnection(), 3000);
    };

    socket.onerror = (error) => {
      console.error("[mf] WebSocket error:", error);
    };

    socket.onmessage = (event: MessageEvent) => {
      (event.data as string).split("\r\n").forEach((line) => {
        if (!line.trim()) return;

        const message = parseIRC(line);
        if (!message || !message.command) return;

        switch (message.command) {
          case "PING":
            socket.send(`PONG :tmi.twitch.tv`);
            return;

          case "001": // [mf] IRC Ready
          case "372": // MOTD
          case "375": // MOTD start
          case "376": // MOTD end
            console.log("[mf] IRC handshake complete");
            return;

          case "JOIN":
            console.log(`[mf] joined #${this.targetChannelUsername}`);
            return;

          case "CLEARMSG":
            if (message.tags?.["target-msg-id"]) {
              this.clearMessage(message.tags["target-msg-id"]);
            }
            return;

          case "CLEARCHAT":
            if (message.params[1]) this.clearChat(message.params[1]);
            return;

          case "PRIVMSG":
            if (
              message.params[0] !==
                `#${this.targetChannelUsername.toLowerCase()}` ||
              !message.params[1]
            ) {
              return;
            }

            const username = message.prefix?.split("!")[0] || "";
            if (!username) return;

            // Команды модераторов
            if (message.params[1].toLowerCase() === "!refreshoverlay") {
              const hasModBadge = message.tags?.badges
                ?.split(",")
                .some(
                  (badge) =>
                    badge.startsWith("moderator/") ||
                    badge.startsWith("broadcaster/"),
                );
              if (hasModBadge) {
                this.fetchEmotes();
              }
              return;
            }

            // Фильтры
            if (this.prefs.hideCommands && /^!.+/.test(message.params[1]))
              return;
            if (
              !this.prefs.showBots &&
              BOTUSERNAMES.includes(username.toLowerCase())
            )
              return;
            if (this.blockedUsers.includes(username.toLowerCase())) return;

            // Бейджи (ленивая загрузка)
            if (this.prefs.showBadges && message.tags?.["user-id"]) {
              const cacheKey = username.toLowerCase();
              if (
                !this.badger.hasBadges(cacheKey) &&
                !this.loadingUserBadges.has(cacheKey)
              ) {
                this.loadingUserBadges.add(cacheKey);
                this.badger
                  .loadUserBadges(username, message.tags["user-id"] as string)
                  .finally(() => this.loadingUserBadges.delete(cacheKey));
              }
            }

            this.write(username, message.tags || {}, message.params[1]);
            return;
        }
      });
    };

    (this as any).socket = socket;
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default ChatInstance;
