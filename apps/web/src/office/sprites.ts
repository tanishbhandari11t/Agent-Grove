export const CHAR_FRAME_W = 16;
export const CHAR_FRAME_H = 32;
export const CHAR_FRAMES_PER_ROW = 7;

/** Sheet rows: 0 = down, 1 = up, 2 = right (left is flipped right). */
export type Facing = "down" | "up" | "left" | "right";

export function facingFromDelta(dx: number, dy: number): Facing {
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

export function frameSource(facing: Facing, frame: number): {
  sx: number;
  sy: number;
  flip: boolean;
} {
  const f = ((frame % 4) + 4) % 4; // use first 4 walk frames
  const sx = f * CHAR_FRAME_W;
  if (facing === "down") return { sx, sy: 0, flip: false };
  if (facing === "up") return { sx, sy: CHAR_FRAME_H, flip: false };
  if (facing === "right") return { sx, sy: CHAR_FRAME_H * 2, flip: false };
  return { sx, sy: CHAR_FRAME_H * 2, flip: true };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}
