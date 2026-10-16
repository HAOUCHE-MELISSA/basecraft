'use strict';
/* ================= CONVERSION ENGINE (no DOM access) ================= */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_INPUT = 500;
const SUB = '₀₁₂₃₄₅₆₇₈₉', SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sub = n => String(n).replace(/\d/g, d => SUB[d]);
const sup = n => String(n).replace(/\d/g, d => SUP[d]);

const Engine = {
  checkBase(b) {
    if (!Number.isInteger(b) || b < 2 || b > 36) throw new Error('Base must be a whole number from 2 to 36.');
  },
  /* Parse text in `base` into an exact rational: value = sign * num / den (den = base^fractionLength). */
  parse(text, base) {
    this.checkBase(base);
    let s = text.trim(), neg = false;
    if (!s) throw new Error('Enter a number to convert.');
    if (s.length > MAX_INPUT) throw new Error(`Input too long (max ${MAX_INPUT} characters).`);
    if (s[0] === '-' || s[0] === '+') { neg = s[0] === '-'; s = s.slice(1); }
    if ((s.match(/\./g) || []).length > 1) throw new Error('Multiple decimal points are not allowed.');
    if (s === '' || s === '.') throw new Error('Enter at least one digit.');
    const [ip, fp = ''] = s.split('.');
    const B = BigInt(base);
    let num = 0n;
    for (const ch of ip + fp) {
      const v = DIGITS.indexOf(ch.toUpperCase());
      if (v < 0) throw new Error(`Invalid character: "${ch}" is not a digit.`);
      if (v >= base) throw new Error(`Invalid digit: ${ch.toUpperCase()} is not allowed in base ${base}.`);
      num = num * B + BigInt(v);
    }
    return { neg, num, den: B ** BigInt(fp.length), ip: ip.toUpperCase(), fp: fp.toUpperCase() };
  },
  /* Integer -> digit string by repeated division; records steps. */
  intToBase(n, base, steps) {
    if (n === 0n) return '0';
    const B = BigInt(base); let out = '';
    while (n > 0n) {
      const r = n % B, q = n / B;
      if (steps && steps.length < 40) steps.push(`${n} ÷ ${base} = ${q} remainder ${r}${r > 9n ? ' (' + DIGITS[Number(r)] + ')' : ''}`);
      out = DIGITS[Number(r)] + out; n = q;
    }
    return out;
  },
  /* Full conversion. Fraction: repeated multiplication of exact remainder/den until 0 or limit. */
  convert(text, from, to, maxFrac, wantSteps = true) {
    this.checkBase(to);
    const p = this.parse(text, from);
    const intPart = p.num / p.den;
    let rem = p.num % p.den;
    const T = BigInt(to), steps = [];
    const ip = this.intToBase(intPart, to, wantSteps ? steps : null);
    const fsteps = [];
    let frac = '', digitsCount = 0;
    while (rem !== 0n && digitsCount < maxFrac) {
      rem *= T;
      const d = rem / p.den; rem %= p.den;
      if (wantSteps && fsteps.length < 30) fsteps.push(`× ${to} → digit ${DIGITS[Number(d)]}`);
      frac += DIGITS[Number(d)]; digitsCount++;
    }
    const exact = rem === 0n;
    const isZero = p.num === 0n || (intPart === 0n && frac.replace(/0/g, '') === '' && exact);
    const sign = p.neg && !isZero ? '-' : '';
    const text_ = sign + ip + (frac ? '.' + frac : '');
    return { text: text_, exact, negative: !!sign, parsed: p, intPart, ipStr: ip, frac, steps, fsteps };
  }
};

