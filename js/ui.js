/* ============================================================================
 * CyberClash: Red vs Blue  —  ui.js
 * Render DOM, interaksi pemain, orkestrasi giliran AI.
 * ==========================================================================*/

'use strict';

let G = null;               // state game aktif
let pendingAction = null;   // aksi menunggu pilih target {side, actId}
let aiBusy = false;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------------------------- Menu ---*/
function startGame(humanSide, difficulty) {
  const aiSide = humanSide === 'blue' ? 'red' : 'blue';
  G = createGame({ humanSide, aiSide, difficulty });
  G.phase = 'playing';
  pendingAction = null;
  $('#menu').classList.add('hidden');
  $('#game').classList.remove('hidden');
  logEvent(G, humanSide, `Game dimulai. Anda bermain sebagai ${humanSide === 'blue' ? 'BLUE (Defender)' : 'RED (Attacker)'} — tingkat ${difficulty.toUpperCase()}.`);
  render();
  // bila giliran pertama milik AI (jika human = red, blue mulai → AI)
  maybeRunAI();
}

/* ------------------------------------------------------------- Render ---*/
function render() {
  if (!G) return;
  renderTopBar();
  renderMeters();
  renderNetwork();
  renderActions();
  renderLog();
  renderBanner();
}

function renderTopBar() {
  $('#roundInfo').textContent = `Ronde ${G.round} / ${G.maxRounds}`;
  const t = $('#turnInfo');
  const isHuman = G.turn === G.humanSide;
  t.textContent = `Giliran: ${G.turn.toUpperCase()}${isHuman ? ' (Anda)' : ' (AI)'}`;
  t.className = 'turn-badge ' + G.turn;
  $('#endTurnBtn').disabled = !(G.phase === 'playing' && isHuman);
}

function bar(pct, cls) {
  return `<div class="bar"><div class="bar-fill ${cls}" style="width:${clampPct(pct)}%"></div><span class="bar-txt">${Math.round(pct)}%</span></div>`;
}
const clampPct = (v) => Math.max(0, Math.min(100, v));

function renderMeters() {
  const b = G.blue, r = G.red;
  $('#blueMeters').innerHTML = `
    <div class="meter"><label>🛡️ Threat Intel</label>${bar(b.threatIntel, 'ti')}</div>
    <div class="meter"><label>💹 Profit / Loss</label>${bar(b.pl, 'pl')}</div>
    <div class="res-row">
      <span class="chip">💰 $${b.budget}</span>
      <span class="chip">🧑‍💼 Staff ${b.staff}</span>
      <span class="chip">⚡ AP ${b.ap}/${b.apMax}</span>
    </div>`;
  const jewels = crownJewels(G); const jlost = jewels.filter(a=>a.compromised).length;
  $('#redMeters').innerHTML = `
    <div class="meter"><label>🏭 Crown Jewels (PLC)</label>${bar((jlost/jewels.length)*100, 'cj')}</div>
    <div class="meter"><label>🖥️ Aset Dikuasai</label>${bar((compromisedAssets(G).length/G.assets.length)*100, 'comp')}</div>
    <div class="res-row">
      <span class="chip">👾 Resource ${r.resources}/${r.resMax}</span>
      <span class="chip">⚡ AP ${r.ap}/${r.apMax}</span>
      <span class="chip">📍 Foothold ${r.foothold.filter(z=>z!=='internet').length}</span>
    </div>`;
}
// crownJewels() berasal dari engine.js (scope global bersama).

/* Network board */
function renderNetwork() {
  const wrap = $('#network'); wrap.innerHTML = '';
  ZONES.forEach(z => {
    if (z.id === 'internet') return;
    const col = el('div', 'zone');
    col.style.setProperty('--zc', z.color);
    const reach = reachableZones(G).has(z.id);
    const badges = [];
    if (G.sensors[z.id]) badges.push('<span class="zbadge ids">📡 IDS</span>');
    if (G.segments[z.id]) badges.push(`<span class="zbadge seg">🚧 x${G.segments[z.id]}</span>`);
    if (reach) badges.push('<span class="zbadge reach">⚠️ terjangkau Red</span>');
    col.appendChild(el('div', 'zone-head', `<span>${z.name}</span><div class="zbadges">${badges.join('')}</div>`));
    const grid = el('div', 'asset-grid');
    assetsInZone(G, z.id).forEach(a => grid.appendChild(assetCard(a)));
    col.appendChild(grid);
    wrap.appendChild(col);
  });
}

