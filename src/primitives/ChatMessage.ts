import type { Badge } from "./Badge";
import type { EmoteReplacement } from "./Emote";

export class ChatMessage {
  id: string;
  username: string;
  displayName: string;
  color: string;
  badges: Badge[];
  message: string;
  rawMessage: string;
  timestamp: number;
  twitchEmotes: string[];
  thirdPartyEmotes: EmoteReplacement[];
  cheer?: CheerInfo;
  isAction: boolean;
  bits?: number;

  constructor(data: {
    id: string;
    username: string;
    displayName: string;
    color: string;
    badges: Badge[];
    message: string;
    rawMessage: string;
    timestamp: number;
    twitchEmotes: string[];
    thirdPartyEmotes: EmoteReplacement[];
    cheer?: CheerInfo;
    isAction: boolean;
    bits?: number;
  }) {
    this.id = data.id;
    this.username = data.username;
    this.displayName = data.displayName;
    this.color = data.color;
    this.badges = data.badges;
    this.message = data.message;
    this.rawMessage = data.rawMessage;
    this.timestamp = data.timestamp;
    this.twitchEmotes = data.twitchEmotes;
    this.thirdPartyEmotes = data.thirdPartyEmotes;
    this.cheer = data.cheer;
    this.isAction = data.isAction;
    this.bits = data.bits;
  }
}

export interface CheerInfo {
  image: string;
  color: string;
}
