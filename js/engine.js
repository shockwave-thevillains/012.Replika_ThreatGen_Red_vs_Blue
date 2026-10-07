/* ============================================================================
 * CyberClash: Red vs Blue  —  engine.js
 * State game berbasis SKENARIO, resolusi aksi, deteksi, AI, menang/kalah.
 * Murni logika; tanpa DOM. Dipakai oleh ui.js.
 * ==========================================================================*/

'use strict';

const rng = () => Math.random();
const chance = (p) => rng() < p;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* Urutan/kedalaman zona diambil dari skenario aktif (g.zones). */
const zoneOrder = (g, id) => g.zones.findIndex(z => z.id === id);
const zoneName  = (g, id) => (g.zones.find(z => z.id === id) || { name: id }).name;
const deepestOrder = (g) => g.zones.length - 1;
const perimeterId = (g) => (g.zones[1] || {}).id;         // zona pertama setelah internet

/* --------------------------------------------------------------------------
 * Pembuatan state awal dari sebuah skenario
 * ------------------------------------------------------------------------*/
function createGame(opts) {
  const cfg = JSON.parse(JSON.stringify(GAME_CONFIG));
  const scenario = SCENARIOS.find(s => s.id === opts.scenarioId) || SCENARIOS[0];
  const difficulty = opts.difficulty || 'normal';

  const zones = scenario.zones.map(z => ({ ...z }));
  const assets = scenario.assets.map(t => ({
    id: t.id, name: t.name, zone: t.zone, type: t.type,
    internetFacing: !!t.internetFacing, crownJewel: !!t.crownJewel,
    vuln: t.baseVuln, hardening: t.baseHard || 0,
    patched: false, compromised: false, disabled: false,
    discovered: false, scanned: false,
  }));

  const sensors = {}, segments = {};
  zones.forEach(z => { sensors[z.id] = false; segments[z.id] = 0; });

  const sb = (scenario.start && scenario.start.blue) || {};
  const sr = (scenario.start && scenario.start.red) || {};

  const g = {
    opts, difficulty,
    scenario: { id: scenario.id, name: scenario.name, tier: scenario.tier, icon: scenario.icon,
                summary: scenario.summary, threat: scenario.threat },
    round: 1,
    maxRounds: scenario.maxRounds || cfg.maxRounds,
    turn: 'blue', phase: 'setup',
    winner: null, winReason: '',
    zones, assets, sensors, segments,
    blue: {
      budget: sb.budget != null ? sb.budget : cfg.blue.budget,
      staff:  sb.staff  != null ? sb.staff  : cfg.blue.staff,
      pl: cfg.blue.pl, threatIntel: cfg.blue.threatIntel,
      ap: cfg.blue.apPerTurn, apMax: cfg.blue.apPerTurn,
      used: {}, cooldowns: {},
      hasPolicies: false, hasSiem: false, hasBackup: false, hasInventory: false,
      hasAwareness: false, hasSurveil: false,
    },
    red: {
      resources: sr.resources != null ? sr.resources : cfg.red.resources,
      resMax:    sr.resources != null ? sr.resources : cfg.red.resources,
      ap: cfg.red.apPerTurn, apMax: cfg.red.apPerTurn,
      used: {}, foothold: ['internet'],
    },
    cfg, log: [],
    aiSide: opts.aiSide, humanSide: opts.humanSide,
    mod: { redAtk: 0, blueDet: 0 },
  };

  // Tingkat kesulitan → efektivitas sisi AI (lewat probabilitas, tempo tetap).
  const bonus = { easy: -0.12, normal: 0, hard: 0.12 }[difficulty];
  if (opts.aiSide === 'red') g.mod.redAtk = bonus; else g.mod.blueDet = bonus;
  return g;
}

/* --------------------------------------------------------------------------
 * Util state
 * ------------------------------------------------------------------------*/
