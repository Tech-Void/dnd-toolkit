import { createNoise2D } from "simplex-noise";
import { createRng } from "@dnd-toolkit/core";

type RGB = [number, number, number];

export interface StoneStyle {
  dark: RGB;
  light: RGB;
  /** 0..1: how strongly cracks show. */
  veins: number;
  /** Feature size in grid cells (bigger = broader patches). */
  scale: number;
}

export const ROCK_STYLE: StoneStyle = { dark: [30, 27, 24], light: [62, 56, 50], veins: 0.6, scale: 1.3 };
export const CAVE_FLOOR_STYLE: StoneStyle = { dark: [112, 99, 82], light: [158, 144, 122], veins: 0.25, scale: 1.6 };

/**
 * Fractal-noise stone for a map `widthCells` × `heightCells`, `detail` texels per cell. Paint it
 * stretched over the map; at 16 texels per cell it stays fast even for big scenes.
 */
export function stoneTexture(widthCells: number, heightCells: number, seed: string, style: StoneStyle, detail = 16): HTMLCanvasElement {
  const rng = createRng(seed);
  const noise = createNoise2D(() => rng.next());
  const veinNoise = createNoise2D(() => rng.next());
  const w = Math.ceil(widthCells * detail);
  const h = Math.ceil(heightCells * detail);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const { dark, light, veins, scale } = style;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const u = px / detail / scale;
      const v = py / detail / scale;
      // Four octaves of mottling...
      let t = 0;
      let amp = 0.5;
      let f = 1;
      for (let o = 0; o < 4; o++) {
        t += noise(u * f, v * f) * amp;
        amp *= 0.5;
        f *= 2.1;
      }
      t = Math.max(0, Math.min(1, t * 0.9 + 0.5));
      // ...cut by thin dark cracks where a ridged noise field crosses zero.
      const ridge = 1 - Math.abs(veinNoise(u * 0.9, v * 0.9));
      const crack = Math.pow(Math.max(0, ridge - 0.9) / 0.1, 3) * veins;
      t = t * (1 - crack * 0.85);
      const i = (py * w + px) * 4;
      img.data[i] = dark[0] + (light[0] - dark[0]) * t;
      img.data[i + 1] = dark[1] + (light[1] - dark[1]) * t;
      img.data[i + 2] = dark[2] + (light[2] - dark[2]) * t;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
