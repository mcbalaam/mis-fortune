import type { CSSProperties } from "react";
import type { ChatMessage } from "../primitives/ChatMessage";
import type Emote from "../primitives/Emote";

type TextToken = {
  type: "text";
  text: string;
};

type EmoteToken = {
  type: "emote";
  url: string;
  code?: string;
  zeroWidth?: boolean;
  isTwitch?: boolean;
};

type ChatToken = TextToken | EmoteToken;

interface ChatLineSS13Props {
  message: ChatMessage;
  alignBadges?: boolean;
  animate?: boolean;
}

const BOTUSERNAMES = [
  "streamelements",
  "streamlabs",
  "nightbot",
  "moobot",
  "fossabot",
  "wizebot",
];

interface TagInfo {
  label: string;
  color: string;
  isCommand: boolean;
}

function getTagInfo(message: ChatMessage): TagInfo {
  const { badges, username } = message;
  const descs = badges.map((b) => b.description.toLowerCase());

  if (BOTUSERNAMES.includes(username.toLowerCase())) {
    return { label: "Двоичный", color: "#4fc3f7", isCommand: false };
  }

  if (
    descs.includes("broadcaster") ||
    descs.includes("staff") ||
    descs.includes("admin")
  ) {
    return { label: "Командование", color: "#ffe000", isCommand: true };
  }

  if (descs.includes("moderator")) {
    return { label: "Безопасность", color: "#ff3232", isCommand: false };
  }

  if (descs.includes("vip")) {
    return { label: "Командование", color: "#ffe000", isCommand: false };
  }

  if (descs.includes("founder") || descs.includes("artist")) {
    return { label: "Командование", color: "#ffe000", isCommand: false };
  }

  if (descs.includes("subscriber")) {
    return { label: "Синдикат", color: "#a63c4f", isCommand: false };
  }

  return { label: "Общий", color: "#6bf96b", isCommand: false };
}

function getEnding(text: string): { suffix: string; isEmphatic: boolean } {
  const trimmed = text.trimEnd();
  if (trimmed.endsWith("!!")) return { suffix: "!!", isEmphatic: true };
  if (trimmed.endsWith("!")) return { suffix: "!", isEmphatic: false };
  if (trimmed.endsWith("?")) return { suffix: "?", isEmphatic: false };
  return { suffix: "", isEmphatic: false };
}

const NORMAL_VERBS: Record<string, string> = {
  "": "говорит",
  "!": "восклицает",
  "!!": "кричит",
  "?": "спрашивает",
};

const BOT_VERBS: Record<string, string> = {
  "": "сообщает",
  "!": "предупреждает",
  "!!": "сигналит",
  "?": "запрашивает",
};

function parseMessage(text: string, twitchEmotes: any[], thirdPartyEmotes: any[]): ChatToken[] {
  const chars = text.split("");
  const filledMask = new Array(chars.length).fill(false);
  const tokens: (EmoteToken | string | null)[] = new Array(chars.length).fill(null);

  if (twitchEmotes) {
    twitchEmotes.forEach((emote: any) => {
      if (emote.start < 0 || emote.end >= chars.length) return;
      for (let i = emote.start; i <= emote.end; i++) {
        filledMask[i] = true;
        tokens[i] = null;
      }
      tokens[emote.start] = {
        type: "emote",
        url: emote.url,
        code: text.substring(emote.start, emote.end + 1),
        isTwitch: true,
        zeroWidth: false,
      };
    });
  }

  const thirdPartyMap = new Map<string, Emote>();
  thirdPartyEmotes.forEach(({ code, emote }: any) => thirdPartyMap.set(code, emote));

  const finalTokens: ChatToken[] = [];
  let currentTextBuffer = "";

  const flushText = () => {
    if (!currentTextBuffer) return;
    const words = currentTextBuffer.split(/(\s+)/);
    words.forEach((word) => {
      if (!word) return;
      const tpEmote = thirdPartyMap.get(word.trim());
      if (tpEmote) {
        finalTokens.push({ type: "emote", url: tpEmote.image, code: word, zeroWidth: tpEmote.zeroWidth });
      } else {
        finalTokens.push({ type: "text", text: word });
      }
    });
    currentTextBuffer = "";
  };

  for (let i = 0; i < chars.length; i++) {
    if (tokens[i] && typeof tokens[i] === "object") {
      flushText();
      finalTokens.push(tokens[i] as EmoteToken);
    } else if (filledMask[i]) {
      continue;
    } else {
      currentTextBuffer += chars[i];
    }
  }

  flushText();
  return finalTokens;
}