function logEvent(g, side, text, kind = 'info') {
  g.log.unshift({ round: g.round, side, text, kind });
  if (g.log.length > 200) g.log.pop();
}
const assetById = (g, id) => g.assets.find(a => a.id === id);
const assetsInZone = (g, zone) => g.assets.filter(a => a.zone === zone);
const compromisedAssets = (g) => g.assets.filter(a => a.compromised);
const crownJewels = (g) => g.assets.filter(a => a.crownJewel);

// Zona yang bisa ditindak Red: internet + perimeter selalu; sisanya butuh foothold.
const reachableZones = (g) => {
  const set = new Set(['internet']);
  const per = perimeterId(g); if (per) set.add(per);
  g.red.foothold.forEach(z => set.add(z));
  g.assets.forEach(a => { if (a.compromised) set.add(a.zone); });
  return set;
};
const hasFoothold = (g, zone) =>
  g.red.foothold.includes(zone) || g.assets.some(a => a.zone === zone && a.compromised);

/* --------------------------------------------------------------------------
 * Deteksi saat Red menyerang di sebuah zona
 * ------------------------------------------------------------------------*/
function rollDetection(g, zone, baseText) {
  let p = 0;
  if (g.sensors[zone]) p += 0.45;
  if (g.blue.hasSiem) p += 0.25;
  if (g.blue.hasPolicies) p += 0.05;
  p += g.mod.blueDet;
  p = clamp(p, 0, 0.9);
  if (p > 0 && chance(p)) {
    const gain = 5 + Math.floor(rng() * 4);
    g.blue.threatIntel = clamp(g.blue.threatIntel + gain, 0, 100);
    logEvent(g, 'blue', `🚨 IDS mendeteksi aktivitas Red di ${zoneName(g, zone)} (+${gain} Threat Intel). ${baseText}`, 'detect');
    return true;
  }
  return false;
}

/* --------------------------------------------------------------------------
 * Validasi ketersediaan aksi
 * ------------------------------------------------------------------------*/
function blueActionAvailable(g, act) {
  const b = g.blue;
  if (g.turn !== 'blue' || g.phase !== 'playing') return { ok: false, why: 'Bukan giliran Blue' };
  if (b.ap < act.ap) return { ok: false, why: 'AP kurang' };
  if (act.cost > b.budget) return { ok: false, why: 'Anggaran kurang' };
  if (act.staff > b.staff) return { ok: false, why: 'Staff kurang' };
  if (act.once && b.used[act.id]) return { ok: false, why: 'Hanya sekali' };
  if (act.req && !b.used[act.req]) return { ok: false, why: 'Butuh: ' + (BLUE_ACTIONS.find(a => a.id === act.req) || {}).name };
  if (act.cooldown && b.cooldowns[act.id] && g.round < b.cooldowns[act.id])
    return { ok: false, why: 'Cooldown s/d ronde ' + b.cooldowns[act.id] };
  // aksi bertarget tanpa kandidat → nonaktif
  if (act.target && (blueTargets(g, act) || []).length === 0) return { ok: false, why: 'Tak ada target' };
  return { ok: true };
}
function redActionAvailable(g, act) {
  const r = g.red;
  if (g.turn !== 'red' || g.phase !== 'playing') return { ok: false, why: 'Bukan giliran Red' };
  if (r.ap < act.ap) return { ok: false, why: 'AP kurang' };
  if (act.res > r.resources) return { ok: false, why: 'Hacker Resources kurang' };
  if (act.once && r.used[act.id]) return { ok: false, why: 'Hanya sekali' };
  if (act.target && (redTargets(g, act) || []).length === 0) return { ok: false, why: 'Tak ada target' };
  return { ok: true };
}

/* --------------------------------------------------------------------------
 * Target valid untuk aksi bertarget
 * ------------------------------------------------------------------------*/
