const TIME_ZONE = 'Africa/Nairobi';

export function formatKES(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `KSh ${Math.round(Number(value)).toLocaleString('en-KE')}`;
}

// The server stores UTC timestamps as "YYYY-MM-DD HH:MM:SS"
export function parseServerDate(iso) {
  if (!iso) return null;
  return new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
}

export function formatDateTime(iso) {
  const date = parseServerDate(iso);
  if (!date) return '—';
  return date.toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  });
}

export function formatShortDate(iso) {
  const date = parseServerDate(iso);
  if (!date) return '';
  return date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', timeZone: TIME_ZONE });
}

export function timeAgo(iso) {
  const date = parseServerDate(iso);
  if (!date) return 'Never';
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

const SOURCE_LABELS = { jumia: 'Jumia', kilimall: 'Kilimall', sample: 'Sample data' };
export const sourceLabel = (key) => SOURCE_LABELS[key] || key;

export const plural = (n, word) => `${Number(n).toLocaleString('en-KE')} ${word}${n === 1 ? '' : 's'}`;
