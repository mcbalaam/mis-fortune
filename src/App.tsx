import { useEffect, useState, useSyncExternalStore } from "react";
import ChatInstance from "./primitives/ChatInstance";
import { createPreferences } from "./primitives/UserPreferences";
import ChatLine from "./components/ChatLineSS13";
import type { ChatMessage } from "./primitives/ChatMessage";
import "./index.css";
import misFortuneLogo from "./mis-fortune.png";

function subscribeToHash(onHashChange: () => void) {
  window.addEventListener("hashchange", onHashChange);
  return () => window.removeEventListener("hashchange", onHashChange);
}

export function App() {
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash);
  return <ChatRoute key={hash} hash={hash} />;
}

function ChatRoute({ hash }: { hash: string }) {
  const [channel, hashQuery] = hash.replace(/^#\/?/, "").split("?", 2);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!channel) return;

    const searchParams = new URLSearchParams(window.location.search);
    new URLSearchParams(hashQuery).forEach((value, key) => {
      searchParams.set(key, value);
    });

    const prefs = createPreferences({
      fontSizePx: searchParams.get("fontSize")
        ? parseInt(searchParams.get("fontSize")!) || 16
        : undefined,
      fontFamily: searchParams.get("fontFamily") || undefined,
      fontWeight: searchParams.get("fontWeight")
        ? parseInt(searchParams.get("fontWeight")!) || 400
        : undefined,
      chatboxAlign: (searchParams.get("chatboxAlign") as any) || undefined,
      messageLifetime: searchParams.get("lifetime")
        ? parseInt(searchParams.get("lifetime")!)
        : undefined,
      messageColorHex: searchParams.get("color") || undefined,
      backgroundColorHex: searchParams.get("bg") || undefined,
      useUserColors: searchParams.get("usercolors") === "1",
      showBots: searchParams.get("bots") !== "0",
      hideCommands: searchParams.get("commands") === "1",
      showBadges: searchParams.get("badges") !== "0",
    });

    let isMounted = true;
    const instance = new ChatInstance(channel, prefs);
    const originalPush = instance.messages.push.bind(instance.messages);
    instance.messages.push = function (...args) {
      const result = originalPush(...args);
      if (isMounted) {
        setMessages(instance.messages.slice(-100));
      }
      return result;
    };
    instance
      .init()
      .then(() => {
        if (isMounted) {
          console.log("[m-f] init complete, starting socket...");
          instance.runSocketConnection();
        }
      })
      .catch((err) => {
        if (isMounted) console.error(err);
      });

    return () => {
      console.log("[m-f] destroying chat instance");
      isMounted = false;
      instance.destroy();
    };
  }, [channel, hashQuery]);

  if (!channel) {
    return (
      <div className="app settings-page" style={{ padding: "2rem" }}>
        <h1>
          &gt;&gt; mis-fortune 0.9{" "}
          <img
            src={misFortuneLogo}
            style={{
              height: "60px",
              borderRadius: "30px",
              transform: "translateY(20px)",
            }}
          ></img>
        </h1>
        <p>Browser client-side Twitch chat overlay with 7tv/fz support</p>
        <p>Usage: paste `/#/` followed by the username in the URL bar</p>
      </div>
    );
  }

  return (
    <div className="app chat-container">
      <div className="chat-messages">
        {messages.map((message, index) => (
          <ChatLine
            key={message.id || index}
            message={message}
          />
        ))}
      </div>
    </div>
  );
}

export default App;