/* ================= EXPLANATION BUILDER ================= */
function explain(r, from, to, maxFrac) {
  const p = r.parsed, L = [];
  const src = `${p.ip || '0'}${p.fp ? '.' + p.fp : ''}`;
  L.push(`Input: ${r.negative ? '-' : ''}${src}${sub(from)} → base ${to}`);
  if (from === to) { L.push('Same base: the value is unchanged (formatted in uppercase, leading zeros removed).'); return L.join('\n'); }
  if (from !== 10) {
    const ds = p.ip.split(''), terms = ds.map((d, i) => `${d}×${from}${sup(ds.length - 1 - i)}`);
    const vals = ds.map((d, i) => DIGITS.indexOf(d) + '×' + from + sup(ds.length - 1 - i));
    L.push('\n1) Positional notation (integer part):');
    L.push(ds.length > 12 ? `   ${terms.slice(0, 6).join(' + ')} + … + ${terms.slice(-2).join(' + ')}` : `   ${p.ip}${sub(from)} = ${terms.join(' + ')}`);
    if (ds.length <= 12 && ds.some(d => DIGITS.indexOf(d) > 9)) L.push(`   = ${vals.join(' + ')}`);
    L.push(`   = ${r.intPart}${sub(10)}`);
    if (p.fp) L.push(`   Fractional digits ${p.fp} each weighted by ${from}⁻¹, ${from}⁻², … (exact fraction ${p.num % p.den}/${p.den} of 1).`);
    L.push(`   Exact value = ${p.num}/${p.den}${sub(10)}`);
  }
  if (to !== 10) {
    L.push(`\n${from !== 10 ? '2' : '1'}) Repeated division of the integer part by ${to}:`);
    L.push(r.intPart === 0n ? '   0 → digit 0' : r.steps.map(s => '   ' + s).join('\n'));
    L.push(`   Read remainders bottom-to-top: ${r.ipStr}${sub(to)}`);
    if (p.num % p.den !== 0n) {
      L.push(`\nFractional part: repeated multiplication by ${to}, taking the integer digit each time:`);
      L.push(r.fsteps.map(s => '   ' + s).join('\n') || '   —');
      L.push(r.exact ? `   Fraction terminated: .${r.frac}` : `   Stopped after ${maxFrac} digits; expansion does not end here, so the result is truncated (≈).`);
    }
  } else {
    L.push(`\nTarget is decimal: the value above is the result${r.exact ? '' : ' (truncated at ' + maxFrac + ' digits)'}.`);
  }
  if (r.negative) L.push('\nSign: converted |value| and re-applied the minus sign (not two\'s complement).');
  return L.join('\n');
}

/* ================= UI ================= */
const $ = id => document.getElementById(id);
const PRESETS = [['Binary — Base 2', '2'], ['Octal — Base 8', '8'], ['Decimal — Base 10', '10'], ['Hexadecimal — Base 16', '16'], ['Custom base…', 'custom']];
const SHORTS = [['Bin→Dec', 2, 10], ['Dec→Bin', 10, 2], ['Dec→Hex', 10, 16], ['Hex→Dec', 16, 10], ['Dec→Oct', 10, 8], ['Oct→Dec', 8, 10], ['Bin→Hex', 2, 16], ['Hex→Bin', 16, 2]];
const EXAMPLES = [['255 → hex', '255', 10, 16], ['1011₂ → dec', '1011', 2, 10], ['10.625 → bin', '10.625', 10, 2], ['0.1 → bin (repeating)', '0.1', 10, 2], ['-25 → bin', '-25', 10, 2], ['Z₃₆ → dec', 'Z', 36, 10]];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
};
let last = null, timer = null, history = store.get('bc_history', []);
if (!Array.isArray(history)) history = [];

function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
function fillSel(sel) { PRESETS.forEach(([t, v]) => { const o = el('option', '', t); o.value = v; sel.appendChild(o); }); }
fillSel($('srcSel')); fillSel($('tgtSel'));

function setBase(which, b) {
  const sel = $(which + 'Sel'), cust = $(which + 'Custom');
  if ([2, 8, 10, 16].includes(b)) { sel.value = String(b); cust.hidden = true; }
  else { sel.value = 'custom'; cust.hidden = false; cust.value = b; }
}
function getBase(which) {
  const sel = $(which + 'Sel');
  return sel.value === 'custom' ? Number($(which + 'Custom').value.trim() === '' ? NaN : $(which + 'Custom').value) : Number(sel.value);
}
function setPrefs() { store.set('bc_prefs', { s: getBase('src'), t: getBase('tgt'), p: $('precSel').value }); }
function showErr(id, msg) { $(id).textContent = msg || ''; if (id === 'inErr') { $('numInput').classList.toggle('bad', !!msg); $('numInput').setAttribute('aria-invalid', !!msg); } }
function updateHint() {
  const b = getBase('src');
  $('digitHint').textContent = Number.isInteger(b) && b >= 2 && b <= 36 ? `Base ${b} digits: ${DIGITS.slice(0, b)}  (optional "." and leading "-")` : '';
}