function blueTargets(g, act) {
  switch (act.target) {
    case 'zone': return g.zones.filter(z => z.id !== 'internet' && !g.sensors[z.id])
                   .map(z => ({ id: z.id, label: z.name }));
    case 'asset': return g.assets.filter(a => !a.patched && !a.compromised && a.vuln > 0)
                   .map(a => ({ id: a.id, label: `${a.name} (vuln ${a.vuln})` }));
    case 'compromised': return compromisedAssets(g).map(a => ({ id: a.id, label: a.name }));
    default: return null;
  }
}
function redTargets(g, act) {
  const reach = reachableZones(g);
  const deep = deepestOrder(g);
  switch (act.target) {
    case 'reachZone':
      return g.zones.filter(z => z.id !== 'internet' && reach.has(z.id) &&
          assetsInZone(g, z.id).some(a => !a.discovered))
        .map(z => ({ id: z.id, label: z.name }));
    case 'knownAsset':
      return g.assets.filter(a => a.discovered && !a.scanned && !a.compromised)
        .map(a => ({ id: a.id, label: a.name }));
    case 'scannedAsset':
      return g.assets.filter(a => a.scanned && !a.compromised)
        .map(a => ({ id: a.id, label: `${a.name} (vuln ${a.vuln})` }));
    case 'socialZone': // zona internal (order>=2) dgn workstation bebas
      return g.zones.filter(z => zoneOrder(g, z.id) >= 2 &&
          assetsInZone(g, z.id).some(a => a.type === 'workstation' && !a.compromised))
        .map(z => ({ id: z.id, label: z.name }));
    case 'physicalZone': // zona dalam dgn aset non-network non-crown bebas
      return g.zones.filter(z => zoneOrder(g, z.id) >= 2 &&
          assetsInZone(g, z.id).some(a => a.type !== 'network' && !a.crownJewel && !a.compromised))
        .map(z => ({ id: z.id, label: z.name }));
    case 'pivotZone': // zona belum terjangkau, tapi ada aset compromised di zona tepat sebelumnya
      return g.zones.filter(z => z.id !== 'internet' && !reach.has(z.id) &&
          g.zones.some(p => zoneOrder(g, p.id) === zoneOrder(g, z.id) - 1 &&
            p.id !== 'internet' && g.assets.some(a => a.zone === p.id && a.compromised)))
        .map(z => ({ id: z.id, label: z.name }));
    case 'ownedAsset':
      return compromisedAssets(g).map(a => ({ id: a.id, label: a.name }));
    case 'plc': // crown jewel di zona yang sudah punya foothold
      return g.assets.filter(a => a.crownJewel && !a.compromised && hasFoothold(g, a.zone))
        .map(a => ({ id: a.id, label: a.name }));
    default: return null;
  }
}

/* --------------------------------------------------------------------------
 * Eksekusi aksi BLUE
 * ------------------------------------------------------------------------*/
