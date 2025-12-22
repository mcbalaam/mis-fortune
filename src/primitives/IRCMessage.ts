interface IRCMessage {
  raw: string;
  tags: Record<string, string | true>;
  prefix: string | null;
  command: string | null;
  params: string[];
}

function parseIRC(data: string): IRCMessage | null {
  const message: IRCMessage = {
    raw: data,
    tags: {},
    prefix: null,
    command: null,
    params: [],
  };

  let position = 0;
  let nextspace = 0;

  if (data.charCodeAt(0) === 64) {
    nextspace = data.indexOf(" ");

    if (nextspace === -1) {
      return null;
    }

    const rawTags = data.slice(1, nextspace).split(";");

    for (let i = 0; i < rawTags.length; i++) {
      const tag = rawTags[i];
      if (!tag) continue;
      const pair = tag.split("=");
      message.tags[pair[0]!] = pair[1] ?? true;
    }

    position = nextspace + 1;
  }

  while (data.charCodeAt(position) === 32) {
    position++;
  }

  if (data.charCodeAt(position) === 58) {
    // ':'
    nextspace = data.indexOf(" ", position);

    if (nextspace === -1) {
      return null;
    }

    message.prefix = data.slice(position + 1, nextspace);
    position = nextspace + 1;

    while (data.charCodeAt(position) === 32) {
      position++;
    }
  }

  nextspace = data.indexOf(" ", position);

  if (nextspace === -1) {
    if (data.length > position) {
      message.command = data.slice(position);
      return message;
    }
    return null;
  }

  message.command = data.slice(position, nextspace);
  position = nextspace + 1;

  while (data.charCodeAt(position) === 32) {
    position++;
  }

  while (position < data.length) {
    nextspace = data.indexOf(" ", position);

    if (data.charCodeAt(position) === 58) {
      message.params.push(data.slice(position + 1));
      break;
    }

    if (nextspace !== -1) {
      message.params.push(data.slice(position, nextspace));
      position = nextspace + 1;

      while (data.charCodeAt(position) === 32) {
        position++;
      }
      continue;
    }

    if (nextspace === -1) {
      message.params.push(data.slice(position));
      break;
    }
  }

  return message;
}

(window as any).parseIRC = parseIRC;

export default parseIRC;