function assetCard(a) {
  // visibilitas intel: jika human = red, tampilkan hanya yg discovered/scanned
  const humanRed = G.humanSide === 'red';
  const known = !humanRed || a.discovered;
  const c = el('div', 'asset');
  c.dataset.id = a.id;
  let cls = 'asset';
  if (a.compromised) cls += ' compromised';
  else if (a.patched) cls += ' patched';
  if (a.crownJewel) cls += ' crown';
  if (a.disabled) cls += ' disabled';
  if (!known) cls += ' unknown';
  c.className = cls;

  const typeIcon = { workstation:'💻', server:'🖧', network:'🌐', security:'🛡️', ics:'🏭' }[a.type] || '📦';
  if (!known) {
    c.innerHTML = `<div class="a-name">❔ ???</div><div class="a-sub">belum ditemukan</div>`;
  } else {
    const vulnDots = humanRed && !a.scanned ? '—' :
      '●'.repeat(a.vuln) + '○'.repeat(5 - a.vuln);
    const hard = '▰'.repeat(a.hardening) + '▱'.repeat(6 - a.hardening);
    const status = a.compromised ? '☠️ compromised' : a.disabled ? '🛑 down' : a.patched ? '✅ patched' : 'online';
    c.innerHTML = `
      <div class="a-name">${typeIcon} ${a.name}${a.crownJewel?' 👑':''}</div>
      <div class="a-sub">${status}</div>
      <div class="a-stat"><span title="kerentanan">vuln ${vulnDots}</span></div>
      <div class="a-stat"><span title="hardening" class="hard">${hard}</span></div>`;
  }
  // klik untuk target
  c.addEventListener('click', () => onAssetClick(a));
  return c;
}

/* Panel aksi */
function renderActions() {
  const panel = $('#actionPanel');
  const side = G.humanSide;
  const isHumanTurn = G.turn === side && G.phase === 'playing';
  panel.innerHTML = '';
  const list = side === 'blue' ? BLUE_ACTIONS : RED_ACTIONS;
  const title = el('h3', null, side === 'blue' ? '🛡️ Aksi Blue Team' : '👾 Aksi Red Team');
  panel.appendChild(title);
  if (pendingAction) {
    panel.appendChild(el('div', 'hint', `🎯 Pilih target untuk <b>${actName(pendingAction.actId)}</b> pada board, atau <a href="#" id="cancelTgt">batal</a>.`));
  }
  const grid = el('div', 'action-grid');
  list.forEach(act => {
    const chk = side === 'blue' ? blueActionAvailable(G, act) : redActionAvailable(G, act);
    const card = el('button', 'action-card' + (chk.ok && isHumanTurn ? '' : ' disabled'));
    const costStr = side === 'blue'
      ? `⚡${act.ap} 💰${act.cost}${act.staff?` 🧑‍💼${act.staff}`:''}`
      : `⚡${act.ap} 👾${act.res}`;
    card.innerHTML = `<div class="ac-head"><span class="ac-ico">${act.icon}</span><span class="ac-name">${act.name}</span></div>
      <div class="ac-cost">${costStr}</div>
      <div class="ac-desc">${act.desc}</div>
      ${!chk.ok && isHumanTurn ? `<div class="ac-why">${chk.why}</div>` : ''}`;
    if (chk.ok && isHumanTurn) card.addEventListener('click', () => onActionClick(act));
    grid.appendChild(card);
  });
  panel.appendChild(grid);
  const ct = $('#cancelTgt'); if (ct) ct.addEventListener('click', (e) => { e.preventDefault(); pendingAction = null; render(); });
}
const actName = (id) => (BLUE_ACTIONS.concat(RED_ACTIONS).find(a => a.id === id) || {}).name || id;

function renderLog() {
  const box = $('#log'); box.innerHTML = '';
  G.log.slice(0, 60).forEach(e => {
    const row = el('div', 'log-row ' + e.kind + ' ' + e.side);
    row.innerHTML = `<span class="lr-round">R${e.round}</span><span class="lr-txt">${e.text}</span>`;
    box.appendChild(row);
  });
}

