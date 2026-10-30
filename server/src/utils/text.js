export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Returns a positive integer id, or null when the input is not one
export function toId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export const CATEGORY_ICONS = [
  'Smartphone', 'Tv', 'Laptop', 'Refrigerator', 'Shirt', 'Armchair', 'HeartPulse',
  'Gamepad2', 'Package', 'Watch', 'Headphones', 'Sparkles', 'Dumbbell', 'Car',
  'Camera', 'Monitor', 'Sofa',
];
