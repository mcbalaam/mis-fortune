// ChatLine.tsx
import type { CSSProperties } from "react";
import type { ChatMessage } from "../primitives/ChatMessage";
import type { UserPreferences } from "../primitives/UserPreferences";

interface ChatLineProps {
  message: ChatMessage;
}

export default function ChatLine({ message }: ChatLineProps) {
  const {
    badges,
    displayName,
    color,
    message: text,
    thirdPartyEmotes,
    bits,
    cheer,
  } = message;

  const lineStyle: CSSProperties = {
    fontSize: `20px`,
    padding: "2px 4px",
    display: "flex",
    alignItems: "center",
  };

  const contentStyle: CSSProperties = {
    display: "inline",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  // === ЗАМЕНА КОДОВ ЭМОДЗИ НА <img> ===
  const renderTextWithEmotes = () => {
    // если эмодзи нет — просто текст
    if (!thirdPartyEmotes.length) {
      return <span style={contentStyle}>{text}</span>;
    }

    // строим карту: код → emote
    const map = new Map<string, (typeof thirdPartyEmotes)[number]["emote"]>();
    thirdPartyEmotes.forEach(({ code, emote }) => {
      map.set(code, emote);
    });

    // Регекс всех кодов в одно выражение: (OMEGALUL|KEKW|...),
    // \b чтобы не матчить части слов
    const pattern = Array.from(map.keys())
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const re = new RegExp(`\\b(${pattern})\\b`, "g");

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
      // текст до эмодзи
      if (match.index > lastIndex) {
        parts.push(
          <span key={`t-${lastIndex}`} style={contentStyle}>
            {text.slice(lastIndex, match.index)}
          </span>,
        );
      }

      const code = match[1];
      const emote = map.get(code);
      if (emote) {
        parts.push(
          <img
            key={`e-${match.index}`}
            src={emote.image}
            alt={code}
            title={code}
            style={{
              height: 30,
              verticalAlign: "middle",
              margin: "0 1px",
              imageRendering: emote.upscale ? "pixelated" : "auto",
            }}
          />,
        );
      } else {
        // на всякий случай — если в карте нет эмодзи
        parts.push(
          <span key={`t-${match.index}`} style={contentStyle}>
            {code}
          </span>,
        );
      }

      lastIndex = match.index + match[0].length;
    }

    // хвост строки
    if (lastIndex < text.length) {
      parts.push(
        <span key={`t-end`} style={contentStyle}>
          {text.slice(lastIndex)}
        </span>,
      );
    }

    return <>{parts}</>;
  };

  return (
    <div className="chat-line" style={lineStyle}>
      {/* бейджи */}
      {badges.map((b, i) => (
        <img
          key={i}
          src={b.url}
          alt={b.description}
          title={b.description}
          style={{
            height: 30,
            marginRight: 2,
            borderRadius: 2,
            verticalAlign: "middle",
          }}
        />
      ))}

      {/* ник */}
      <span
        style={{
          fontWeight: 700,
          color,
          marginRight: 6,
        }}
      >
        {displayName}
      </span>

      {/* bits */}
      {bits && cheer && (
        <span
          style={{
            color: cheer.color || "#9146FF",
            fontWeight: 600,
            marginRight: 4,
          }}
        >
          {bits}
        </span>
      )}

      {/* текст + эмодзи */}
      <span>{renderTextWithEmotes()}</span>
    </div>
  );
}