function renderBanner() {
  const banner = $('#banner');
  if (G.phase === 'over') {
    banner.className = 'banner show ' + G.winner;
    const won = G.winner === G.humanSide;
    banner.innerHTML = `
      <div class="banner-inner">
        <h2>${G.winner === 'blue' ? '🛡️ BLUE MENANG' : '👾 RED MENANG'}</h2>
        <p>${G.winReason}</p>
        <p class="verdict">${won ? '🎉 Selamat, Anda menang!' : '💀 Anda kalah. Coba lagi!'}</p>
        <button id="againBtn" class="btn primary">Main Lagi</button>
      </div>`;
    $('#againBtn').addEventListener('click', backToMenu);
  } else {
    banner.className = 'banner';
    banner.innerHTML = '';
  }
}

/* ---------------------------------------------------------- Interaksi ---*/
function onActionClick(act) {
  if (G.turn !== G.humanSide || G.phase !== 'playing') return;
  if (act.target) {
    pendingAction = { side: G.humanSide, actId: act.id };
    render();
  } else {
    execHuman(act.id, null);
  }
}

function onAssetClick(a) {
  if (!pendingAction) return;
  const actId = pendingAction.actId;
  const act = (G.humanSide === 'blue' ? BLUE_ACTIONS : RED_ACTIONS).find(x => x.id === actId);
  // untuk aksi target zona, klik aset = pilih zonanya
  let targetId = a.id;
  if (act.target === 'zone' || act.target === 'reachZone' || act.target === 'pivotZone') targetId = a.zone;
  execHuman(actId, targetId);
}

function execHuman(actId, targetId) {
  const fn = G.humanSide === 'blue' ? doBlueAction : doRedAction;
  const res = fn(G, actId, targetId);
  if (!res.ok) { toast(res.why); return; }
  pendingAction = null;
  render();
  // auto end turn jika AP habis? biarkan pemain yang memutuskan.
}

function onEndTurn() {
  if (G.turn !== G.humanSide || G.phase !== 'playing') return;
  pendingAction = null;
  endTurn(G);
  render();
  maybeRunAI();
}

/* ------------------------------------------------------------- AI loop --*/
async function maybeRunAI() {
  if (aiBusy) return;
  while (G.phase === 'playing' && G.turn === G.aiSide) {
    aiBusy = true;
    $('#endTurnBtn').disabled = true;
    await sleep(650);
    const move = G.aiSide === 'blue' ? aiNextBlueMove(G) : aiNextRedMove(G);
    if (!move) { break; }
    const fn = G.aiSide === 'blue' ? doBlueAction : doRedAction;
    fn(G, move.actId, move.targetId);
    render();
    if (G.phase === 'over') { aiBusy = false; return; }
  }
  // AI selesai giliran
  if (G.phase === 'playing' && G.turn === G.aiSide) {
    await sleep(500);
    endTurn(G);
    render();
    aiBusy = false;
    // bila setelah endTurn masih giliran AI (tidak mungkin), loop lagi
    if (G.turn === G.aiSide) maybeRunAI();
    return;
  }
  aiBusy = false;
  render();
}

/* -------------------------------------------------------------- Util ----*/
let toastTimer = null;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function backToMenu() {
  $('#game').classList.add('hidden');
  $('#menu').classList.remove('hidden');
  G = null; pendingAction = null; aiBusy = false;
}

/* --------------------------------------------------------------- Init ---*/
function initUI() {
  $$('.play-btn').forEach(btn => btn.addEventListener('click', () => {
    const side = btn.dataset.side;
    const diff = $('#difficulty').value;
    startGame(side, diff);
  }));
  $('#endTurnBtn').addEventListener('click', onEndTurn);
  $('#backBtn').addEventListener('click', backToMenu);
  $('#helpBtn').addEventListener('click', () => $('#helpModal').classList.toggle('hidden'));
  $('#closeHelp').addEventListener('click', () => $('#helpModal').classList.add('hidden'));
}
document.addEventListener('DOMContentLoaded', initUI);
