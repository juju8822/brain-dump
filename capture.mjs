export const types = ['Notes', 'Ideas', 'Checklists', 'Links'];
export function capture(text, title = '', selected = '') {
  const tags = [...new Set(Array.from(text.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu), match => match[1].toLowerCase()))];
  const body = text.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, '$1').trim();
  const lines = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const listPrefix = /^(?:list|checklist|todo|to-do|shopping list)\s*:/i;
  const marker = /^(?:(?:[-*•]|\d+[.)])\s+|\[[ xX]\]\s*)+/;
  const explicitList = listPrefix.test(body);
  const markedList = lines.filter(line => marker.test(line)).length >= 2;
  const candidate = body.match(/https?:\/\/[^\s<>"']+/i)?.[0].replace(/[.,;!?]+$/, '');
  let link;
  try {
    if (candidate) link = new URL(candidate).href;
  } catch {
    // Keep malformed URLs as plain text.
  }
  const type = types.includes(selected) ? selected : explicitList || markedList || lines.length > 1 && lines.every(line => line.length <= 65 && !/[.!?]$/.test(line)) ? 'Checklists' : link ? 'Links' : /^idea\s*:/i.test(body) ? 'Ideas' : 'Notes';
  let items = [];
  if (type === 'Checklists') {
    let content = explicitList ? body.replace(listPrefix, '').trim().split(/\r?\n/) : lines;
    if (markedList && !marker.test(content[0]) && !explicitList) title ||= content.shift().replace(/:$/, '');
    if (content.length === 1 && content[0].includes(',')) content = content[0].split(',');
    items = content.map(line => ({
      text: line.trim().replace(marker, '').trim(),
      done: /^(?:[-*]\s+)?\[x\]/i.test(line.trim())
    })).filter(item => item.text);
  }
  const name = title.trim() || (type === 'Checklists' ? tags.includes('groceries') ? 'Groceries' : 'Checklist' : (lines[0] || text).replace(/^idea\s*:\s*/i, '').slice(0, 80));
  return { title: name.slice(0, 120), body, type, tags, items, link, created: Date.now() };
}
