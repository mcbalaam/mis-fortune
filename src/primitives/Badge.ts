import { ofetch } from "ofetch";

export interface Badge {
  description: string;
  url: string;
  priority: boolean;
  color?: string;
}

export interface FFZUserBadges {
  badges?: Record<
    string,
    {
      title: string;
      urls: Record<string, string>;
      color?: string;
    }
  >;
}

export interface FfzapUser {
  id: string;
  tier: number;
  badge_color?: string;
  badge_is_colored?: number;
}

export interface BTTVBadgeUser {
  name: string;
  badge: {
    description: string;
    svg: string;
  };
}

export interface ChatterinoBadge {
  tooltip: string;
  image1?: string;
  image2?: string;
  image3?: string;
  users: string[];
}

/// инстанс бэйджера (баджера, барсука то бишь). фетчит бейджи, кеширует их, отдаёт по запросу
export default class Badger {
  // кэш всех бейджей пользователей
  private userBadgesCache: Map<string, Badge[]> = new Map();

  // глобальные данные о бейджах
  private chatterinoBadges: ChatterinoBadge[] = [];
  private ffzapBadges: FfzapUser[] = [];
  private bttvBadges: BTTVBadgeUser[] = [];

  // 7TV бейджи теперь грузятся индивидуально, глобального списка нет

  // флаги загрузки
  private loadingUsers: Set<string> = new Set();

  async loadGlobalBadges(): Promise<void> {
    try {
      // 7TV убран из Promise.all, так как глобального списка нет в v3
      const [chatterino, ffzap, bttv] = await Promise.all([
        this.fetchChatterinoBadges(),
        this.fetchFfzapBadges(),
        this.fetchBttvBadges(),
      ]);

      this.chatterinoBadges = chatterino;
      this.ffzapBadges = ffzap;
      this.bttvBadges = bttv;
    } catch (error) {}
  }

  async loadUserBadges(username: string, userId: string): Promise<void> {
    const cacheKey = username.toLowerCase();

    if (this.loadingUsers.has(cacheKey) || this.userBadgesCache.has(cacheKey)) {
      return;
    }

    this.loadingUsers.add(cacheKey);

    try {
      const badges: Badge[] = [];

      // 1. FFZ (Индивидуальный запрос)
      const ffzBadges = await this.loadFFZBadges(username);
      badges.push(...ffzBadges);

      // 2. FFZ:AP (Из глобального списка по ID)
      const ffzapBadge = this.loadFfzapBadge(userId);
      if (ffzapBadge) {
        badges.push(ffzapBadge);
      }

      // 3. BTTV (Из глобального списка по имени)
      const bttvBadges = this.loadBttvBadges(username);
      badges.push(...bttvBadges);

      // 4. 7TV (Индивидуальный запрос v3 по ID)
      const sevBadge = await this.loadSeventvBadge(userId);
      if (sevBadge) {
        badges.push(sevBadge);
      }

      // 5. Chatterino (Из глобального списка по ID)
      const chatterinoBadges = this.loadChatterinoBadges(userId);
      badges.push(...chatterinoBadges);

      const uniqueBadges = this.removeDuplicateBadges(badges);

      this.userBadgesCache.set(cacheKey, uniqueBadges);
    } catch (error) {
      this.userBadgesCache.set(cacheKey, []);
    } finally {
      this.loadingUsers.delete(cacheKey);
    }
  }

  getUserBadges(username: string): Badge[] {
    const cacheKey = username.toLowerCase();
    return this.userBadgesCache.get(cacheKey) || [];
  }

  hasBadges(username: string): boolean {
    return this.userBadgesCache.has(username.toLowerCase());
  }

  clearUserBadges(username: string): void {
    this.userBadgesCache.delete(username.toLowerCase());
  }

  clearAllBadges(): void {
    this.userBadgesCache.clear();
  }

  private async loadFFZBadges(username: string): Promise<Badge[]> {
    try {
      const res: FFZUserBadges = await ofetch(
        `https://api.frankerfacez.com/v1/user/${username}`,
      );

      const badges: Badge[] = [];

      if (res.badges) {
        Object.entries(res.badges).forEach(([key, badgeData]) => {
          const url =
            badgeData.urls["4"] || badgeData.urls["2"] || badgeData.urls["1"];
          if (url) {
            badges.push({
              description: badgeData.title,
              url: url.startsWith("http") ? url : `https:${url}`,
              color: badgeData.color,
              priority: false,
            });
          }
        });
      }

      return badges;
    } catch (error) {
      // 404 для FFZ это норма, если у юзера нет бейджей
      return [];
    }
  }

  private loadFfzapBadge(userId: string): Badge | null {
    const user = this.ffzapBadges.find((u) => u.id.toString() === userId);
    if (!user) return null;

    let color = "#755000";
    if (user.tier === 2) {
      color = user.badge_color || "#755000";
    } else if (user.tier === 3) {
      color = user.badge_is_colored ? "#755000" : user.badge_color || "#755000";
    }

    return {
      description: "FFZ:AP Badge",
      url: `https://api.ffzap.com/v1/user/badge/${userId}/3`,
      color,
      priority: false,
    };
  }

  private loadBttvBadges(username: string): Badge[] {
    return this.bttvBadges
      .filter((user) => user.name.toLowerCase() === username.toLowerCase())
      .map((user) => ({
        description: user.badge.description,
        url: user.badge.svg,
        priority: false,
      }));
  }

  // НОВЫЙ МЕТОД ДЛЯ 7TV v3
  private async loadSeventvBadge(userId: string): Promise<Badge | null> {
    try {
      // Запрашиваем данные пользователя по ID
      const data = await ofetch(`https://7tv.io/v3/users/twitch/${userId}`);

      // В v3 бейдж находится в style.badge (если он активен/выбран)
      const badge = data.user?.style?.badge || data.style?.badge;

      if (badge) {
        return {
          description: badge.tooltip || "7TV Badge",
          // URL бейджа берем с CDN
          url: `https://cdn.7tv.app/badge/${badge.id}/3x.webp`,
          priority: false,
        };
      }
      return null;
    } catch (error) {
      // 404 означает отсутствие профиля на 7TV, игнорируем
      return null;
    }
  }

  private loadChatterinoBadges(userId: string): Badge[] {
    return this.chatterinoBadges
      .filter((badge) => badge.users.includes(userId))
      .map((badge) => {
        const url = badge.image3 || badge.image2 || badge.image1;
        return url
          ? {
              description: badge.tooltip,
              url,
              priority: false,
            }
          : null;
      })
      .filter((badge): badge is Badge => badge !== null);
  }

  private removeDuplicateBadges(badges: Badge[]): Badge[] {
    const seen = new Set<string>();
    return badges.filter((badge) => {
      if (seen.has(badge.url)) {
        return false;
      }
      seen.add(badge.url);
      return true;
    });
  }

  private async fetchChatterinoBadges(): Promise<ChatterinoBadge[]> {
    try {
      const res = await ofetch("https://api.chatterino.com/badges");
      return res.badges || res;
    } catch (error) {
      return [];
    }
  }

  private async fetchFfzapBadges(): Promise<FfzapUser[]> {
    try {
      return await ofetch("https://api.ffzap.com/v1/supporters");
    } catch (error) {
      return [];
    }
  }

  private async fetchBttvBadges(): Promise<BTTVBadgeUser[]> {
    try {
      return await ofetch("https://api.betterttv.net/3/cached/badges");
    } catch (error) {
      return [];
    }
  }
}
