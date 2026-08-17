import { ofetch } from "ofetch";

const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

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
): Promise<Record<string, string>> {
  const badges: Record<string, string> = {};

  try {
    const globalData: any = await ofetch(
      "https://api.ivr.fi/v2/twitch/badges/global",
    );

    globalData.forEach((set: any) => {
      set.versions.forEach((ver: any) => {
        badges[`${set.set_id}:${ver.id}`] = ver.image_url_4x;
      });
    });

    if (channelUsername) {
      const channelData: any = await ofetch(
        `https://api.ivr.fi/v2/twitch/badges/channel?login=${channelUsername}`,
      );

      channelData.forEach((set: any) => {
        set.versions.forEach((ver: any) => {
          badges[`${set.set_id}:${ver.id}`] = ver.image_url_4x;
        });
      });
    }
  } catch (e) {
    console.warn("[Twitch Badges] IVR fetch failed:", e);
  }

  return badges;
}
