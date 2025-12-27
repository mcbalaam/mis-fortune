import { useEffect, useState } from "react";
import ChatInstance from "./primitives/ChatInstance";
import {
  UserPreferences,
  createPreferences,
} from "./primitives/UserPreferences";
import ChatLine from "./components/ChatLine";
import "./index.css";

export function App() {
  const [chatInstance, setChatInstance] = useState<ChatInstance | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // ✅ Парсим URL напрямую - НИКАКИХ window.CHAT_DATA!
    const url = new URL(window.location.href);
    const pathParts = url.pathname.slice(1).split("/").filter(Boolean);

    const channel = pathParts[0];

    // Парсим query параметры
    const prefs = createPreferences({
      fontSizePx: url.searchParams.get("fontSize")
        ? parseInt(url.searchParams.get("fontSize")!) || 16
        : undefined,
      fontFamily: url.searchParams.get("fontFamily") || undefined,
      fontWeight: url.searchParams.get("fontWeight")
        ? parseInt(url.searchParams.get("fontWeight")!) || 400
        : undefined,
      chatboxAlign: (url.searchParams.get("chatboxAlign") as any) || undefined,
      messageLifetime: url.searchParams.get("lifetime")
        ? parseInt(url.searchParams.get("lifetime")!)
        : undefined,
      messageColorHex: url.searchParams.get("color") || undefined,
      backgroundColorHex: url.searchParams.get("bg") || undefined,
      useUserColors: url.searchParams.get("usercolors") === "1",
      showBots: url.searchParams.get("bots") !== "0",
      hideCommands: url.searchParams.get("commands") === "1",
      showBadges: url.searchParams.get("badges") !== "0",
    });

    // Создаем чат
    const instance = new ChatInstance(channel, prefs);

    // Перехватываем сообщения
    const originalPush = instance.messages.push.bind(instance.messages);
    instance.messages.push = function (...args: any[]) {
      originalPush(...args);
      setMessages([...instance.messages.slice(-100)]);
      return args[0];
    };

    setChatInstance(instance);

    instance
      .init()
      .then(() => {
        console.log("[mf] init complete, starting socket...");
        instance.runSocketConnection();
      })
      .catch(console.error);
  }, []);

  if (!chatInstance) {
    return (
      <div className="app settings-page" style={{ padding: "2rem" }}>
        <h1>🎮 Twitch Chat Overlay</h1>
        <p>Примеры использования:</p>
        <div
          style={{
            fontFamily: "monospace",
            background: "#f0f0f0",
            padding: "1rem",
          }}
        >
          <div>/alfedov</div>
          <div>/xqc?color=00ff00&lifetime=5000</div>
          <div>/pokimane?fontSize=20&bots=0</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app chat-container">
      <div className="status">
        {isConnected ? "🟢 Online" : "🔴 Connecting..."}
      </div>
      <div className="chat-messages">
        {messages.map((message, index) => (
          <ChatLine
            key={message.id || index}
            message={message}
            emotes={chatInstance!.emotes} // ← передаем emotes из ChatInstance
          />
        ))}
      </div>
    </div>
  );
}

export default App;
