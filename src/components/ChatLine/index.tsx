import type { CSSProperties } from "react";
import type { ChatMessage } from "../../primitives/ChatMessage";
import type Emote from "../../primitives/Emote";

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

interface ChatLineProps {
  message: ChatMessage;
}

export default function ChatLine({ message }: ChatLineProps) {
  const {
    badges,
    displayName,
    color,
    message: text,
    twitchEmotes,
    thirdPartyEmotes,
    bits,
    cheer,
  } = message;

  const fontSize = 16;
  const badgeSize = 18;

  const contentStyle: CSSProperties = {
    display: "inline",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "#fff",
    textShadow: "0px 0px 1px #000, 0px 0px 2px #000",
  };

  const parseMessage = (): ChatToken[] => {
    const chars = text.split("");
    const filledMask = new Array(chars.length).fill(false);

    const tokens: (EmoteToken | string | null)[] = new Array(chars.length).fill(
      null,
    );

    if (twitchEmotes) {
      twitchEmotes.forEach((emote) => {
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
    thirdPartyEmotes.forEach(({ code, emote }) =>
      thirdPartyMap.set(code, emote),
    );

    const finalTokens: ChatToken[] = [];

    let currentTextBuffer = "";

    const flushText = () => {
      if (!currentTextBuffer) return;

      const words = currentTextBuffer.split(/(\s+)/);

      words.forEach((word) => {
        if (!word) return;

        const tpEmote = thirdPartyMap.get(word.trim());

        if (tpEmote) {
          finalTokens.push({
            type: "emote",
            url: tpEmote.image,
            code: word,
            zeroWidth: tpEmote.zeroWidth,
          });
        } else {
          finalTokens.push({
            type: "text",
            text: word,
          });
        }
      });

      currentTextBuffer = "";
    };

    for (let i = 0; i < chars.length; i++) {
      if (tokens[i] && typeof tokens[i] === "object") {
        flushText();
        finalTokens.push(tokens[i] as EmoteToken);
      }
      else if (filledMask[i]) {
        continue;
      }
      else {
        currentTextBuffer += chars[i];
      }
    }

    flushText();
    return finalTokens;
  };

  const renderContent = () => {
    const tokens = parseMessage();
    const rendered: React.ReactNode[] = [];

    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];

      if (token.type === "text") {
        if (/^@\w+/.test(token.text)) {
          rendered.push(
            <span key={i} className="mention">
              {token.text}
            </span>,
          );
        } else {
          rendered.push(
            <span key={i} style={contentStyle}>
              {token.text}
            </span>,
          );
        }
        i++;
        continue;
      }

      const baseEmote = token;

      if (baseEmote.zeroWidth) {
        rendered.push(
          <img
            key={i}
            src={baseEmote.url}
            alt={baseEmote.code}
            className="emote"
            style={{ height: fontSize * 1.5, verticalAlign: "middle" }}
          />,
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
          <img
            key={i}
            src={baseEmote.url}
            alt={baseEmote.code}
            className="emote"
            style={{
              height: fontSize * 1.5,
              verticalAlign: "middle",
              margin: "0 2px",
            }}
          />,
        );
      } else {
        rendered.push(
          <span
            key={i}
            className="emote-stack"
            style={{
              height: fontSize * 1.5,
              display: "inline-flex",
              justifyContent: "center",
              alignItems: "center",
              position: "relative",
              verticalAlign: "middle",
              margin: "0 2px",
            }}
          >
            <img
              src={baseEmote.url}
              className="base-emote"
              style={{
                height: fontSize * 1.5,
                width: "auto",
                display: "block",
                zIndex: 0,
              }}
            />

            {overlays.map((ov, idx) => (
              <img
                key={`ov-${idx}`}
                src={ov.url}
                className="overlay-emote"
                style={{
                  position: "absolute",
                  height: fontSize * 1.5,
                  width: "auto",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  zIndex: idx + 1,
                  pointerEvents: "none",
                }}
              />
            ))}
          </span>,
        );
      }
      i = nextIdx;
    }

    return <>{rendered}</>;
  };

  return (
    <div className="chat-line" style={{ fontSize }}>
      <div className="chat-meta">
        {badges.map((b, i) => (
          <img
            key={i}
            src={b.url}
            alt={b.description}
            style={{
              height: badgeSize,
              marginRight: 4,
              borderRadius: 2,
              verticalAlign: "middle",
            }}
          />
        ))}
        <span
          style={{
            fontWeight: 700,
            color: color || "#a0a0a0",
            textShadow: "1px 1px 0 #000",
          }}
        >
          {displayName}
        </span>
      </div>

      <div className="chat-content">
        {bits && cheer && (
          <span
            style={{
              color: cheer.color || "#9146FF",
              fontWeight: 800,
              marginRight: 6,
            }}
          >
            <img
              src={cheer.image}
              alt="cheer"
              style={{
                height: fontSize,
                verticalAlign: "middle",
                marginRight: 2,
                marginTop: "2px",
              }}
            />
            {bits}
          </span>
        )}
        {renderContent()}
      </div>
    </div>
  );
}