function doBlueAction(g, actId, targetId) {
  const act = BLUE_ACTIONS.find(a => a.id === actId);
  const chk = blueActionAvailable(g, act);
  if (!chk.ok) return { ok: false, why: chk.why };
  if (act.target && !targetId) return { ok: false, why: 'Pilih target' };

  const b = g.blue;
  b.ap -= act.ap; b.budget -= act.cost;
  b.used[act.id] = (b.used[act.id] || 0) + 1;

  switch (actId) {
    case 'policies': b.hasPolicies = true;
      logEvent(g, 'blue', '📋 Kebijakan & prosedur keamanan diterapkan. Program keamanan dimulai.'); break;
    case 'inventory': b.hasInventory = true;
      logEvent(g, 'blue', '🗂️ Inventaris aset lengkap. Visibilitas jaringan meningkat.'); break;
    case 'firewall':
      assetsInZone(g, perimeterId(g)).forEach(a => a.hardening = clamp(a.hardening + 2, 0, 6));
      logEvent(g, 'blue', '🧱 Firewall perimeter diperkuat. Hardening zona perimeter naik.'); break;
    case 'segment': {
      let n = 0; g.zones.forEach(z => { if (z.id !== 'internet') { g.segments[z.id] += 1; n++; } });
      logEvent(g, 'blue', `🚧 Segmentasi diterapkan di ${n} zona. Pivot Red jadi lebih sulit.`); break;
    }
    case 'ids': g.sensors[targetId] = true;
      logEvent(g, 'blue', `📡 Sensor IDS aktif di ${zoneName(g, targetId)}.`); break;
    case 'siem': b.hasSiem = true;
      logEvent(g, 'blue', '🛰️ SIEM online. Peluang deteksi seluruh sensor meningkat.'); break;
    case 'awareness': b.hasAwareness = true;
      logEvent(g, 'blue', '🎓 Pelatihan security awareness selesai. Karyawan lebih waspada phishing.'); break;
    case 'surveil': b.hasSurveil = true;
      logEvent(g, 'blue', '🎥 Pengawasan fisik & kontrol akses dipasang.'); break;
    case 'backup': b.hasBackup = true;
      logEvent(g, 'blue', '💾 Proses backup berjalan. Remediasi kini bisa memulihkan aset.'); break;
    case 'patch': {
      const a = assetById(g, targetId);
      a.vuln = clamp(a.vuln - 2, 0, 5); a.hardening = clamp(a.hardening + 2, 0, 6);
      if (a.vuln === 0) a.patched = true; a.scanned = false;
      logEvent(g, 'blue', `🩹 ${a.name} di-patch (vuln → ${a.vuln}).`); break;
    }
    case 'remediate': {
      const a = assetById(g, targetId);
      if (!b.hasBackup) { b.ap += act.ap; b.budget += act.cost; b.used[act.id]--; return { ok: false, why: 'Butuh proses Backup dulu' }; }
      a.compromised = false; a.disabled = false; a.hardening = clamp(a.hardening + 1, 0, 6);
      b.threatIntel = clamp(b.threatIntel + 3, 0, 100);
      logEvent(g, 'blue', `🧹 ${a.name} dibersihkan & dipulihkan dari kendali Red (+3 Threat Intel).`, 'detect'); break;
    }
    case 'forensics': {
      const gain = 7 + Math.floor(rng() * 5);
      b.threatIntel = clamp(b.threatIntel + gain, 0, 100);
      logEvent(g, 'blue', `🔬 Investigasi forensik (+${gain} Threat Intel).`, 'detect'); break;
    }
    case 'budget': {
      const since = b._lastBudgetRound ? (g.round - b._lastBudgetRound) : 99;
      const rejectP = since < 5 ? 0.5 : 0.1;
      b.cooldowns.budget = g.round + act.cooldown; b._lastBudgetRound = g.round;
      if (chance(rejectP)) logEvent(g, 'blue', '💰 Permintaan anggaran DITOLAK manajemen (terlalu sering).', 'warn');
      else { b.budget += 110; logEvent(g, 'blue', '💰 Anggaran disetujui (+$110).'); }
      break;
    }
    case 'hire': b.staff += 1;
      logEvent(g, 'blue', `🧑‍💼 1 staff direkrut (total ${b.staff}). Gaji akan menekan P/L.`); break;
  }
  checkEnd(g);
  return { ok: true };
}

/* --------------------------------------------------------------------------
 * Eksekusi aksi RED
 * ------------------------------------------------------------------------*/
