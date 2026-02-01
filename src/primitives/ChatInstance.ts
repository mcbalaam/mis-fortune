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
  "wizebot",
];

const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

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

  badges: Record<string, string> = {};

  private loadingUserBadges: Set<string> = new Set();
  private socket: WebSocket | null = null;

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

    // fetching IRC Twitch badges
    if (info.badges && typeof info.badges === "string") {
      info.badges.split(",").forEach((badgeStr: string) => {
        const [type, version] = badgeStr.split("/");
        // looking for badges in the cache
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

    // third-party badges (chatterino, 7tv)
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

    // username color
    let color: string | undefined;
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

    interface TwitchEmoteData {
      id: string;
      start: number;
      end: number;
      url: string;
    }

    const twitchEmotes: TwitchEmoteData[] = [];

    if (info.emotes && typeof info.emotes === "string") {
      info.emotes.split("/").forEach((emoteGroup: string) => {
        const [id, positions] = emoteGroup.split(":");
        positions.split(",").forEach((range) => {
          const [start, end] = range.split("-").map(Number);
          twitchEmotes.push({
            id,
            start,
            end,
            url: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`,
          });
        });
      });
    }

    // Обработка сторонних эмоутов (парсинг текста)
    const thirdPartyEmotes: EmoteReplacement[] = [];
    const words = cleanMessage.split(/\s+/);

    for (const word of words) {
      const emote = this.emotes[word];
      if (emote) {
        thirdPartyEmotes.push({ code: word, emote });
      }
    }

    // Обработка Bits / Cheers
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
      id:
        info.id ||
        `${username}_${timestamp}_${Math.random().toString(36).slice(2)}`,
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

  async getChannelID(username: string): Promise<string | null> {
    try {
      const response = await ofetch("https://gql.twitch.tv/gql", {
        method: "POST",
        headers: { "Client-Id": TWITCH_CLIENT_ID },
        body: {
          query: `query GetChannelID($login: String!) { user(login: $login) { id } }`,
          variables: { login: username },
        },
      });
      return response.data?.user?.id || null;
    } catch (e) {
      return null;
    }
  }

  async fetchTwitchBadges() {
    this.write("[m-f]", { color: "#84b574" }, ">> fetching badges...");

    try {
      const globalData: any = await ofetch(
        "https://api.ivr.fi/v2/twitch/badges/global",
      );

      globalData.forEach((set: any) => {
        set.versions.forEach((ver: any) => {
          this.badges[`${set.set_id}:${ver.id}`] = ver.image_url_4x;
        });
      });

      if (this.targetChannelUsername) {
        const channelData: any = await ofetch(
          `https://api.ivr.fi/v2/twitch/badges/channel?login=${this.targetChannelUsername}`,
        );

        channelData.forEach((set: any) => {
          set.versions.forEach((ver: any) => {
            this.badges[`${set.set_id}:${ver.id}`] = ver.image_url_4x;
          });
        });
      }

      this.write(
        "[m-f]",
        { color: "#84b574" },
        `>> fetched ${Object.keys(this.badges).length} badges`,
      );
    } catch (e) {
      console.warn("[Twitch Badges] IVR fetch failed:", e);
    }
  }

  async fetchEmotes() {
    this.emotes = {};

    // 1. FrankerFaceZ
    const ffzEndpoints = [
      "emotes/global",
      `users/twitch/${encodeURIComponent(this.targetChannelUsername)}`,
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
            this.emotes[emoteData.name] = new Emote({
              id: emoteData.id,
              image: imageUrl.startsWith("//") ? `https:${imageUrl}` : imageUrl,
            });
          });
        });
      } catch (error) {
      }
    }

    // 2. BetterTTV
    const bttvEndpoints = [
      "emotes/global",
      `users/twitch/${encodeURIComponent(this.targetChannelUsername)}`,
    ];
    for (const endpoint of bttvEndpoints) {
      try {
        const res = await ofetch(
          `https://api.betterttv.net/3/cached/${endpoint}`,
          { ignoreResponseError: true, timeout: 5000 },
        );
        const emotes = Array.isArray(res)
          ? res
          : res.channelEmotes.concat(res.sharedEmotes);
        emotes.forEach((emoteData: any) => {
          this.emotes[emoteData.code] = new Emote({
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

    // 3. 7TV (V3 API)
    try {
      const isZeroWidth = (flags: number) =>
        (flags & 256) !== 0 || (flags & 1) !== 0;

      this.write("[7tv]", { color: "#ac73ba" }, `>> fetching emotes...`);

      const fetchWithTimeout = (url: string, ms: number) => {
        const fetchPromise = ofetch(url, { ignoreResponseError: true });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), ms),
        );
        return Promise.race([fetchPromise, timeoutPromise]);
      };

      let globalRes: any = {};
      try {
        globalRes = await fetchWithTimeout(
          "https://7tv.io/v3/emote-sets/global",
          5000,
        );
      } catch (e) {
        console.warn("[7TV] Global emotes timeout or error");
      }

      if (globalRes && globalRes.emotes) {
        globalRes.emotes.forEach((emote: any) => {
          this.emotes[emote.name] = new Emote({
            id: emote.id,
            image: `https://cdn.7tv.app/emote/${emote.id}/4x.webp`,
            zeroWidth: isZeroWidth(emote.flags),
          });
        });
      }

      if (this.targetChannelID && this.targetChannelID !== "0") {
        let userRes: any = null;
        try {
          userRes = await fetchWithTimeout(
            `https://7tv.io/v3/users/twitch/${this.targetChannelID}`,
            5000,
          );
        } catch (e) {
          console.warn("[7TV] Channel emotes timeout or error");
        }

        if (userRes && userRes.emote_set?.emotes) {
          userRes.emote_set.emotes.forEach((emote: any) => {
            const code = emote.name;
            const data = emote.data || emote;

            this.emotes[code] = new Emote({
              id: data.id,
              image: `https://cdn.7tv.app/emote/${data.id}/4x.webp`,
              zeroWidth:
                data.flags === 1 ||
                data.flags === 256 ||
                emote.flags === 1 ||
                emote.flags === 256,
            });
          });

          const count = userRes.emote_set.emotes.length;
          console.log(`[7TV] Loaded ${count} emotes`);
          this.write(
            "[7tv]",
            { color: "#ac73ba" },
            `>> fetched ${count} emotes`,
          );
        } else if (!userRes) {
          this.write(
            "[7tv]",
            { color: "#ac73ba" },
            `>> channel emotes skipped (timeout)`,
          );
        }
      }
    } catch (err) {
      console.warn("[7TV] fetch critical error:", err);
      this.write("[7tv]", { color: "#ac73ba" }, `>> failed to fetch emotes`);
    }
  }

  async init() {
    console.log("[m-f] init() called");
    this.write("[m-f]", { color: "#84b574" }, ">> mis-fortune 0.7");
    this.write("[m-f]", { color: "#84b574" }, ">> initializing...");

    try {
      const id = await this.getChannelID(this.targetChannelUsername);
      if (id) {
        this.targetChannelID = id;
        console.log(`[m-f] Resolved ID: ${id}`);
      } else {
        console.warn(
          `[m-f] Could not resolve ID for ${this.targetChannelUsername}, 7TV & Twitch Badges might fail.`,
        );
      }

      await Promise.all([this.fetchEmotes(), this.fetchTwitchBadges()]);

      if (this.prefs.showBadges) {
        const badgePromise = this.badger.loadGlobalBadges();
        const timeoutPromise = new Promise((resolve) =>
          setTimeout(resolve, 10000),
        );
        await Promise.race([badgePromise, timeoutPromise]);
      }

      console.log("[m-f] init() finished OK");
      this.write("[m-f]", { color: "#84b574" }, ">> initialization complete");
    } catch (e) {
      console.error("[m-f] init() error:", e);
    }
  }

  destroy() {
    console.log("[m-f] Destroying instance...");
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
    this.messages = [];
  }

  runSocketConnection() {
    console.log("[m-f] connecting to IRC...");
    this.write("[m-f]", { color: "#84b574" }, ">> connecting to IRC...");

    if (this.socket) {
      this.socket.close();
    }

    const socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443", "irc");
    this.socket = socket;

    socket.onopen = () => {
      console.log("[m-f] socket connected");
      this.write("[m-f]", { color: "#84b574" }, ">> socket connected");
      socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      socket.send("NICK justinfan0");
      socket.send("PASS oauth:");
      socket.send(`JOIN #${this.targetChannelUsername.toLowerCase()}`);
      this.write(
        "[m-f]",
        { color: "#84b574" },
        `>> joined #${this.targetChannelUsername}`,
      );
      this.write(
        "\b",
        { color: "#ffffff" },
        "\b",
      );
    };

    socket.onclose = () => {
      console.log("[m-f] socket connection lost");
    };

    socket.onerror = (error) => {
      console.error("[m-f] WebSocket error:", error);
    };

    socket.onmessage = (event: MessageEvent) => {
      (event.data as string).split("\r\n").forEach((line) => {
        if (!line.trim()) return;

        const message = parseIRC(line);
        if (!message || !message.command) return;
        if (
          message.command === "ROOMSTATE" ||
          message.command === "USERSTATE"
        ) {
          if (message.tags?.["room-id"] && this.targetChannelID === "0") {
            this.targetChannelID = message.tags["room-id"] as string;
          }
        }

        switch (message.command) {
          case "PING":
            socket.send(`PONG :tmi.twitch.tv`);
            return;

          case "001":
          case "372":
          case "375":
          case "376":
            return;

          case "JOIN":
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
                this.fetchTwitchBadges();
                console.log("🔄 Overlay refreshed by mod");
              }
              return;
            }

            if (this.prefs.hideCommands && /^!.+/.test(message.params[1]))
              return;
            if (
              !this.prefs.showBots &&
              BOTUSERNAMES.includes(username.toLowerCase())
            )
              return;
            if (this.blockedUsers.includes(username.toLowerCase())) return;

            if (this.prefs.showBadges && message.tags?.["user-id"]) {
              const cacheKey = username.toLowerCase();
              if (
                !this.badger.hasBadges(cacheKey) &&
                !this.loadingUserBadges.has(cacheKey)
              ) {
                this.loadingUserBadges.add(cacheKey);
                this.badger
                  .loadUserBadges(username, message.tags["user-id"] as string)
                  .catch((err) =>
                    console.warn(`Badges failed for ${username}`, err),
                  )
                  .finally(() => this.loadingUserBadges.delete(cacheKey));
              }
            }

            this.write(username, message.tags || {}, message.params[1]);
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
