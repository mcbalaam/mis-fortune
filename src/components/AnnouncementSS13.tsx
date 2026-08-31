import type { CSSProperties } from "react";
import type { ChatMessage } from "../primitives/ChatMessage";
import { parseMessage, renderChatTokens } from "./ChatLineSS13";

interface AnnouncementSS13Props {
  message: ChatMessage;
  animate?: boolean;
}

interface AnnouncementTheme {
  accent: string;
  stripeA: string;
  stripeB: string;
}

const THEMES: Record<string, AnnouncementTheme> = {
  PRIMARY: { accent: "#5bc9f2", stripeA: "#16324a", stripeB: "#27567e" },
  BLUE: { accent: "#5bc9f2", stripeA: "#16324a", stripeB: "#27567e" },
  PURPLE: { accent: "#cf92ff", stripeA: "#2a1644", stripeB: "#4a2a72" },
  RED: { accent: "#ff7a7a", stripeA: "#3a1212", stripeB: "#5e1f1f" },
  ORANGE: { accent: "#ffb04c", stripeA: "#3a2610", stripeB: "#5e401c" },
  GREEN: { accent: "#7ee081", stripeA: "#12331a", stripeB: "#1e4d29" },
};

const FALLBACK_THEME: AnnouncementTheme = {
  accent: "#5bc9f2",
  stripeA: "#16324a",
  stripeB: "#27567e",
};

export default function AnnouncementSS13({
  message,
  animate = true,
}: AnnouncementSS13Props) {
  const theme = THEMES[message.noticeColor || "PRIMARY"] ?? FALLBACK_THEME;

  const bannerStyle: CSSProperties = {
    background: `repeating-linear-gradient(45deg, ${theme.stripeA} 0 10px, ${theme.stripeB} 10px 20px)`,
    padding: "6px 8px 8px",
    fontFamily: "Verdana, sans-serif",
    letterSpacing: "0.5px",
    textShadow: "0px 1px 2px #000, 0px 0px 4px #000",
    animation: animate ? "ss13FloatUp 0.25s ease forwards" : undefined,
    opacity: animate ? 0 : 1,
    marginLeft: "70px",
    maxWidth: "800px"
  };

  const headerStyle: CSSProperties = {
    fontSize: 22,
    fontWeight: 900,
    color: theme.accent,
    textTransform: "none",
  };

  const bodyStyle: CSSProperties = {
    marginTop: 4,
    background: "rgba(4, 9, 14, 0.85)",
    color: "#ffffff",
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "Verdana, sans-serif",
    lineHeight: 1.4,
    padding: "8px 10px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "break-word",
  };

  const tokens = parseMessage(
    message.message,
    message.twitchEmotes as any,
    message.thirdPartyEmotes,
  );

  return (
    <div style={bannerStyle}>
      <div style={headerStyle}>{`Оповещение от ${message.displayName}`}</div>
      <div style={bodyStyle}>{renderChatTokens(tokens, 15)}</div>
    </div>
  );
}
