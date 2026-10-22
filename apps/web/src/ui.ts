/** Tiny DOM helpers; the HUD is HTML, the world is Pixi. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function slider(label: string, min: number, max: number, step: number, value: number, fmt: (v: number) => string, onChange: (v: number) => void) {
  const row = el('div', 'row');
  const lab = el('label', undefined, label);
  const input = el('input');
  input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value);
  const val = el('span', 'val', fmt(value));
  input.addEventListener('input', () => { const v = parseFloat(input.value); val.textContent = fmt(v); onChange(v); });
  row.append(lab, input, val);
  return { row, input, set(v: number) { input.value = String(v); val.textContent = fmt(v); } };
}

export function chips<T extends string>(options: { id: T; label: string; sub?: string }[], current: T, onPick: (id: T) => void) {
  const wrap = el('div', 'chips');
  const buttons = new Map<T, HTMLButtonElement>();
  for (const o of options) {
    const b = el('button', o.id === current ? 'active' : '', o.sub ? `${o.label} <span class="small">${o.sub}</span>` : o.label);
    b.addEventListener('click', () => { for (const x of buttons.values()) x.classList.remove('active'); b.classList.add('active'); onPick(o.id); });
    buttons.set(o.id, b);
    wrap.append(b);
  }
  return wrap;
}

export function button(label: string, cls: string, onClick: () => void) {
  const b = el('button', cls, label);
  b.addEventListener('click', onClick);
  return b;
}

export function fmtGold(n: number) { return `${Math.round(n).toLocaleString()} g`; }
