// "KSh 1,299" -> 1299
export function parsePrice(text) {
  if (text == null) return null;
  const match = String(text).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

// "-25%" -> 25
export function parseDiscount(text) {
  if (text == null) return null;
  const match = String(text).match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

// Prefer the star-bar width (0-100%), which maps to a 0-5 rating
export function parseRating(text, percent) {
  if (percent != null && !Number.isNaN(percent)) {
    return Math.round((percent / 20) * 10) / 10;
  }
  if (text) {
    const match = String(text).match(/(\d+(?:\.\d+)?)/);
    if (match && Number(match[1]) <= 5) return Number(match[1]);
  }
  return null;
}
