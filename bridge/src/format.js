// Markdown -> WoW font-string markup, and markdown -> plain text for speech.

const GOLD = 'ffffd100';
const WHITE = 'ffffffff';
const CODE = 'ffa8c7fa';
const DIM = 'ff9d9d9d';

const color = (hex, s) => `|c${hex}${s}|r`;

// Characters agents use often that the game's fonts don't have (they show as
// empty boxes), with plain stand-ins. Arrows, check marks and crosses were seen as
// boxes in game; punctuation such as — … • · “ ” and math such as ≥ draw fine.
const GLYPHS = {
  '→': '->', '⟶': '->', '➜': '->', '➔': '->', '➡': '->',
  '←': '<-', '⟵': '<-', '⬅': '<-',
  '↔': '<->', '⟷': '<->',
  '⇒': '=>', '⟹': '=>', '⇐': '<=', '⇔': '<=>',
  '↑': '^', '⬆': '^', '↓': 'v', '⬇': 'v',
  '✓': 'OK', '✔': 'OK', '✅': 'OK', '✗': 'X', '✘': 'X', '❌': 'X',
  '⚠': '!', '️': '',
};
const GLYPH_RE = new RegExp(`[${Object.keys(GLYPHS).join('')}]`, 'gu');

// The game's fonts draw Latin-1 letters (â î é ü ...) but not Latin Extended ones:
// Romanian ă ș ț (and ş ţ), Czech ě ř, Polish ą ę ő ... show as boxes. Drop their
// accents instead (ă -> a, ș -> s). Letters with no decomposition (ł đ ı) get a
// plain stand-in.
const LATIN_EXT_RE = /[Ā-ɏḀ-ỿ]/gu;
const LATIN_EXT_PLAIN = { 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ı': 'i', 'ħ': 'h', 'Ħ': 'H', 'ŧ': 't', 'Ŧ': 'T', 'ŀ': 'l', 'Ŀ': 'L' };
const foldLatinExt = (c) => LATIN_EXT_PLAIN[c] ?? c.normalize('NFD').replace(/\p{M}/gu, '');

// WoW treats "|" as an escape character; double it so text can't inject markup.
// Also swaps in stand-ins for characters the game can't draw.
export function escapeWow(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/\|/g, '||')
    .replace(GLYPH_RE, (c) => GLYPHS[c])
    .replace(LATIN_EXT_RE, foldLatinExt);
}

function inline(line) {
  let s = escapeWow(line);
  // Inline code first so its contents aren't formatted further.
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[image: $1]');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text) => text);
  s = s.replace(/\*\*([^*]+)\*\*/g, (_, b) => color(WHITE, b));
  s = s.replace(/__([^_]+)__/g, (_, b) => color(WHITE, b));
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,!?:;]|$)/g, '$1$2');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => color(CODE, codes[Number(i)]));
  return s;
}

export function markdownToWow(md, { maxChars = 3500 } = {}) {
  let text = String(md ?? '').replace(/\r\n/g, '\n');
  let truncated = false;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    truncated = true;
  }
  const out = [];
  let inFence = false;
  for (const raw of text.split('\n')) {
    const fence = /^\s*```/.test(raw);
    if (fence) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(color(CODE, '  ' + escapeWow(raw)));
      continue;
    }
    let m;
    if ((m = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(raw))) {
      out.push(color(GOLD, inline(m[2])));
    } else if ((m = /^(\s*)[-*+]\s+(.*)$/.exec(raw))) {
      const depth = Math.min(3, Math.floor(m[1].length / 2));
      out.push('  '.repeat(depth) + color(GOLD, '•') + ' ' + inline(m[2]));
    } else if ((m = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(raw))) {
      const depth = Math.min(3, Math.floor(m[1].length / 2));
      out.push('  '.repeat(depth) + color(GOLD, m[2] + '.') + ' ' + inline(m[3]));
    } else if (/^\s*>\s?/.test(raw)) {
      out.push(color(DIM, inline(raw.replace(/^\s*>\s?/, ''))));
    } else if (/^\s*([-*_]\s*){3,}$/.test(raw)) {
      out.push(color(DIM, '—————'));
    } else if (/^\s*\|.*\|\s*$/.test(raw)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(raw)) continue; // table separator row
      out.push(inline(raw.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).join('  ·  ')));
    } else {
      out.push(inline(raw));
    }
  }
  let s = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (truncated) s += '\n' + color(DIM, '… (open the thread in T3 Code for the rest)');
  return s;
}

export function markdownToSpeech(md, { maxChars = 1500 } = {}) {
  let s = String(md ?? '')
    .replace(/```[\s\S]*?```/g, ' (code block) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~>|]/g, ' ')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
  if (s.length > maxChars) {
    const cut = s.lastIndexOf('. ', maxChars);
    s = s.slice(0, cut > maxChars / 2 ? cut + 1 : maxChars);
  }
  return s;
}

export function firstLine(md, max = 140) {
  const plain = markdownToSpeech(md, { maxChars: max * 3 }).split('\n').find((l) => l.trim()) || '';
  return plain.length > max ? plain.slice(0, max - 1) + '…' : plain;
}