function doRedAction(g, actId, targetId) {
  const act = RED_ACTIONS.find(a => a.id === actId);
  const chk = redActionAvailable(g, act);
  if (!chk.ok) return { ok: false, why: chk.why };
  if (act.target && !targetId) return { ok: false, why: 'Pilih target' };
  const validT = act.target ? redTargets(g, act).map(t => t.id) : null;
  if (validT && !validT.includes(targetId)) return { ok: false, why: 'Target tidak valid' };

  const r = g.red;
  r.ap -= act.ap; r.resources -= act.res;
  r.used[act.id] = (r.used[act.id] || 0) + 1;

  switch (actId) {
    case 'recruit': r.resMax += 2; r.resources += 2;
      logEvent(g, 'red', '🧑‍💻 Hacker baru direkrut (+2 resource).'); break;
    case 'osint':
      g.assets.filter(a => a.internetFacing).forEach(a => a.discovered = true);
      logEvent(g, 'red', '🔎 OSINT: aset perimeter (internet-facing) terungkap.'); break;
    case 'hostscan':
      assetsInZone(g, targetId).forEach(a => a.discovered = true);
      logEvent(g, 'red', `📶 Host discovery di ${zoneName(g, targetId)} — aset terpetakan.`);
      rollDetection(g, targetId, 'Scan terdeteksi.'); break;
    case 'portscan': {
      const a = assetById(g, targetId); a.scanned = true;
      logEvent(g, 'red', `🧭 ${a.name} di-scan — vuln ${a.vuln} terekspos.`);
      rollDetection(g, a.zone, 'Port scan terdeteksi.'); break;
    }
    case 'passwd':
    case 'exploit': {
      const a = assetById(g, targetId);
      const base = actId === 'exploit' ? 0.5 : 0.4;
      let p = clamp(base + a.vuln * 0.08 - a.hardening * 0.09 + g.mod.redAtk, 0.05, 0.9);
      rollDetection(g, a.zone, actId === 'exploit' ? 'Eksploitasi terdeteksi.' : 'Serangan password terdeteksi.');
      if (chance(p)) {
        a.compromised = true;
        if (!r.foothold.includes(a.zone)) r.foothold.push(a.zone);
        logEvent(g, 'red', `💥 ${a.name} BERHASIL di-compromise!`, 'breach');
      } else logEvent(g, 'red', `🛡️ Serangan ke ${a.name} gagal (hardening bertahan).`, 'warn');
      break;
    }
    case 'phish': {
      const zone = targetId;
      let p = clamp(0.6 - (g.blue.hasAwareness ? 0.35 : 0) + g.mod.redAtk, 0.1, 0.8);
      if (g.blue.hasSiem && chance(0.2)) { g.blue.threatIntel = clamp(g.blue.threatIntel + 4, 0, 100);
        logEvent(g, 'blue', '🚨 Email phishing terdeteksi SIEM (+4 Threat Intel).', 'detect'); }
      if (chance(p)) {
        const cands = assetsInZone(g, zone).filter(a => a.type === 'workstation' && !a.compromised);
        const a = cands[Math.floor(rng() * cands.length)];
        a.compromised = true; a.discovered = true; a.scanned = true;
        if (!r.foothold.includes(zone)) r.foothold.push(zone);
        logEvent(g, 'red', `🎣 Phishing sukses! ${a.name} jadi foothold di ${zoneName(g, zone)}.`, 'breach');
      } else logEvent(g, 'red', `🎣 Phishing ke ${zoneName(g, zone)} gagal — karyawan tidak terpancing.`, 'warn');
      break;
    }
    case 'usb': {
      const zone = targetId;
      if (g.blue.hasSurveil && chance(0.5)) {
        g.blue.threatIntel = clamp(g.blue.threatIntel + 6, 0, 100);
        logEvent(g, 'blue', '🎥 CCTV menangkap upaya akses fisik! (+6 Threat Intel). Serangan gagal.', 'detect'); break;
      }
      const cands = assetsInZone(g, zone).filter(a => a.type !== 'network' && !a.crownJewel && !a.compromised);
      const a = cands[Math.floor(rng() * cands.length)];
      let p = clamp(0.5 + a.vuln * 0.04 + g.mod.redAtk, 0.2, 0.78);
      if (chance(p)) {
        a.compromised = true; a.discovered = true; a.scanned = true;
        if (!r.foothold.includes(zone)) r.foothold.push(zone);
        logEvent(g, 'red', `🔌 Akses fisik berhasil! ${a.name} compromised — foothold di ${zoneName(g, zone)}!`, 'breach');
      } else logEvent(g, 'red', `🔌 Upaya akses fisik di ${zoneName(g, zone)} gagal.`, 'warn');
      break;
    }
    case 'pivot': {
      const z = targetId, seg = g.segments[z] || 0;
      let p = clamp(0.72 - seg * 0.18 - (zoneOrder(g, z) - 1) * 0.08 + g.mod.redAtk, 0.1, 0.9);
      rollDetection(g, z, 'Lateral movement terdeteksi.');
      if (chance(p)) {
        if (!r.foothold.includes(z)) r.foothold.push(z);
        assetsInZone(g, z).forEach(a => a.discovered = true);
        logEvent(g, 'red', `↔️ Pivot sukses ke ${zoneName(g, z)} (tembus segmentasi).`, 'breach');
      } else logEvent(g, 'red', `🚧 Pivot ke ${zoneName(g, z)} gagal — firewall internal bertahan.`, 'warn');
      break;
    }
    case 'privesc': {
      const a = assetById(g, targetId);
      assetsInZone(g, a.zone).forEach(x => { if (!x.compromised) x.hardening = clamp(x.hardening - 1, 0, 6); });
      logEvent(g, 'red', `⬆️ Privilege escalation dari ${a.name} — pertahanan ${zoneName(g, a.zone)} melemah.`); break;
    }
    case 'attackplc': {
      const a = assetById(g, targetId);
      let p = clamp(0.4 + a.vuln * 0.07 - a.hardening * 0.1 + g.mod.redAtk, 0.1, 0.8);
      rollDetection(g, a.zone, 'Serangan ke aset inti terdeteksi!');
      if (chance(p)) { a.compromised = true;
        logEvent(g, 'red', `🎯 Aset inti ${a.name} DIKUASAI! Crown jewel jatuh!`, 'breach');
      } else logEvent(g, 'red', `🎯 Serangan ke ${a.name} gagal — proteksi inti bertahan.`, 'warn');
      break;
    }
    case 'dos': {
      const a = assetById(g, targetId); a.disabled = true;
      const dmg = 10 + Math.floor(rng() * 8);
      g.blue.pl = clamp(g.blue.pl - dmg, 0, 100);
      logEvent(g, 'red', `🛑 DoS pada ${a.name} — operasi terganggu (P/L Blue -${dmg}).`, 'breach'); break;
    }
  }
  checkEnd(g);
  return { ok: true };
}

