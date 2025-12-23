import { ofetch } from "ofetch";

interface Badge {
  description: string;
  url: string;
  priority: boolean;
  color?: string;
}

export default class Badger {
  private async loadFFZUserBadges(username: string): Promise<Badge[]> {
    try {
      const res: FFZUserBadges = await ofetch(
        `https://api.frankerfacez.com/v1/user/${username}`,
      );

      const badges: Badge[] = [];

      if (res.badges) {
        Object.entries(res.badges).forEach(([key, badgeData]) => {
          badges.push({
            description: badgeData.title,
            url: `https:${badgeData.urls["4"]}`,
            color: badgeData.color,
            priority: false,
          });
        });
      }
      return badges;
    } catch (error) {
      console.warn(`FFZ user badges fetch failed for ${username}:`, error);
      return [];
    }
  }

  private async loadFfzapUserBadge(
    userId: string,
    ffzapBadges: any,
  ): Promise<Badge | null> {
    const user = this.ffzapBadges.find((u) => u.id.toString() === userId);
    if (!user) return null;

    let color = "#755000";
    if (user.tier === 2) {
      color = user.badge_color || "#755000";
    } else if (user.tier === 3) {
      color =
        user.badge_is_colored === 0 ? user.badge_color || "#755000" : undefined;
    }

    return {
      description: "FFZ:AP Badge",
      url: `https://api.ffzap.com/v1/user/badge/${userId}/3`,
      color,
      priority: false,
    };
  }

  private loadBTTVUserBadges(username: string): Badge[] {
    return this.bttvBadges
      .filter((user) => user.name.toLowerCase() === username.toLowerCase())
      .map((user) => ({
        description: user.badge.description,
        url: user.badge.svg,
        priority: false,
      }));
  }

  private loadSevUserBadges(username: string): Badge[] {
    if (!this.seventvBadges) return [];

    return this.seventvBadges.flatMap((badge) =>
      badge.users.includes(username)
        ? [
            {
              description: badge.tooltip,
              url: badge.urls[2][1],
              priority: false,
            },
          ]
        : [],
    );
  }

  private loadChatterinoUserBadges(userId: string): Badge[] {
    return this.chatterinoBadges
      .filter((badge) => badge.users.includes(userId))
      .map((badge) => ({
        description: badge.tooltip,
        url: badge.image3 || badge.image2 || badge.image1!,
        priority: false,
      }));
  }

  async loadUserBadges(username: string, userId: string): Promise<void> {
    const key = `${username}_${userId}`;
    if (this.loadingUserBadges.has(key) || this.userBadges[username]) {
      return;
    }

    this.loadingUserBadges.add(key);

    try {
      const [ffzBadges, ffzapBadge] = await Promise.all([
        this.loadFFZUserBadges(username),
        this.loadFfzapUserBadge(userId),
      ]);

      const bttvBadges = this.loadBTTVUserBadges(username);
      const sevBadges = this.loadSevUserBadges(username);
      const chatterinoBadges = this.loadChatterinoUserBadges(userId);

      const allBadges = [
        ...ffzBadges,
        ...(ffzapBadge ? [ffzapBadge] : []),
        ...bttvBadges,
        ...sevBadges,
        ...chatterinoBadges,
      ];

      // Remove duplicates by URL
      const uniqueBadges = allBadges.filter(
        (badge, index, self) =>
          index === self.findIndex((b) => b.url === badge.url),
      );

      this.userBadges[username] = uniqueBadges;
    } finally {
      this.loadingUserBadges.delete(key);
    }
  }
}
