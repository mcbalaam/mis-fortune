# <img style="border-radius: 25px; height: 50px; margin-bottom: -15px;" src="./src/mis-fortune.png"> mis-fortune

A small SS13-style Twitch chat overlay utility inspired by [jChat](https://github.com/giambaJ/jChat) by [giambaJ](https://github.com/giambaJ), made with Bun and React.

<img width="746" height="299" alt="image" src="https://github.com/user-attachments/assets/69cd76f3-d825-4f17-afbb-8b78f007e4be" />

### To use in browser:

Navigate to http://mis.mcblm.xyz/#/your-channel-name-here. That's it!

### Proxy mode

Append `/#/proxy` after the username (`/#/your-channel-name-here/#/proxy`). This routes badge and emote metadata through an external proxy server. Requests do not fall back to direct mode if the proxy is unavailable. Set `MISFORTUNE_PROXY_URL` to use the proxy when running the image.

### Docker runtime

The production image uses Bun distroless and runs as UID/GID `65532`. It has no shell or package manager; use `docker logs` for diagnostics.

### To tinker or run locally:

```bash
bun install
bun run dev
```

This project was created using `bun init` in bun v1.3.3. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
