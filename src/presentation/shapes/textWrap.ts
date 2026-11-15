export function wrapSvgLabel(text: string, maxWidthPx: number): string[] {
  const clean = text.trim() || 'Untitled';
  const approxCharWidth = 6.6;
  const maxChars = Math.max(8, Math.floor((maxWidthPx - 20) / approxCharWidth));
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}
