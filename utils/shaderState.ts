// Module-level mutable state shared between hand tracker and particle shader.
// Completely bypasses React — just a plain JS object that both sides read/write.
export const shaderState = {
  tension: 0.5,   // visual tension: 0 = contracted (fist), 1 = expanded (open)
  explosion: 0,   // 0-1 explosion intensity
};
