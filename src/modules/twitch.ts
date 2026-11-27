import { ofetch } from "ofetch";
import type { FetchMetadata } from "./metadata";

const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

interface TwitchBadgeSet {
  set_id: string;
  versions: { id: string; image_url_4x: string }[];
}

export async function getChannelID(
  username: string,
): Promise<string | null> {
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

export async function fetchTwitchBadges(
  channelUsername: string,
  fetchMetadata: FetchMetadata,
): Promise<Record<string, string>> {
  const badges: Record<string, string> = {};

  try {
    const globalData = await fetchMetadata<TwitchBadgeSet[]>(
      "ivr",
      "/v2/twitch/badges/global",
    );

    globalData.forEach((set) => {
      set.versions.forEach((ver) => {
        badges[`${set.set_id}:${ver.id}`] = ver.image_url_4x;
      });
    });

    if (channelUsername) {
      const channelData = await fetchMetadata<TwitchBadgeSet[]>(
        "ivr",
        `/v2/twitch/badges/channel?login=${encodeURIComponent(channelUsername)}`,
      );

      channelData.forEach((set) => {
        set.versions.forEach((ver) => {
          badges[`${set.set_id}:${ver.id}`] = ver.image_url_4x;
        });
      });
    }
  } catch (e) {
    console.warn("[Twitch Badges] IVR fetch failed:", e);
  }

  return badges;
}
