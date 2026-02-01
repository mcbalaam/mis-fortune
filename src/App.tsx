import { useEffect, useState } from "react";
import ChatInstance from "./primitives/ChatInstance";
import { createPreferences } from "./primitives/UserPreferences";
import type { UserPreferences } from "./primitives/UserPreferences";
import ChatLine from "./components/ChatLine";
import "./index.css";
import misFortuneLogo from "./mis-fortune.png";

export function App() {
  const [chatInstance, setChatInstance] = useState<ChatInstance | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const rawHash = window.location.hash.replace(/^#\/?/, "");
    if (!rawHash) return;

    const channel = rawHash.split(/[?]/)[0];
    if (!channel) return;

    const urlObj = new URL(window.location.href);
    const searchParams = urlObj.searchParams;

    if (rawHash.includes("?")) {
      const hashQuery = rawHash.split("?")[1];
      const hashParams = new URLSearchParams(hashQuery);
      hashParams.forEach((val, key) => {
        searchParams.set(key, val);
      });
    }

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
    instance.messages.push = function (...args: any[]) {
      const result = originalPush(...args);
      if (isMounted) {
        setMessages([...instance.messages.slice(-100)]);
      }
      return result;
    };
    setChatInstance(instance);
    instance
      .init()
      .then(() => {
        if (isMounted) {
          console.log("[m-f] init complete, starting socket...");
          instance.runSocketConnection();
          setIsConnected(true);
        }
      })
      .catch((err) => {
        if (isMounted) console.error(err);
      });

    return () => {
      console.log("[m-f] destroying chat instance");
      isMounted = false;
      instance.destroy();
      setChatInstance(null);
      setIsConnected(false);
    };
  }, []);

  if (!chatInstance) {
    return (
      <div className="app settings-page" style={{ padding: "2rem" }}>
        <h1>
          &gt;&gt; mis-fortune 0.7{" "}
          <img
            src={misFortuneLogo}
            style={{
              height: "60px",
              borderRadius: "30px",
              transform: "translateY(20px)",
            }}
          ></img>
        </h1>
        <p>Браузерный оверлей чата для Twitch с поддержкой 7tv эмоутов</p>
        <p>Использование: введите никнейм нужного канала в адресную строку</p>
        <div
          style={{
            fontFamily: "monospace",
            background: "#f0f0f0",
            padding: "1rem",
            width: "fit-content",
          }}
        >
          <a href="/#/livrah">/#/livrah</a>
        </div>
        <p>Полноценная поддержка параметров запроса будет добавлена позже</p>
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
