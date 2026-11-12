export const AVATAR_COLORS = [
  ['#f97316', '#9a3412'],
  ['#06b6d4', '#155e75'],
  ['#a855f7', '#581c87'],
  ['#22c55e', '#14532d'],
  ['#ef4444', '#7f1d1d'],
  ['#eab308', '#713f12'],
  ['#3b82f6', '#1e3a8a'],
  ['#ec4899', '#831843'],
  ['#14b8a6', '#134e4a'],
  ['#f43f5e', '#881337'],
  ['#8b5cf6', '#3b0764'],
  ['#84cc16', '#365314'],
];

export const initials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return s.toUpperCase();
};
