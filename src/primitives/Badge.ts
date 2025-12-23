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

export interface SevBadge {
  tooltip: string;
  urls: string[][];
  users: string[];
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
  private seventvBadges: SevBadge[] | null = null;

  // флаги загрузки
  private loadingUsers: Set<string> = new Set();

  async loadGlobalBadges(): Promise<void> {
    try {
      const [chatterino, ffzap, bttv, seventv] = await Promise.all([
        this.fetchChatterinoBadges(),
        this.fetchFfzapBadges(),
        this.fetchBttvBadges(),
        this.fetchSeventvBadges(),
      ]);

      this.chatterinoBadges = chatterino;
      this.ffzapBadges = ffzap;
      this.bttvBadges = bttv;
      this.seventvBadges = seventv;
    } catch (error) {
      console.error("Failed to load global badges:", error);
    }
  }

  async loadUserBadges(username: string, userId: string): Promise<void> {
    const cacheKey = username.toLowerCase();

    if (this.loadingUsers.has(cacheKey) || this.userBadgesCache.has(cacheKey)) {
      return;
    }

    this.loadingUsers.add(cacheKey);

    try {
      const badges: Badge[] = [];

      const ffzBadges = await this.loadFFZBadges(username);
      badges.push(...ffzBadges);

      const ffzapBadge = this.loadFfzapBadge(userId);
      if (ffzapBadge) {
        badges.push(ffzapBadge);
      }

      const bttvBadges = this.loadBttvBadges(username);
      badges.push(...bttvBadges);

      const sevBadges = this.loadSeventvBadges(username);
      badges.push(...sevBadges);

      const chatterinoBadges = this.loadChatterinoBadges(userId);
      badges.push(...chatterinoBadges);

      const uniqueBadges = this.removeDuplicateBadges(badges);

      this.userBadgesCache.set(cacheKey, uniqueBadges);
    } catch (error) {
      console.error(`Failed to load badges for ${username}:`, error);
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
          const url = badgeData.urls["4"];
          if (url) {
            badges.push({
              description: badgeData.title,
              url: `https:${url}`,
              color: badgeData.color,
              priority: false,
            });
          }
        });
      }

      return badges;
    } catch (error) {
      console.warn(`FFZ badges fetch failed for ${username}:`, error);
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

  private loadSeventvBadges(username: string): Badge[] {
    if (!this.seventvBadges) return [];

    return this.seventvBadges
      .filter((badge) => badge.users.includes(username))
      .map((badge) => ({
        description: badge.tooltip,
        url: badge.urls[2]?.[1],
        priority: false,
      }))
      .filter((badge): badge is Badge => !!badge.url);
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
      return await ofetch("https://api.chatterino.com/badges");
    } catch (error) {
      console.error("Failed to fetch Chatterino badges:", error);
      return [];
    }
  }

  private async fetchFfzapBadges(): Promise<FfzapUser[]> {
    try {
      return await ofetch("https://api.ffzap.com/v1/supporters");
    } catch (error) {
      console.error("Failed to fetch FFZ:AP badges:", error);
      return [];
    }
  }

  private async fetchBttvBadges(): Promise<BTTVBadgeUser[]> {
    try {
      return await ofetch("https://api.betterttv.net/3/cached/badges");
    } catch (error) {
      console.error("Failed to fetch BTTV badges:", error);
      return [];
    }
  }

  private async fetchSeventvBadges(): Promise<SevBadge[] | null> {
    try {
      return await ofetch("https://7tv.io/v3/badges");
    } catch (error) {
      console.error("Failed to fetch 7TV badges:", error);
      return null;
    }
  }
}