/* --------------------------------------------------------------------------
 * Pergantian giliran + efek pasif
 * ------------------------------------------------------------------------*/
function endTurn(g) {
  if (g.phase !== 'playing') return;
  if (g.turn === 'blue') {
    const salary = g.blue.staff * g.cfg.salaryPerStaff;
    const dmg = compromisedAssets(g).length * g.cfg.plDamagePerCompromise;
    g.blue.pl = clamp(g.blue.pl - salary - dmg, 0, 100);
    if (g.blue.hasPolicies) g.blue.threatIntel = clamp(g.blue.threatIntel + 1, 0, 100);
    if (salary + dmg > 0) logEvent(g, 'blue', `📉 Akhir giliran: -${salary} gaji, -${dmg} dampak insiden (P/L ${g.blue.pl}).`, dmg ? 'warn' : 'info');
    g.turn = 'red';
    g.red.ap = g.red.apMax;
    g.red.resources = Math.min(g.red.resMax, g.red.resources + g.red.resMax);
  } else {
    g.turn = 'blue'; g.round += 1; g.blue.ap = g.blue.apMax; checkEnd(g);
  }
  checkEnd(g);
}

/* --------------------------------------------------------------------------
 * Kondisi menang/kalah
 * ------------------------------------------------------------------------*/
