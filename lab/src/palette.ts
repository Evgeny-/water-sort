/** Liquid colours (sRGB). The first 8 are the most distinct and are used first. */
export const PALETTE: { name: string; hex: number }[] = [
  { name: "red", hex: 0xe8384f },
  { name: "blue", hex: 0x2d72f5 },
  { name: "green", hex: 0x27b44f },
  { name: "yellow", hex: 0xffcc1c },
  { name: "purple", hex: 0x9147f0 },
  { name: "orange", hex: 0xff7e21 },
  { name: "teal", hex: 0x12b7a9 },
  { name: "pink", hex: 0xff67b8 },
  { name: "lime", hex: 0xa3e22f },
  { name: "brown", hex: 0x8d5836 },
  { name: "sky", hex: 0x72d2ff },
  { name: "milk", hex: 0xefeff4 },
];

export function css(color: number): string {
  return "#" + PALETTE[color]!.hex.toString(16).padStart(6, "0");
}
