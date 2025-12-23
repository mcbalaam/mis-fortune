class Emote {
  id: string;
  image: string;
  upscale?: boolean;
  zeroWidth?: boolean;

  constructor(data: {
    id: string;
    image: string;
    upscale?: boolean;
    zeroWidth?: boolean;
  }) {
    this.id = data.id;
    this.image = data.image;
    this.upscale = data.upscale;
    this.zeroWidth = data.zeroWidth;
  }
}

export interface EmoteReplacement {
  code: string;
  emote: Emote;
}

export default Emote;