function checkEnd(g) {
  if (g.phase === 'over') return;
  const jewels = crownJewels(g);
  if (jewels.length && jewels.every(a => a.compromised)) return finish(g, 'red', 'Red menguasai SELURUH aset inti (crown jewels).');
  if (g.blue.pl <= 0) return finish(g, 'red', 'P/L Blue jatuh ke 0 — bisnis lumpuh.');
  if (g.blue.threatIntel >= 100) return finish(g, 'blue', 'Threat Intel 100% — Red teridentifikasi & ditangkap.');
  const allPatched = g.assets.every(a => a.patched || a.vuln === 0);
  if (allPatched && compromisedAssets(g).length === 0 && g.round > 3)
    return finish(g, 'blue', 'Seluruh kerentanan ditambal & tak ada aset dikuasai Red.');
  if (g.round > g.maxRounds) return finish(g, 'blue', `Bertahan ${g.maxRounds} ronde — Red kehabisan waktu.`);
}
function finish(g, winner, reason) {
  g.phase = 'over'; g.winner = winner; g.winReason = reason;
  logEvent(g, winner, `🏁 GAME OVER — ${winner === 'blue' ? 'BLUE' : 'RED'} MENANG: ${reason}`, 'end');
}

/* --------------------------------------------------------------------------
 * AI Blue — deteksi (menuju Threat Intel 100) + perlambat Red
 * ------------------------------------------------------------------------*/
function aiNextBlueMove(g) {
  const b = g.blue;
  if (b.ap <= 0) return null;
  const avail = (id) => blueActionAvailable(g, BLUE_ACTIONS.find(a => a.id === id)).ok;
  const comp = compromisedAssets(g);
  const deep = deepestOrder(g);

  if (avail('policies')) return { actId: 'policies' };

  const plcComp = comp.find(a => a.crownJewel);
  if (plcComp) {
    if (!b.hasBackup && avail('backup')) return { actId: 'backup' };
    if (b.hasBackup && avail('remediate')) return { actId: 'remediate', targetId: plcComp.id };
  }

  // IDS: utamakan zona crown-jewel terdalam, lalu mundur ke perimeter
  if (avail('ids')) {
    const order = g.zones.filter(z => z.id !== 'internet').sort((a, c) => zoneOrder(g, c.id) - zoneOrder(g, a.id));
    const z = order.find(z => !g.sensors[z.id]);
    if (z) return { actId: 'ids', targetId: z.id };
  }

  if (b.budget < 45 && avail('budget')) return { actId: 'budget' };

  // Keraskan crown jewel & aset dalam yang masih rentan
  if (avail('patch') && b.budget >= 60) {
    const cands = g.assets.filter(a => !a.patched && !a.compromised && a.vuln >= 2)
      .sort((x, y) => (y.crownJewel - x.crownJewel) ||
        (zoneOrder(g, y.zone) - zoneOrder(g, x.zone)) ||
        (y.internetFacing - x.internetFacing) || (y.vuln - x.vuln));
    if (cands[0] && (cands[0].crownJewel || cands[0].vuln >= 3 || g.round < 8))
      return { actId: 'patch', targetId: cands[0].id };
  }

  if (avail('siem')) return { actId: 'siem' };
  if (avail('segment')) return { actId: 'segment' };

  if (comp.length) {
    if (!b.hasBackup && avail('backup')) return { actId: 'backup' };
    if (b.hasBackup && avail('remediate')) return { actId: 'remediate', targetId: comp[0].id };
  }

  if (b.budget >= 18 && avail('forensics')) return { actId: 'forensics' };
  if (b.budget < 70 && avail('budget')) return { actId: 'budget' };
  if (b.budget >= 30) for (const id of ['awareness', 'surveil', 'firewall', 'inventory']) if (avail(id)) return { actId: id };
  if (b.budget > 180 && b.staff < 3 && avail('hire')) return { actId: 'hire' };
  return null;
}

/* --------------------------------------------------------------------------
 * AI Red — greedy menuju seluruh crown jewel
 * ------------------------------------------------------------------------*/
