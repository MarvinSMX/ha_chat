export function chunkText(
  text: string,
  chunkSize = 3600,
  overlap = 480,
): Array<{ text: string; index: number }> {
  const out: Array<{ text: string; index: number }> = [];
  if (!text || !text.trim()) return out;
  let start = 0;
  let idx = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    let sliceText = text.slice(start, end);
    if (end < text.length) {
      const lastSpace = sliceText.lastIndexOf(' ');
      if (lastSpace > chunkSize / 2) {
        end = start + lastSpace + 1;
        sliceText = text.slice(start, end);
      }
    }
    if (sliceText.trim()) {
      out.push({ text: sliceText.trim(), index: idx });
      idx++;
    }
    start = end - overlap;
    if (start >= text.length) break;
  }
  return out;
}

export function makeDocId(metadata: Record<string, unknown>): string {
  const pageId = metadata.pageId ?? metadata.page_id;
  const chunkIdx = metadata.chunkIndex ?? metadata.chunk_index;
  if (pageId != null && chunkIdx != null) {
    return `${pageId}_${chunkIdx}`;
  }
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(String(metadata.content ?? '')).digest('hex').slice(0, 32);
}
