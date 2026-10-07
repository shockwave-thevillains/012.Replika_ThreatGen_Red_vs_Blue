/* ============================================================================
 * CyberClash: Red vs Blue  —  engine.js
 * State game, resolusi aksi, deteksi, AI lawan, kondisi menang/kalah.
 * Murni logika; tanpa DOM. Dipakai oleh ui.js.
 * ==========================================================================*/

'use strict';

const rng = () => Math.random();
const chance = (p) => rng() < p;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const zoneOrder = (id) => ZONES.find(z => z.id === id).order;

/* --------------------------------------------------------------------------
 * Pembuatan state awal
 * ------------------------------------------------------------------------*/
function createGame(opts) {
  const cfg = JSON.parse(JSON.stringify(GAME_CONFIG));
  const difficulty = opts.difficulty || 'normal';
  const diffMod = { easy: 0.85, normal: 1, hard: 1.2 }[difficulty];

  const assets = ASSET_TEMPLATES.map(t => ({
    id: t.id,
    name: t.name,
    zone: t.zone,
    type: t.type,
    internetFacing: !!t.internetFacing,
    crownJewel: !!t.crownJewel,
    vuln: t.baseVuln,            // 0..5 (makin tinggi makin rentan)
    hardening: t.baseHard || 0, // mengurangi peluang exploit
    patched: false,
    compromised: false,         // dikuasai Red
    disabled: false,            // kena DoS
    // intel Red:
    discovered: false,          // Red tahu aset ini ada
    scanned: false,             // Red tahu vuln-nya
  }));

  const sensors = {};           // zoneId -> true bila ada IDS
  ZONES.forEach(z => sensors[z.id] = false);

  const segments = {};          // zoneId -> level firewall internal (pivot lebih sulit)
  ZONES.forEach(z => segments[z.id] = 0);

  const g = {
    opts,
    difficulty, diffMod,
    round: 1,
    maxRounds: cfg.maxRounds,
    turn: 'blue',               // blue mulai (membangun pertahanan)
    phase: 'setup',             // setup|playing|over
    winner: null, winReason: '',
    assets, sensors, segments,
    blue: {
      budget: cfg.blue.budget, staff: cfg.blue.staff,
      pl: cfg.blue.pl, threatIntel: cfg.blue.threatIntel,
      ap: cfg.blue.apPerTurn, apMax: cfg.blue.apPerTurn,
      used: {},                 // actionId -> count (untuk once)
      cooldowns: {},            // actionId -> round tersedia lagi
      hasPolicies: false, hasSiem: false, hasBackup: false, hasInventory: false,
      hasAwareness: false, hasSurveil: false,
    },
    red: {
      resources: cfg.red.resources, resMax: cfg.red.resources,
      ap: cfg.red.apPerTurn, apMax: cfg.red.apPerTurn,
      used: {},
      foothold: ['internet'],   // zona yang dijangkau Red
    },
    cfg,
    log: [],
    aiSide: opts.aiSide,        // sisi yang dikendalikan AI
    humanSide: opts.humanSide,
    mod: { redAtk: 0, blueDet: 0 },
  };

  // Tingkat kesulitan memengaruhi EFEKTIVITAS sisi AI (lawan pemain) saja —
  // lewat bonus probabilitas, bukan jumlah AP, agar tempo permainan tetap stabil.
  const bonus = { easy: -0.12, normal: 0, hard: 0.12 }[difficulty];
  if (opts.aiSide === 'red') g.mod.redAtk = bonus;
  else g.mod.blueDet = bonus;
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
// Zona yang bisa ditindak Red.
// DMZ selalu terjangkau dari internet (perimeter). Zona lebih dalam HANYA terjangkau
// bila Red punya foothold di sana (aset compromised) atau sudah berhasil pivot.
const reachableZones = (g) => {
  const set = new Set(['internet', 'dmz']);
  g.red.foothold.forEach(z => set.add(z));
  g.assets.forEach(a => { if (a.compromised) set.add(a.zone); });
  return set;
};
// Apakah Red memiliki pijakan nyata (aset compromised) di sebuah zona
const hasFoothold = (g, zone) =>
  g.red.foothold.includes(zone) || g.assets.some(a => a.zone === zone && a.compromised);

/* --------------------------------------------------------------------------
 * Deteksi: saat Red beraksi menyerang di sebuah zona
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
    logEvent(g, 'blue', `🚨 IDS mendeteksi aktivitas Red di ${zoneName(zone)} (+${gain} Threat Intel). ${baseText}`, 'detect');
    return true;
  }
  return false;
}
const zoneName = (id) => ZONES.find(z => z.id === id).name;

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
  if (act.req && !b.used[act.req]) return { ok: false, why: 'Butuh: ' + (BLUE_ACTIONS.find(a=>a.id===act.req)||{}).name };
  if (act.cooldown && b.cooldowns[act.id] && g.round < b.cooldowns[act.id])
    return { ok: false, why: 'Cooldown s/d ronde ' + b.cooldowns[act.id] };
  return { ok: true };
}
function redActionAvailable(g, act) {
  const r = g.red;
  if (g.turn !== 'red' || g.phase !== 'playing') return { ok: false, why: 'Bukan giliran Red' };
  if (r.ap < act.ap) return { ok: false, why: 'AP kurang' };
  if (act.res > r.resources) return { ok: false, why: 'Hacker Resources kurang' };
  if (act.once && r.used[act.id]) return { ok: false, why: 'Hanya sekali' };
  return { ok: true };
}

/* --------------------------------------------------------------------------
 * Target yang valid untuk aksi bertarget
 * ------------------------------------------------------------------------*/
function blueTargets(g, act) {
  switch (act.target) {
    case 'zone': return ZONES.filter(z => z.id !== 'internet' && !g.sensors[z.id])
                   .map(z => ({ id: z.id, label: z.name }));
    case 'asset': return g.assets.filter(a => !a.patched && !a.compromised)
                   .map(a => ({ id: a.id, label: `${a.name} (vuln ${a.vuln})` }));
    case 'compromised': return compromisedAssets(g).map(a => ({ id: a.id, label: a.name }));
    default: return null;
  }
}
function redTargets(g, act) {
  const reach = reachableZones(g);
  switch (act.target) {
    case 'reachZone':
      return ZONES.filter(z => z.id !== 'internet' && reach.has(z.id))
        .map(z => ({ id: z.id, label: z.name }));
    case 'knownAsset':
      return g.assets.filter(a => a.discovered && !a.scanned && !a.compromised)
        .map(a => ({ id: a.id, label: a.name }));
    case 'scannedAsset':
      return g.assets.filter(a => a.scanned && !a.compromised)
        .map(a => ({ id: a.id, label: `${a.name} (vuln ${a.vuln})` }));
    case 'itWorkstation':
      return g.assets.filter(a => a.zone === 'it' && a.type === 'workstation' && !a.compromised)
        .map(a => ({ id: a.id, label: a.name }));
    case 'otWorkstation':
      return g.assets.filter(a => a.zone === 'ot' && (a.type === 'workstation') && !a.compromised)
        .map(a => ({ id: a.id, label: a.name }));
    case 'pivotZone':
      // Pivot ke zona Z butuh aset compromised di zona TEPAT sebelumnya (Z-1)
      return ZONES.filter(z => z.id !== 'internet' && !reach.has(z.id) &&
          ZONES.some(p => p.order === z.order - 1 &&
            (p.id === 'dmz' || p.id === 'it') &&
            g.assets.some(a => a.zone === p.id && a.compromised)))
        .map(z => ({ id: z.id, label: z.name }));
    case 'ownedAsset':
      return compromisedAssets(g).map(a => ({ id: a.id, label: a.name }));
    case 'plc':
      // Menyerang PLC butuh pijakan NYATA di OT (aset OT yang sudah dikuasai)
      return g.assets.filter(a => a.crownJewel && !a.compromised && hasFoothold(g, 'ot'))
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
  // bayar
  b.ap -= act.ap; b.budget -= act.cost;
  b.used[act.id] = (b.used[act.id] || 0) + 1;

  switch (actId) {
    case 'policies':
      b.hasPolicies = true;
      logEvent(g, 'blue', '📋 Kebijakan & prosedur keamanan diterapkan. Program keamanan dimulai.'); break;
    case 'inventory':
      b.hasInventory = true;
      logEvent(g, 'blue', '🗂️ Inventaris aset lengkap. Visibilitas jaringan meningkat.'); break;
    case 'firewall':
      assetsInZone(g, 'dmz').forEach(a => a.hardening = clamp(a.hardening + 2, 0, 6));
      logEvent(g, 'blue', '🧱 Gateway firewall diperkuat. Hardening DMZ naik.'); break;
    case 'segment': {
      let n = 0;
      ZONES.forEach(z => { if (z.id !== 'internet') { g.segments[z.id] += 1; n++; } });
      logEvent(g, 'blue', `🚧 Segmentasi diterapkan di ${n} zona. Pivot Red jadi lebih sulit.`); break;
    }
    case 'ids':
      g.sensors[targetId] = true;
      logEvent(g, 'blue', `📡 Sensor IDS aktif di ${zoneName(targetId)}.`); break;
    case 'siem':
      b.hasSiem = true;
      logEvent(g, 'blue', '🛰️ SIEM online. Peluang deteksi seluruh sensor meningkat.'); break;
    case 'awareness':
      b.hasAwareness = true;
      logEvent(g, 'blue', '🎓 Pelatihan security awareness selesai. Karyawan lebih waspada phishing.'); break;
    case 'surveil':
      b.hasSurveil = true;
      logEvent(g, 'blue', '🎥 Pengawasan fisik & kontrol akses dipasang.'); break;
    case 'backup':
      b.hasBackup = true;
      logEvent(g, 'blue', '💾 Proses backup berjalan. Remediasi kini bisa memulihkan aset.'); break;
    case 'patch': {
      const a = assetById(g, targetId);
      a.vuln = clamp(a.vuln - 2, 0, 5); a.hardening = clamp(a.hardening + 2, 0, 6);
      if (a.vuln === 0) a.patched = true;
      a.scanned = false; // intel Red usang
      logEvent(g, 'blue', `🩹 ${a.name} di-patch (vuln → ${a.vuln}).`); break;
    }
    case 'remediate': {
      const a = assetById(g, targetId);
      if (!b.hasBackup) { // refund
        b.ap += act.ap; b.budget += act.cost; b.used[act.id]--;
        return { ok: false, why: 'Butuh proses Backup dulu' };
      }
      a.compromised = false; a.disabled = false;
      a.hardening = clamp(a.hardening + 1, 0, 6);
      g.blue.threatIntel = clamp(g.blue.threatIntel + 3, 0, 100);
      logEvent(g, 'blue', `🧹 ${a.name} dibersihkan & dipulihkan dari kendali Red (+4 Threat Intel).`, 'detect');
      // cek apakah foothold Red hilang dari zona
      break;
    }
    case 'forensics': {
      const gain = 5 + Math.floor(rng() * 4);
      b.threatIntel = clamp(b.threatIntel + gain, 0, 100);
      let txt = `🔬 Investigasi forensik (+${gain} Threat Intel).`;
      // peluang ungkap aset ter-compromise yang belum diketahui -> info untuk pemain
      logEvent(g, 'blue', txt, 'detect'); break;
    }
    case 'budget': {
      // makin sering makin mungkin ditolak
      const since = b._lastBudgetRound ? (g.round - b._lastBudgetRound) : 99;
      const rejectP = since < 5 ? 0.5 : 0.1;
      b.cooldowns.budget = g.round + act.cooldown;
      b._lastBudgetRound = g.round;
      if (chance(rejectP)) {
        logEvent(g, 'blue', '💰 Permintaan anggaran DITOLAK manajemen (terlalu sering).', 'warn');
      } else {
        b.budget += 110;
        logEvent(g, 'blue', '💰 Anggaran disetujui (+$110).');
      }
      break;
    }
    case 'hire':
      b.staff += 1;
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
    case 'recruit':
      r.resMax += 2; r.resources += 2;
      logEvent(g, 'red', '🧑‍💻 Hacker baru direkrut (+2 resource).'); break;
    case 'osint':
      g.assets.filter(a => a.internetFacing).forEach(a => a.discovered = true);
      logEvent(g, 'red', '🔎 OSINT: aset internet-facing (DMZ) terungkap.'); break;
    case 'hostscan': {
      assetsInZone(g, targetId).forEach(a => a.discovered = true);
      logEvent(g, 'red', `📶 Host discovery di ${zoneName(targetId)} — aset terpetakan.`);
      rollDetection(g, targetId, 'Scan terdeteksi.'); break;
    }
    case 'portscan': {
      const a = assetById(g, targetId); a.scanned = true;
      logEvent(g, 'red', `🧭 ${a.name} di-scan — vuln ${a.vuln} terekspos.`);
      rollDetection(g, a.zone, 'Port scan terdeteksi.'); break;
    }
    case 'passwd':
    case 'exploit': {
      const a = assetById(g, targetId);
      const base = actId === 'exploit' ? 0.5 : 0.4;
      let p = base + a.vuln * 0.08 - a.hardening * 0.09;
      p = clamp(p + g.mod.redAtk, 0.05, 0.9);
      const detected = rollDetection(g, a.zone, actId === 'exploit' ? 'Eksploitasi terdeteksi.' : 'Serangan password terdeteksi.');
      if (chance(p)) {
        a.compromised = true;
        if (!g.red.foothold.includes(a.zone)) g.red.foothold.push(a.zone);
        logEvent(g, 'red', `💥 ${a.name} BERHASIL di-compromise!`, 'breach');
      } else {
        logEvent(g, 'red', `🛡️ Serangan ke ${a.name} gagal (hardening bertahan).`, 'warn');
      }
      break;
    }
    case 'phish': {
      const a = assetById(g, targetId);
      let p = 0.6 - (g.blue.hasAwareness ? 0.35 : 0) + g.mod.redAtk;
      p = clamp(p, 0.1, 0.8);
      const detected = g.blue.hasSiem && chance(0.2);
      if (detected) { g.blue.threatIntel = clamp(g.blue.threatIntel + 4, 0, 100);
        logEvent(g, 'blue', '🚨 Email phishing terdeteksi SIEM (+5 Threat Intel).', 'detect'); }
      if (chance(p)) {
        a.compromised = true; a.discovered = true; a.scanned = true;
        if (!g.red.foothold.includes('it')) g.red.foothold.push('it');
        logEvent(g, 'red', `🎣 Phishing sukses! ${a.name} jadi foothold di IT.`, 'breach');
      } else {
        logEvent(g, 'red', `🎣 Phishing ke ${a.name} gagal — karyawan tidak terpancing.`, 'warn');
      }
      break;
    }
    case 'usb': {
      const a = assetById(g, targetId);
      if (g.blue.hasSurveil && chance(0.5)) {
        g.blue.threatIntel = clamp(g.blue.threatIntel + 6, 0, 100);
        logEvent(g, 'blue', '🎥 CCTV menangkap upaya penanaman USB! (+8 Threat Intel). Serangan gagal.', 'detect');
        break;
      }
      let p = clamp(0.5 + a.vuln * 0.04 + g.mod.redAtk, 0.2, 0.78);
      if (chance(p)) {
        a.compromised = true; a.discovered = true; a.scanned = true;
        if (!g.red.foothold.includes('ot')) g.red.foothold.push('ot');
        logEvent(g, 'red', `🔌 USB berbahaya aktif! ${a.name} compromised — foothold langsung di OT!`, 'breach');
      } else {
        logEvent(g, 'red', `🔌 USB drop di ${a.name} gagal diaktifkan.`, 'warn');
      }
      break;
    }
    case 'pivot': {
      const z = targetId;
      const seg = g.segments[z] || 0;
      let p = clamp(0.72 - seg * 0.18 - (zoneOrder(z) - 1) * 0.08 + g.mod.redAtk, 0.1, 0.9);
      rollDetection(g, z, 'Lateral movement terdeteksi.');
      if (chance(p)) {
        if (!g.red.foothold.includes(z)) g.red.foothold.push(z);
        // beri 1 aset "pijakan" di zona itu agar reachable stabil: tandai discovered
        assetsInZone(g, z).forEach(a => a.discovered = true);
        logEvent(g, 'red', `↔️ Pivot sukses ke ${zoneName(z)} (tembus segmentasi).`, 'breach');
      } else {
        logEvent(g, 'red', `🚧 Pivot ke ${zoneName(z)} gagal — firewall internal bertahan.`, 'warn');
      }
      break;
    }
    case 'privesc': {
      const a = assetById(g, targetId);
      a.hardening = clamp(a.hardening - 1, 0, 6); // melemahkan pertahanan sisa
      logEvent(g, 'red', `⬆️ Privilege escalation di ${a.name} — kendali diperkuat.`); break;
    }
    case 'attackplc': {
      const a = assetById(g, targetId);
      let p = clamp(0.4 + a.vuln * 0.07 - a.hardening * 0.1 + g.mod.redAtk, 0.1, 0.8);
      rollDetection(g, 'ot', 'Serangan ke PLC terdeteksi!');
      if (chance(p)) {
        a.compromised = true;
        logEvent(g, 'red', `🏭 PLC ${a.name} DIKUASAI! Crown jewel jatuh!`, 'breach');
      } else {
        logEvent(g, 'red', `🏭 Serangan ke ${a.name} gagal — proteksi ICS bertahan.`, 'warn');
      }
      break;
    }
    case 'dos': {
      const a = assetById(g, targetId);
      a.disabled = true;
      const dmg = 10 + Math.floor(rng() * 8);
      g.blue.pl = clamp(g.blue.pl - dmg, 0, 100);
      logEvent(g, 'red', `🛑 DoS pada ${a.name} — operasi terganggu (P/L Blue -${dmg}).`, 'breach');
      break;
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
    // efek akhir giliran Blue: gaji & kerusakan dari compromise
    const salary = g.blue.staff * g.cfg.salaryPerStaff;
    const comp = compromisedAssets(g).length;
    const dmg = comp * g.cfg.plDamagePerCompromise;
    g.blue.pl = clamp(g.blue.pl - salary - dmg, 0, 100);
    if (g.blue.hasPolicies) g.blue.threatIntel = clamp(g.blue.threatIntel + 1, 0, 100);
    if (salary + dmg > 0) logEvent(g, 'blue', `📉 Akhir giliran: -${salary} gaji, -${dmg} dampak insiden (P/L ${g.blue.pl}).`, dmg?'warn':'info');
    g.turn = 'red';
    g.red.ap = g.red.apMax; g.red.resources = Math.min(g.red.resMax, g.red.resources + g.red.resMax);
  } else {
    g.turn = 'blue';
    g.round += 1;
    g.blue.ap = g.blue.apMax;
    checkEnd(g);
  }
  checkEnd(g);
}

/* --------------------------------------------------------------------------
 * Kondisi menang/kalah
 * ------------------------------------------------------------------------*/
function checkEnd(g) {
  if (g.phase === 'over') return;
  const jewels = crownJewels(g);
  const jewelsLost = jewels.every(a => a.compromised);
  if (jewelsLost) return finish(g, 'red', 'Red menguasai SEMUA PLC (crown jewels) di OT.');
  if (g.blue.pl <= 0) return finish(g, 'red', 'P/L Blue jatuh ke 0 — bisnis lumpuh.');
  if (g.blue.threatIntel >= 100) return finish(g, 'blue', 'Threat Intel 100% — Red teridentifikasi & ditangkap.');
  const allPatched = g.assets.every(a => a.patched || a.vuln === 0);
  const noneCompromised = compromisedAssets(g).length === 0;
  if (allPatched && noneCompromised && g.round > 3)
    return finish(g, 'blue', 'Seluruh kerentanan ditambal & tak ada aset dikuasai Red.');
  if (g.round > g.maxRounds) return finish(g, 'blue', `Bertahan ${g.maxRounds} ronde — Red kehabisan waktu.`);
}
function finish(g, winner, reason) {
  g.phase = 'over'; g.winner = winner; g.winReason = reason;
  logEvent(g, winner, `🏁 GAME OVER — ${winner === 'blue' ? 'BLUE' : 'RED'} MENANG: ${reason}`, 'end');
}

/* --------------------------------------------------------------------------
 * AI sederhana (heuristik) untuk sisi non-human
 * Mengembalikan daftar langkah {actId, targetId} untuk 1 giliran.
 * ------------------------------------------------------------------------*/
function aiPlanBlue(g) {
  const steps = [];
  return null; // (disediakan untuk kompatibilitas; logika nyata di aiNextBlueMove)
}

/* AI Blue: strategi berimbang — deteksi (menuju Threat Intel 100) + perlambat Red.
 * Dipanggil berulang oleh ui tiap langkah selama AP tersisa. */
function aiNextBlueMove(g) {
  const b = g.blue;
  if (b.ap <= 0) return null;
  const avail = (id) => blueActionAvailable(g, BLUE_ACTIONS.find(a => a.id === id)).ok;
  const comp = compromisedAssets(g);

  // 1. Fondasi wajib
  if (avail('policies')) return { actId: 'policies' };

  // 2. Darurat: ada PLC dikuasai → remediate secepatnya (hindari kalah)
  const plcComp = comp.find(a => a.crownJewel);
  if (plcComp) {
    if (!b.hasBackup && avail('backup')) return { actId: 'backup' };
    if (b.hasBackup && avail('remediate')) return { actId: 'remediate', targetId: plcComp.id };
  }

  // 3. Pasang IDS di OT lebih dulu (deteksi serangan crown-jewel), lalu IT, DMZ
  if (avail('ids')) {
    const z = ['ot', 'it', 'dmz'].find(z => !g.sensors[z]);
    if (z) return { actId: 'ids', targetId: z };
  }

  // 4. Amankan uang bila menipis sebelum belanja besar
  if (b.budget < 45 && avail('budget')) return { actId: 'budget' };

  // 5. Perlambat Red: keraskan PLC + aset OT. Hanya aset yang MASIH cukup rentan
  //    (vuln >= 2) agar anggaran tidak terkuras untuk patch berlebihan.
  if (avail('patch') && b.budget >= 60) {
    const cands = g.assets.filter(a => !a.patched && !a.compromised && a.vuln >= 2)
      .sort((x, y) => (y.crownJewel - x.crownJewel) ||
        ((zoneOrder(y.zone)) - (zoneOrder(x.zone))) ||
        (y.internetFacing - x.internetFacing) || (y.vuln - x.vuln));
    if (cands[0] && (cands[0].crownJewel || cands[0].vuln >= 3 || g.round < 8))
      return { actId: 'patch', targetId: cands[0].id };
  }

  // 6. Penguat deteksi & pertahanan berlapis
  if (avail('siem')) return { actId: 'siem' };
  if (avail('segment')) return { actId: 'segment' };

  // 7. Bersihkan aset non-PLC yang dikuasai Red
  if (comp.length) {
    if (!b.hasBackup && avail('backup')) return { actId: 'backup' };
    if (b.hasBackup && avail('remediate')) return { actId: 'remediate', targetId: comp[0].id };
  }

  // 8. Forensik agresif → dorong Threat Intel menuju 100% (jalur kemenangan utama).
  //    Sisakan sedikit dana cadangan agar tidak macet total.
  if (b.budget >= 18 && avail('forensics')) return { actId: 'forensics' };

  // 9. Jaga likuiditas: minta anggaran begitu menipis & tidak sedang cooldown
  if (b.budget < 70 && avail('budget')) return { actId: 'budget' };

  // 10. Pertahanan preventif sisa (bila dana cukup)
  if (b.budget >= 30) for (const id of ['awareness', 'surveil', 'firewall', 'inventory'])
    if (avail(id)) return { actId: id };

  // 11. Tambah staff bila kaya & kapasitas kurang
  if (b.budget > 180 && b.staff < 3 && avail('hire')) return { actId: 'hire' };
  return null;
}

/* AI Red: greedy menuju crown jewels */
function aiNextRedMove(g) {
  const r = g.red;
  if (r.ap <= 0) return null;
  const avail = (id) => redActionAvailable(g, RED_ACTIONS.find(a => a.id === id)).ok;
  const tgs = (id) => redTargets(g, RED_ACTIONS.find(a => a.id === id)) || [];
  const reach = reachableZones(g);

  // 0. sumber daya bila mentok
  if (r.resources < 2 && avail('recruit')) return { actId: 'recruit' };
  // 1. serang PLC bila bisa (prioritas kemenangan)
  if (reach.has('ot') && avail('attackplc')) {
    const t = tgs('attackplc')[0]; if (t) return { actId: 'attackplc', targetId: t.id };
  }
  // 2. OSINT awal
  if (avail('osint') && !r.used.osint) return { actId: 'osint' };
  // 3. jalur fisik/sosial cepat bila OT belum tersentuh & cyber jauh
  if (!reach.has('ot') && avail('usb') && tgs('usb').length && chance(0.4)) {
    return { actId: 'usb', targetId: tgs('usb')[0].id };
  }
  if (!reach.has('it') && avail('phish') && tgs('phish').length && chance(0.6)) {
    return { actId: 'phish', targetId: tgs('phish')[0].id };
  }
  // 4. pivot ke zona lebih dalam bila ada
  if (avail('pivot') && tgs('pivot').length) {
    // pilih zona terdalam yang bisa dipivot
    const t = tgs('pivot').sort((a,b)=>zoneOrder(b.id)-zoneOrder(a.id))[0];
    return { actId: 'pivot', targetId: t.id };
  }
  // 5. exploit aset yang sudah discan (utamakan terdalam / crown)
  if (avail('exploit') && tgs('exploit').length) {
    const t = tgs('exploit').map(x => assetById(g, x.id))
      .sort((a, b) => (b.crownJewel - a.crownJewel) || (zoneOrder(b.zone) - zoneOrder(a.zone)) || (b.vuln - a.vuln))[0];
    return { actId: 'exploit', targetId: t.id };
  }
  // 6. scan aset yang sudah ditemukan
  if (avail('portscan') && tgs('portscan').length) {
    const t = tgs('portscan').map(x => assetById(g, x.id))
      .sort((a, b) => (zoneOrder(b.zone) - zoneOrder(a.zone)))[0];
    return { actId: 'portscan', targetId: t.id };
  }
  // 7. host discovery di zona terjangkau terdalam
  if (avail('hostscan') && tgs('hostscan').length) {
    const t = tgs('hostscan').sort((a,b)=>zoneOrder(b.id)-zoneOrder(a.id))[0];
    return { actId: 'hostscan', targetId: t.id };
  }
  // 8. password attack sebagai alternatif
  if (avail('passwd') && tgs('passwd').length) {
    return { actId: 'passwd', targetId: tgs('passwd')[0].id };
  }
  // 9. Tekan P/L lewat DoS bila punya pijakan & jalur PLC belum terbuka
  if (avail('dos') && tgs('dos').length) {
    const live = tgs('dos').map(x => assetById(g, x.id)).filter(a => !a.disabled);
    if (live.length && (g.blue.pl < 65 || !reach.has('ot')) && chance(0.55)) {
      const t = live.sort((a, b) => zoneOrder(b.zone) - zoneOrder(a.zone))[0];
      return { actId: 'dos', targetId: t.id };
    }
  }
  // 10. recruit bila ada sisa
  if (avail('recruit')) return { actId: 'recruit' };
  return null;
}

/* expose */
if (typeof module !== 'undefined') {
  module.exports = {
    createGame, doBlueAction, doRedAction, endTurn, checkEnd,
    blueActionAvailable, redActionAvailable, blueTargets, redTargets,
    aiNextBlueMove, aiNextRedMove, reachableZones, compromisedAssets,
    assetById, assetsInZone, zoneName, logEvent,
  };
}