function aiNextRedMove(g) {
  const r = g.red;
  if (r.ap <= 0) return null;
  const avail = (id) => redActionAvailable(g, RED_ACTIONS.find(a => a.id === id)).ok;
  const tgs = (id) => redTargets(g, RED_ACTIONS.find(a => a.id === id)) || [];
  const reach = reachableZones(g);
  const internalFoothold = g.assets.some(a => a.compromised && zoneOrder(g, a.zone) >= 2);

  if (r.resources < 2 && avail('recruit')) return { actId: 'recruit' };

  // 1. Serang crown jewel bila ada yang terjangkau
  if (avail('attackplc') && tgs('attackplc').length)
    return { actId: 'attackplc', targetId: tgs('attackplc')[0].id };

  // 2. OSINT awal
  if (avail('osint') && !r.used.osint) return { actId: 'osint' };

  // 3. Jalur cepat fisik/sosial
  if (!internalFoothold && avail('usb') && tgs('usb').length && chance(0.4)) {
    const t = tgs('usb').sort((a, c) => zoneOrder(g, c.id) - zoneOrder(g, a.id))[0];
    return { actId: 'usb', targetId: t.id };
  }
  if (!internalFoothold && avail('phish') && tgs('phish').length && chance(0.6)) {
    const t = tgs('phish').sort((a, c) => zoneOrder(g, a.id) - zoneOrder(g, c.id))[0];
    return { actId: 'phish', targetId: t.id };
  }

  // 4. Pivot ke zona terdalam yang bisa
  if (avail('pivot') && tgs('pivot').length) {
    const t = tgs('pivot').sort((a, c) => zoneOrder(g, c.id) - zoneOrder(g, a.id))[0];
    return { actId: 'pivot', targetId: t.id };
  }

  // 5. Exploit aset ter-scan (utamakan crown / terdalam)
  if (avail('exploit') && tgs('exploit').length) {
    const t = tgs('exploit').map(x => assetById(g, x.id))
      .sort((a, c) => (c.crownJewel - a.crownJewel) || (zoneOrder(g, c.zone) - zoneOrder(g, a.zone)) || (c.vuln - a.vuln))[0];
    return { actId: 'exploit', targetId: t.id };
  }
  // 6. Scan aset yang ditemukan
  if (avail('portscan') && tgs('portscan').length) {
    const t = tgs('portscan').map(x => assetById(g, x.id))
      .sort((a, c) => zoneOrder(g, c.zone) - zoneOrder(g, a.zone))[0];
    return { actId: 'portscan', targetId: t.id };
  }
  // 7. Host discovery di zona terjangkau terdalam
  if (avail('hostscan') && tgs('hostscan').length) {
    const t = tgs('hostscan').sort((a, c) => zoneOrder(g, c.id) - zoneOrder(g, a.id))[0];
    return { actId: 'hostscan', targetId: t.id };
  }
  // 8. Password attack
  if (avail('passwd') && tgs('passwd').length) return { actId: 'passwd', targetId: tgs('passwd')[0].id };
  // 9. Tekan P/L via DoS
  if (avail('dos') && tgs('dos').length) {
    const live = tgs('dos').map(x => assetById(g, x.id)).filter(a => !a.disabled);
    if (live.length && (g.blue.pl < 65 || !reach.has(g.zones[deepestOrder(g)].id)) && chance(0.55)) {
      const t = live.sort((a, c) => zoneOrder(g, c.zone) - zoneOrder(g, a.zone))[0];
      return { actId: 'dos', targetId: t.id };
    }
  }
  if (avail('recruit')) return { actId: 'recruit' };
  return null;
}

/* expose */
if (typeof module !== 'undefined') {
  module.exports = {
    createGame, doBlueAction, doRedAction, endTurn, checkEnd,
    blueActionAvailable, redActionAvailable, blueTargets, redTargets,
    aiNextBlueMove, aiNextRedMove, reachableZones, compromisedAssets, crownJewels,
    assetById, assetsInZone, zoneName, zoneOrder, logEvent,
  };
}
