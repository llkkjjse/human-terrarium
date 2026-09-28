export function nextRandom(state: number): { state: number; value: number } {
  let next = state | 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  const unsigned = next >>> 0;
  return { state: unsigned || 0x9e3779b9, value: unsigned / 0x1_0000_0000 };
}

