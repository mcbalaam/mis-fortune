export const BOTUSERNAMES = [
  "streamelements",
  "streamlabs",
  "nightbot",
  "moobot",
  "fossabot",
  "wizebot",
];

export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
