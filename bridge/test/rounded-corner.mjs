// What a desktop that rounds every window's corners does to the game's top-left
// corner: outside a quarter circle of `radius` the window is gone (black), and a 1 px
// grey border runs along the top row, around the curve and down the left column, each
// blended over the pixels its edges cross. Windows 11 rounds by 8 px at 100 percent
// scaling and by more as it scales up.

const BORDER = [110, 110, 110];
const SUB = 4; // subsamples per axis

/**
 * Masks `img` (RGB, as codec.js reads it) in place and returns it.
 * @param {{ width: number, height: number, data: Buffer }} img
 * @param {number} radius  in physical pixels
 */
export function roundCorner(img, radius) {
  const inWindow = (x, y) => x >= radius || y >= radius || (x - radius) ** 2 + (y - radius) ** 2 <= radius ** 2;
  const inContent = (x, y) => x >= 1 && y >= 1 && (x >= radius || y >= radius || (x - radius) ** 2 + (y - radius) ** 2 <= (radius - 1) ** 2);
  const reach = Math.ceil(radius) + 2;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (x >= reach && y >= reach) continue;
      let window = 0;
      let content = 0;
      for (let j = 0; j < SUB; j++) {
        for (let i = 0; i < SUB; i++) {
          const sx = x + (i + 0.5) / SUB;
          const sy = y + (j + 0.5) / SUB;
          if (inWindow(sx, sy)) window++;
          if (inContent(sx, sy)) content++;
        }
      }
      const p = (y * img.width + x) * 3;
      for (let c = 0; c < 3; c++) img.data[p + c] = Math.round((img.data[p + c] * content + BORDER[c] * (window - content)) / (SUB * SUB));
    }
  }
  return img;
}