export default function ChatLineSS13({ message, alignBadges = true, animate = true }: ChatLineSS13Props) {
  const {
    badges,
    displayName,
    color: nameColor,
    message: text,
    twitchEmotes,
    thirdPartyEmotes,
    bits,
    cheer,
    username,
    isAction,
  } = message;

  const tag = getTagInfo(message);
  const isBot = BOTUSERNAMES.includes(username.toLowerCase());
  const { suffix, isEmphatic } = getEnding(text);
  const verbs = isBot ? BOT_VERBS : NORMAL_VERBS;
  const verb = verbs[suffix] || verbs[""];

  const baseFontSize = tag.isCommand ? 25 : 18;
  const badgeSize = tag.isCommand ? 20 : 16;

  const lineColor = isAction ? "#ffffff" : tag.color;

  const lineStyle: CSSProperties = {
    fontSize: baseFontSize,
    fontWeight: tag.isCommand ? 900 : isEmphatic ? 700 : 400,
    lineHeight: 1.4,
    color: lineColor,
    textShadow: "0px 0px 2px #000, 0px 0px 4px #000",
    fontFamily: "Verdana, sans-serif",
    WebkitFontSmoothing: "none",
    MozOsxFontSmoothing: "unset",
    letterSpacing: "0.8px",
    padding: "1px 0",
    animation: animate ? "ss13FloatUp 0.25s ease forwards" : undefined,
    opacity: animate ? 0 : 1,
    display: "flex",
    alignItems: "baseline",
  };

  const badgeColumnStyle: CSSProperties = {
    width: alignBadges ? 60 : undefined,
    minWidth: alignBadges ? 60 : undefined,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
    marginRight: 10,
  };

  const bodyStyle: CSSProperties = {
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "break-word",
    minWidth: 0,
    fontFamily: isBot ? "monospace" : undefined,
  };

  const nameStyle: CSSProperties = {
    fontWeight: 700,
    color: nameColor || "#a0a0a0",
  };

  const tokens = parseMessage(text, twitchEmotes, thirdPartyEmotes);

  const renderTokens = () => {
    const rendered: React.ReactNode[] = [];
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      if (token.type === "text") {
        if (/^@\w+/.test(token.text)) {
          rendered.push(<span key={i} className="mention">{token.text}</span>);
        } else {
          rendered.push(<span key={i}>{token.text}</span>);
        }
        i++;
        continue;
      }

      const baseEmote = token;

      if (baseEmote.zeroWidth) {
        rendered.push(
          <img key={i} src={baseEmote.url} alt={baseEmote.code} style={{ height: baseFontSize * 1.4, verticalAlign: "middle" }} />,
        );
        i++;
        continue;
      }

      const overlays: EmoteToken[] = [];
      let nextIdx = i + 1;
      while (nextIdx < tokens.length) {
        const nextToken = tokens[nextIdx];
        if (nextToken.type === "text" && !nextToken.text.trim()) {
          nextIdx++;
          continue;
        }
        if (nextToken.type === "emote" && nextToken.zeroWidth) {
          overlays.push(nextToken);
          nextIdx++;
        } else {
          break;
        }
      }

      if (overlays.length === 0) {
        rendered.push(
          <img key={i} src={baseEmote.url} alt={baseEmote.code} style={{ height: baseFontSize * 1.4, verticalAlign: "middle", margin: "0 2px" }} />,
        );
      } else {
        rendered.push(
          <span key={i} className="emote-stack" style={{ height: baseFontSize * 1.4, display: "inline-flex", justifyContent: "center", alignItems: "center", position: "relative", verticalAlign: "middle", margin: "0 2px" }}>
            <img src={baseEmote.url} className="base-emote" style={{ height: baseFontSize * 1.4, width: "auto", display: "block", zIndex: 0 }} />
            {overlays.map((ov, idx) => (
              <img key={`ov-${idx}`} src={ov.url} className="overlay-emote" style={{ position: "absolute", height: baseFontSize * 1.4, width: "auto", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: idx + 1, pointerEvents: "none" }} />
            ))}
          </span>,
        );
      }
      i = nextIdx;
    }

    return <>{rendered}</>;
  };

  return (
    <div style={lineStyle}>
      <div style={badgeColumnStyle}>
        {badges.map((b, i) => (
          <img key={i} src={b.url} alt={b.description} style={{ height: badgeSize, borderRadius: 2, verticalAlign: "middle", transform: "translateY(3px)" }} />
        ))}
      </div>
      <div style={bodyStyle}>
        {isAction ? (
          <>
            <span style={nameStyle}>{displayName} </span>
            {renderTokens()}
          </>
        ) : (
          <>
            <span style={{ fontWeight: 600 }}>{`[${tag.label}] `}</span>
            <span style={nameStyle}>{displayName} </span>
            <span>{`${verb}, `}</span>
            {bits && cheer && (
              <span style={{ color: cheer.color || "#9146FF", fontWeight: 800 }}>
                <img src={cheer.image} alt="cheer" style={{ height: baseFontSize, verticalAlign: "middle", marginRight: 2 }} />
                {`${bits} `}
              </span>
            )}
            <span>&ldquo;{renderTokens()}&rdquo;</span>
          </>
        )}
      </div>
    </div>
  );
}