/* Run a conversion. record=true adds to history. */
function run(record) {
  clearTimeout(timer);
  const text = $('numInput').value, from = getBase('src'), to = getBase('tgt'), maxFrac = Number($('precSel').value);
  showErr('baseErr', ''); showErr('inErr', ''); updateHint();
  if (text.trim() === '') { hideResult(); return null; }
  try {
    Engine.checkBase(from); Engine.checkBase(to);
  } catch (e) { showErr('baseErr', e.message); hideResult(); return null; }
  try {
    const r = Engine.convert(text, from, to, maxFrac);
    last = { r, from, to, input: text.trim() };
    renderResult(r, from, to, maxFrac);
    if (record) addHistory(text.trim(), from, r.text, to);
    return r;
  } catch (e) { showErr('inErr', e.message); hideResult(); return null; }
}
function hideResult() { $('resultCard').hidden = true; last = null; }

function renderResult(r, from, to, maxFrac) {
  $('resultCard').hidden = false; $('resultCard').classList.remove('stale'); $('staleTag').hidden = true;
  $('resultText').textContent = (r.exact ? '' : '≈ ') + r.text + (r.exact ? '' : '…');
  $('resBase').textContent = `Base ${to}`;
  $('approxTag').hidden = r.exact;
  $('signNote').hidden = !r.negative;
  $('stepsBody').textContent = explain(r, from, to, maxFrac);
  const cmp = $('compare'); cmp.replaceChildren();
  [['Binary', 2], ['Octal', 8], ['Decimal', 10], ['Hexadecimal', 16]].forEach(([n, b]) => {
    const x = Engine.convert($('numInput').value, from, b, maxFrac, false);
    const d = el('div'); d.append(el('dt', '', `${n} (base ${b})`), el('dd', '', (x.exact ? '' : '≈ ') + x.text + (x.exact ? '' : '…')));
    cmp.appendChild(d);
  });
}

