/**
 * HTML (OneNote-Seiteninhalt) in reinen Text umwandeln.
 */
export function htmlToText(html: string): string {
  if (!html || typeof html !== 'string') return '';
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\s+/g, ' ');
  return text.trim();
}
