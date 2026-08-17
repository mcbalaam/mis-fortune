import Emote from "./Emote";
import type { EmoteReplacement } from "./Emote";
import type { UserPreferences } from "./UserPreferences";
import { ChatMessage } from "./ChatMessage";
import type { CheerInfo } from "./ChatMessage";
import type { Badge } from "./Badge";
import Badger from "./Badge";
import parseIRC from "./IRCMessage";
import { BOTUSERNAMES, escapeRegExp } from "../modules/constants";
import { fetchFFZEmotes } from "../modules/ffz";
import { fetchBTTVEmotes } from "../modules/bttv";
import { fetchSeventvEmotes } from "../modules/seventv";
import { getChannelID, fetchTwitchBadges } from "../modules/twitch";

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
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageTime = 0;
  private destroyed = false;
  private static readonly RECONNECT_BASE_DELAY_MS = 1000;
  private static readonly RECONNECT_MAX_DELAY_MS = 30000;
  private static readonly WATCHDOG_TIMEOUT_MS = 240000;
  private static readonly WATCHDOG_INTERVAL_MS = 15000;

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

  async fetchTwitchBadges() {
    this.write("Поли", { color: "#84b574" }, "Собираем бейджи...");

    this.badges = await fetchTwitchBadges(this.targetChannelUsername);

    this.write(
      "Поли",
      { color: "#84b574" },
      `Собрали ${Object.keys(this.badges).length} беджей!!`,
    );
  }

  async fetchEmotes() {
    this.emotes = {};

    const [ffzEmotes, bttvEmotes] = await Promise.all([
      fetchFFZEmotes(this.targetChannelUsername),
      fetchBTTVEmotes(this.targetChannelUsername),
    ]);

    Object.assign(this.emotes, ffzEmotes, bttvEmotes);

    this.write("Поли", { color: "#84b574" }, "Собираем эмоуты...");

    const seventvEmotes = await fetchSeventvEmotes(this.targetChannelID);
    Object.assign(this.emotes, seventvEmotes);

    const seventvCount = Object.keys(seventvEmotes).length;
    if (seventvCount > 0) {
      this.write("Поли", { color: "#84b574" }, `Собрали ${seventvCount} эмоутов!!`);
    }
  }

  async init() {
    console.log("[m-f] init() called");
    this.write("Поли", { color: "#84b574" }, "mis-fortune 0.9");
    this.write("Поли", { color: "#84b574" }, "Инициализация...");

    try {
      const id = await getChannelID(this.targetChannelUsername);
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
      this.write("Поли", { color: "#84b574" }, "Инициализация завершена");
    } catch (e) {
      console.error("[m-f] init() error:", e);
    }
  }

  destroy() {
    console.log("[m-f] Destroying instance...");
    this.destroyed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopWatchdog();
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
    this.messages = [];
  }

  private scheduleReconnect(reason: string) {
    if (this.destroyed) return;
    if (this.reconnectTimer !== null) return;

    const delay = Math.min(
      ChatInstance.RECONNECT_MAX_DELAY_MS,
      ChatInstance.RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
    );
    this.reconnectAttempts++;
    console.log(
      `[m-f] ${reason}. Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`,
    );
    this.write(
      "Поли",
      { color: "#84b574" },
      `Потеряно соединение, переподключение через ${delay / 1000}с...`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectSocket();
    }, delay);
  }

  private stopWatchdog() {
    if (this.watchdogTimer !== null) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private startWatchdog(socket: WebSocket) {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastMessageTime > ChatInstance.WATCHDOG_TIMEOUT_MS) {
        console.log("[m-f] watchdog: no data received, forcing reconnect");
        socket.close();
      }
    }, ChatInstance.WATCHDOG_INTERVAL_MS);
  }

  connectSocket() {
    if (this.destroyed) return;
    console.log("[m-f] connecting to IRC...");
    this.write("Поли", { color: "#84b574" }, "Подключаемся...");

    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }

    const socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443", "irc");
    this.socket = socket;
    this.lastMessageTime = Date.now();

    socket.onopen = () => {
      console.log("[m-f] socket connected");
      this.write("Поли", { color: "#84b574" }, "Сокет подключён");
      this.startWatchdog(socket);
      socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      socket.send("NICK justinfan0");
      socket.send("PASS oauth:");
      socket.send(`JOIN #${this.targetChannelUsername.toLowerCase()}`);
      this.write(
        "Поли",
        { color: "#84b574" },
        `Подключено к #${this.targetChannelUsername}`,
      );

      // сбрасываем backoff только если соединение стабильно какое-то время
      setTimeout(() => {
        if (this.socket === socket && socket.readyState === WebSocket.OPEN) {
          this.reconnectAttempts = 0;
        }
      }, 15000);
    };

    socket.onclose = (event) => {
      console.log(
        `[m-f] socket connection lost (code ${event.code}, reason "${event.reason}")`,
      );
      if (this.socket === socket) this.socket = null;
      this.stopWatchdog();
      this.scheduleReconnect(
        `connection lost (code ${event.code})`,
      );
    };

    socket.onerror = (error) => {
      console.error("[m-f] WebSocket error:", error);
      // onclose всегда следует за onerror и запускает реконнект
    };

    socket.onmessage = (event: MessageEvent) => {
      this.lastMessageTime = Date.now();
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

  runSocketConnection() {
    this.connectSocket();
  }
}

export default ChatInstance;