/* ---- History ---- */
function addHistory(i, sb, r, tb) {
  if (history[0] && history[0].i === i && history[0].sb === sb && history[0].tb === tb) history.shift();
  history.unshift({ i, sb, r, tb, t: Date.now() });
  history = history.slice(0, 50); store.set('bc_history', history); renderHistory();
}
function ago(t) {
  const s = Math.floor((Date.now() - t) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : Math.floor(s / 86400) + ' d ago';
}
function renderHistory() {
  const ul = $('history'); ul.replaceChildren();
  if (!history.length) { ul.appendChild(el('li', 'hint', 'No conversions yet.')); return; }
  history.forEach((h, idx) => {
    const li = el('li'), load = el('button', 'load', `${h.i} (Base ${h.sb}) → ${h.r} (Base ${h.tb})`);
    load.appendChild(el('small', '', ago(h.t)));
    load.title = 'Restore this conversion';
    load.onclick = () => { $('numInput').value = h.i; setBase('src', h.sb); setBase('tgt', h.tb); setPrefs(); run(false); };
    const cp = el('button', 'btn small', 'Copy'); cp.setAttribute('aria-label', 'Copy result ' + h.r); cp.onclick = () => copyText(h.r, cp);
    const del = el('button', 'btn small ghost', '✕'); del.setAttribute('aria-label', 'Delete history entry'); del.onclick = () => { history.splice(idx, 1); store.set('bc_history', history); renderHistory(); };
    li.append(load, cp, del); ul.appendChild(li);
  });
}
$('clearHist').onclick = () => { if (history.length && confirm('Clear all conversion history?')) { history = []; store.set('bc_history', history); renderHistory(); } };

/* ---- Copy ---- */
async function copyText(text, btn) {
  const orig = btn ? btn.textContent : '';
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = el('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ } ta.remove();
    if (!ok) { if (btn) btn.textContent = 'Copy failed'; setTimeout(() => btn && (btn.textContent = orig), 1500); return; }
  }
  if (btn) { btn.textContent = 'Copied!'; setTimeout(() => (btn.textContent = orig), 1200); }
}
const copyResult = () => last && copyText(last.r.text, $('copyBtn'));
$('copyBtn').onclick = copyResult;

/* ---- Inputs ---- */
function scheduleAuto() {
  if (last) { $('resultCard').classList.add('stale'); $('staleTag').hidden = false; }
  clearTimeout(timer); timer = setTimeout(() => run(false), 350);
}
$('numInput').addEventListener('input', () => { if ($('numInput').value.trim() === '') { showErr('inErr', ''); hideResult(); } else scheduleAuto(); });
['src', 'tgt'].forEach(w => {
  $(w + 'Sel').addEventListener('change', () => { $(w + 'Custom').hidden = $(w + 'Sel').value !== 'custom'; setPrefs(); updateHint(); scheduleAuto(); });
  $(w + 'Custom').addEventListener('input', () => { setPrefs(); scheduleAuto(); });
});
$('precSel').onchange = () => { setPrefs(); scheduleAuto(); };
$('convertBtn').onclick = () => { if ($('numInput').value.trim() === '') showErr('inErr', 'Enter a number to convert.'); else run(true); };
$('numInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('convertBtn').click(); } });
$('clearBtn').onclick = () => { $('numInput').value = ''; showErr('inErr', ''); hideResult(); $('numInput').focus(); };
$('resetBtn').onclick = () => { setBase('src', 10); setBase('tgt', 2); $('precSel').value = '20'; setPrefs(); updateHint(); scheduleAuto(); };
$('swapBtn').onclick = () => {
  const s = getBase('src'), t = getBase('tgt'), prev = last;
  setBase('src', t); setBase('tgt', s);
  $('swapBtn').classList.toggle('spin');
  if (prev && prev.r.exact) $('numInput').value = prev.r.text; // reuse exact result as new input
  setPrefs(); run(!!prev);
};
SHORTS.forEach(([n, s, t]) => { const b = el('button', 'btn', n); b.onclick = () => { setBase('src', s); setBase('tgt', t); setPrefs(); updateHint(); if ($('numInput').value.trim()) run(false); }; $('shortcuts').appendChild(b); });
EXAMPLES.forEach(([n, v, s, t]) => { const b = el('button', 'btn', n); b.onclick = () => { $('numInput').value = v; setBase('src', s); setBase('tgt', t); setPrefs(); run(false); }; $('examples').appendChild(b); });

/* ---- Theme, help, keyboard ---- */
function applyTheme(t) { document.documentElement.dataset.theme = t; store.set('bc_theme', t); }
$('themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
$('helpBtn').onclick = () => $('helpDlg').showModal();
$('closeHelp').onclick = () => $('helpDlg').close();
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey && $('panel').contains(document.activeElement)) { e.preventDefault(); $('convertBtn').click(); }
  if (e.key.toLowerCase() === 'c' && e.shiftKey && (e.ctrlKey || e.metaKey) && last && !String(window.getSelection())) { e.preventDefault(); copyResult(); }
});

/* ---- Init ---- */
applyTheme(store.get('bc_theme', 'dark') === 'light' ? 'light' : 'dark');
const prefs = store.get('bc_prefs', { s: 10, t: 2, p: '20' });
setBase('src', Number.isInteger(prefs.s) ? prefs.s : 10); setBase('tgt', Number.isInteger(prefs.t) ? prefs.t : 2);
if (['5', '10', '20', '50'].includes(String(prefs.p))) $('precSel').value = String(prefs.p);
updateHint(); renderHistory();

/* Self-test (visible in console): known cases from the spec. */
(function selfTest() {
  const T = [['10', 10, 2, '1010'], ['1010', 2, 10, '10'], ['255', 10, 16, 'FF'], ['FF', 16, 10, '255'], ['63', 10, 8, '77'], ['A5', 16, 2, '10100101'],
    ['Z', 36, 10, '35'], ['0', 10, 2, '0'], ['-25', 10, 2, '-11001'], ['10.625', 10, 2, '1010.101'], ['0.5', 10, 2, '0.1'], ['A.F', 16, 10, '10.9375'],
    ['123456789012345678901234567890', 10, 16, '18EE90FF6C373E0EE4E3F0AD2']];
  const bad = T.filter(([i, f, t, e]) => { try { return Engine.convert(i, f, t, 20, false).text !== e; } catch { return true; } });
  console[bad.length ? 'error' : 'log'](bad.length ? 'BASECRAFT self-test FAILED:' : 'BASECRAFT self-test passed', bad);
})();
