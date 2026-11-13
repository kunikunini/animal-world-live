// 並べかえの画面（store.html?edit）。売り場・段・順番・並べる／しまう を変えて、store.json として書き出す。
// 変更はこのブラウザに下書きとして残る。本番の保存先につなぐまでは、書き出したファイルを差し替える。
const $ = s => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };

export function initEditor(store){
  const list = $('#ed-list'), state = $('#ed-state');
  $('#editor').hidden = false;

  const rows = () => store.data.products.flatMap(p => p.display.map(d => ({p, d})));
  const fixtureOf = id => store.data.fixtures.find(f => f.id === id);
  const sameSlot = (a, b) => a.fixture === b.fixture && (a.tier || 1) === (b.tier || 1);
  const slotRows = d => rows().filter(r => sameSlot(r.d, d)).sort((a, b) => (a.d.order || 0) - (b.d.order || 0));
  function renumber(){ // 売り場と段ごとに、順番を 1 から振り直す
    const seen = new Set();
    for (const r of rows()) {
      const key = r.d.fixture + '|' + (r.d.tier || 1);
      if (seen.has(key)) continue; seen.add(key);
      slotRows(r.d).forEach((x, i) => { x.d.order = i + 1; });
    }
  }
  async function commit(text){
    renumber();
    state.textContent = '反映しています…';
    await store.apply();
    render();
    const w = store.warnings();
    state.textContent = w.length ? w[0] : text;
  }

  function row({p, d}){
    const fx = fixtureOf(d.fixture), tiers = Math.max(1, fx?.tiers || 1);
    const peers = slotRows(d), at = peers.findIndex(r => r.d === d);
    const check = el('input', {type:'checkbox', checked:!d.off});
    check.addEventListener('change', () => { d.off = !check.checked || undefined; if (!d.off) delete d.off; commit(check.checked ? '並べました' : 'しまいました'); });

    const place = el('select', {ariaLabel:'売り場'});
    for (const f of store.data.fixtures) if (store.kindsOf(f.type).includes(d.kind)) place.append(el('option', {value:f.id, textContent:f.label, selected:f.id === d.fixture}));
    place.addEventListener('change', () => { d.fixture = place.value; d.tier = 1; d.order = 999; commit('売り場を変えました'); });

    const tier = el('select', {className:'tier', ariaLabel:'段', disabled:tiers < 2});
    for (let t = 1; t <= tiers; t++) tier.append(el('option', {value:String(t), textContent:fx?.type === 'table' ? `${t}列目` : `${t}段目`, selected:(d.tier || 1) === t}));
    tier.addEventListener('change', () => { d.tier = Number(tier.value); d.order = 999; commit('段を変えました'); });

    const move = step => () => { const other = peers[at + step]; if (!other) return; [d.order, other.d.order] = [other.d.order, d.order]; commit('順番を変えました'); };
    const up = el('button', {textContent:'←', ariaLabel:'左へ', disabled:at <= 0});
    const down = el('button', {textContent:'→', ariaLabel:'右へ', disabled:at < 0 || at >= peers.length - 1});
    up.addEventListener('click', move(-1)); down.addEventListener('click', move(1));

    return el('div', {className:'ed-row' + (d.off ? ' off' : '')},
      el('div', {className:'ed-name'}, el('span', {textContent:p.name}), el('label', {}, check, ' 並べる')),
      el('div', {className:'ed-fields'}, place, tier, up, down));
  }

  function render(){
    list.replaceChildren();
    for (const f of store.data.fixtures) {
      const mine = rows().filter(r => r.d.fixture === f.id).sort((a, b) => ((a.d.tier || 1) - (b.d.tier || 1)) || ((a.d.order || 0) - (b.d.order || 0)));
      list.append(el('p', {className:'ed-group', textContent:`${f.label}（${mine.filter(r => !r.d.off).length}点）`}));
      if (!mine.length) list.append(el('p', {className:'ed-group', textContent:'まだ商品がありません'}));
      mine.forEach(r => list.append(row(r)));
    }
  }

  $('#ed-export').addEventListener('click', () => {
    const a = el('a', {href:URL.createObjectURL(new Blob([JSON.stringify(store.data, null, 2) + '\n'], {type:'application/json'})), download:'store.json'});
    a.click(); URL.revokeObjectURL(a.href);
    state.textContent = 'store.json を書き出しました';
  });
  $('#ed-reset').addEventListener('click', async () => { state.textContent = '元に戻しています…'; await store.reset(); render(); state.textContent = '元の並びに戻しました'; });

  renumber(); render();
  const w = store.warnings();
  state.textContent = w.length ? w[0] : 'このブラウザに下書きとして残ります';
}
