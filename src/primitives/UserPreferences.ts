export type UserPreferences = {
  fontSizePx: number;
  fontFamily: string;
  fontWeight: number;
  chatboxAlign:
    | "top-start"
    | "top-center"
    | "top-end"
    | "middle-start"
    | "middle-center"
    | "middle-end"
    | "bottom-start"
    | "bottom-center"
    | "bottom-end";
  animateAppearance: boolean;
  animateDiscard: boolean;
  messageLifetime: number | never;
  messageColorHex: string;
  backgroundColorHex: string;
  useUserColors: boolean;
  showBots: boolean;
  hideCommands: boolean;
  showBadges: boolean;
};

export const DEFAULT_PREFS: UserPreferences = {
  fontSizePx: 16,
  fontFamily: "Arial",
  fontWeight: 400,
  chatboxAlign: "bottom-start",
  animateAppearance: true,
  animateDiscard: true,
  messageLifetime: 10000,
  messageColorHex: "#FFFFFF",
  backgroundColorHex: "#000000",
  useUserColors: false,
  showBots: true,
  hideCommands: false,
  showBadges: true,
} as const;

export function createPreferences(
  partial?: Partial<UserPreferences>,
): UserPreferences {
  return { ...DEFAULT_PREFS, ...partial };
}
