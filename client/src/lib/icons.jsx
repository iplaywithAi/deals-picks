import {
  Armchair, Camera, Car, Dumbbell, Gamepad2, Headphones, HeartPulse, Laptop, Monitor, Package,
  Refrigerator, Shirt, Smartphone, Sofa, Sparkles, Tv, Watch,
} from 'lucide-react';

export const ICON_MAP = {
  Armchair, Camera, Car, Dumbbell, Gamepad2, Headphones, HeartPulse, Laptop, Monitor, Package,
  Refrigerator, Shirt, Smartphone, Sofa, Sparkles, Tv, Watch,
};

export function CategoryIcon({ name, className = 'h-5 w-5' }) {
  const Icon = ICON_MAP[name] || Package;
  return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />;
}
