/* ============================================================================
 * CyberClash: Red vs Blue  —  data.js
 * Definisi statis: topologi jaringan, aset, dan katalog aksi (kartu).
 * Terinspirasi oleh ThreatGEN: Red vs. Blue (replika edukatif, non-komersial).
 * ==========================================================================*/

'use strict';

/* ---- Zona jaringan (urut dari luar ke dalam) ---------------------------- */
const ZONES = [
  { id: 'internet', name: 'Internet',        order: 0, color: '#6b7280' },
  { id: 'dmz',      name: 'DMZ',             order: 1, color: '#f59e0b' },
  { id: 'it',       name: 'Corporate / IT',  order: 2, color: '#3b82f6' },
  { id: 'ot',       name: 'OT / ICS',        order: 3, color: '#10b981' },
];

/* ---- Template aset dalam jaringan --------------------------------------
 * type: workstation | server | security | network | ics
 * crownJewel: target kemenangan Red (PLC)
 * internetFacing: bisa diintai lewat OSINT di awal
 * -------------------------------------------------------------------------*/
const ASSET_TEMPLATES = [
  // DMZ
  { id: 'GATEWAYFW',   name: 'Gateway Firewall', zone: 'dmz', type: 'network',  internetFacing: true,  baseVuln: 2 },
  { id: 'VPNSECCOM',   name: 'VPN Gateway',      zone: 'dmz', type: 'network',  internetFacing: true,  baseVuln: 3 },
  { id: 'WEBSERVER',   name: 'Web Server',       zone: 'dmz', type: 'server',   internetFacing: true,  baseVuln: 4 },
  // IT
  { id: 'MAILSERVER',  name: 'Mail Server',      zone: 'it',  type: 'server',   internetFacing: false, baseVuln: 3 },
  { id: 'WKS01',       name: 'Workstation A',    zone: 'it',  type: 'workstation', internetFacing: false, baseVuln: 5 },
  { id: 'WKS02',       name: 'Workstation B',    zone: 'it',  type: 'workstation', internetFacing: false, baseVuln: 5 },
  { id: 'ADSERVER',    name: 'Domain Controller',zone: 'it',  type: 'server',   internetFacing: false, baseVuln: 3 },
  { id: 'SPLUNKSERVER',name: 'SIEM Server',      zone: 'it',  type: 'security', internetFacing: false, baseVuln: 2, baseHard: 2 },
  // OT
  { id: 'HISTORIAN',   name: 'Data Historian',   zone: 'ot',  type: 'server',   internetFacing: false, baseVuln: 4 },
  { id: 'HMI01',       name: 'HMI Console',      zone: 'ot',  type: 'workstation', internetFacing: false, baseVuln: 4 },
  { id: 'PLC01',       name: 'PLC — Pump Ctrl',  zone: 'ot',  type: 'ics',      internetFacing: false, baseVuln: 3, baseHard: 2, crownJewel: true },
  { id: 'PLC02',       name: 'PLC — Valve Ctrl', zone: 'ot',  type: 'ics',      internetFacing: false, baseVuln: 3, baseHard: 2, crownJewel: true },
];

/* ---- Katalog aksi BLUE --------------------------------------------------
 * ap: action points, cost: uang, staff: staff dibutuhkan (sementara saat giliran)
 * once: hanya bisa 1x; cooldown: giliran jeda; req: prasyarat aksi lain
 * -------------------------------------------------------------------------*/
const BLUE_ACTIONS = [
  { id: 'policies',   name: 'Kebijakan & Prosedur', icon: '📋', ap: 1, cost: 20,  staff: 1, once: true,
    desc: 'Fondasi program keamanan. Membuka banyak aksi lanjutan & +2 Threat Intel/giliran pasif.' },
  { id: 'inventory',  name: 'Inventaris Aset',       icon: '🗂️', ap: 1, cost: 15,  staff: 1, once: true, req: 'policies',
    desc: 'Memetakan seluruh aset. Memperlambat recon Red & syarat untuk patch massal.' },
  { id: 'firewall',   name: 'Perkuat Gateway FW',    icon: '🧱', ap: 1, cost: 40,  staff: 1, req: 'policies',
    desc: 'Menaikkan hardening semua aset DMZ. Mempersulit breach perimeter.' },
  { id: 'segment',    name: 'Segmentasi Jaringan',   icon: '🚧', ap: 2, cost: 60,  staff: 1, req: 'policies',
    desc: 'Pasang firewall internal antar-zona. Red butuh breach ekstra untuk pivot.' },
  { id: 'ids',        name: 'Pasang Sensor IDS',     icon: '📡', ap: 1, cost: 35,  staff: 1, req: 'policies', target: 'zone',
    desc: 'Deteksi serangan di satu zona. Serangan Red di zona itu berpeluang terdeteksi → Threat Intel.' },
  { id: 'siem',       name: 'Deploy SIEM',           icon: '🛰️', ap: 2, cost: 70,  staff: 2, once: true, req: 'policies',
    desc: 'Korelasi log pusat. Meningkatkan peluang deteksi semua sensor +25%.' },
  { id: 'awareness',  name: 'Pelatihan Awareness',   icon: '🎓', ap: 1, cost: 25,  staff: 1, req: 'policies',
    desc: 'Menurunkan peluang sukses phishing & social engineering Red secara signifikan.' },
  { id: 'surveil',    name: 'CCTV & Akses Fisik',    icon: '🎥', ap: 1, cost: 30,  staff: 1, req: 'policies',
    desc: 'Deteksi & cegah serangan fisik (USB drop, badge clone) Red.' },
  { id: 'backup',     name: 'Proses Backup',         icon: '💾', ap: 1, cost: 30,  staff: 1, once: true, req: 'policies',
    desc: 'Memungkinkan restore aset ter-compromise dengan cepat (pulihkan P/L).' },
  { id: 'patch',      name: 'Patch Kerentanan',      icon: '🩹', ap: 1, cost: 20,  staff: 1, target: 'asset',
    desc: 'Menambal 1 aset: hardening naik, vuln turun. Patch semua vuln = syarat kemenangan.' },
  { id: 'remediate',  name: 'Bersihkan / Remediate', icon: '🧹', ap: 2, cost: 45,  staff: 2, target: 'compromised',
    desc: 'Usir Red dari 1 aset ter-compromise (butuh Backup). Mengembalikan kendali.' },
  { id: 'forensics',  name: 'Forensik & IR',         icon: '🔬', ap: 1, cost: 18,  staff: 1, req: 'policies',
    desc: 'Investigasi insiden: +Threat Intel besar & peluang ungkap jejak Red.' },
  { id: 'budget',     name: 'Minta Anggaran',        icon: '💰', ap: 1, cost: 0,   staff: 0, cooldown: 5,
    desc: 'Ajukan dana ke manajemen (+$110). Terlalu sering diminta → berpeluang ditolak.' },
  { id: 'hire',       name: 'Rekrut Staff',          icon: '🧑‍💼', ap: 1, cost: 50,  staff: 0,
    desc: 'Tambah 1 staff permanen (kapasitas aksi/giliran). Biaya gaji menekan P/L tiap giliran.' },
];

/* ---- Katalog aksi RED ---------------------------------------------------
 * Vektor: cyber | physical | social
 * -------------------------------------------------------------------------*/
const RED_ACTIONS = [
  { id: 'recruit',    name: 'Rekrut Hacker',         icon: '🧑‍💻', ap: 1, res: 0,  vector: 'cyber',
    desc: '+2 Hacker Resources permanen (kapasitas aksi tiap giliran).' },
  { id: 'osint',      name: 'OSINT Recon',           icon: '🔎', ap: 1, res: 1,  vector: 'cyber', once: true,
    desc: 'Ungkap seluruh aset yang menghadap internet (DMZ). Titik awal serangan.' },
  { id: 'hostscan',   name: 'Host Discovery',        icon: '📶', ap: 1, res: 1,  vector: 'cyber', target: 'reachZone',
    desc: 'Temukan aset-aset di zona yang sudah terjangkau foothold.' },
  { id: 'portscan',   name: 'Port & Service Scan',   icon: '🧭', ap: 1, res: 1,  vector: 'cyber', target: 'knownAsset',
    desc: 'Enumerasi layanan 1 aset → ungkap kerentanan yang bisa dieksploitasi.' },
  { id: 'passwd',     name: 'Serangan Password',     icon: '🔑', ap: 1, res: 2,  vector: 'cyber', target: 'scannedAsset',
    desc: 'Brute-force / credential stuffing. Peluang compromise aset dengan vuln tinggi.' },
  { id: 'exploit',    name: 'Eksploitasi Vuln',      icon: '💥', ap: 2, res: 2,  vector: 'cyber', target: 'scannedAsset',
    desc: 'Eksploitasi kerentanan yang ditemukan → compromise aset (peluang ∝ vuln & hardening).' },
  { id: 'phish',      name: 'Spearphishing',         icon: '🎣', ap: 1, res: 2,  vector: 'social', target: 'itWorkstation',
    desc: 'Email bertarget ke workstation IT. Sukses = foothold langsung di IT (abai perimeter).' },
  { id: 'usb',        name: 'Buat & Drop USB',       icon: '🔌', ap: 2, res: 2,  vector: 'physical', target: 'otWorkstation',
    desc: 'Serangan fisik: tanam USB berbahaya di area OT. Bisa langsung foothold di OT.' },
  { id: 'pivot',      name: 'Pivot / Lateral',       icon: '↔️', ap: 2, res: 2,  vector: 'cyber', target: 'pivotZone',
    desc: 'Dari zona yang dikuasai, tembus firewall internal ke zona berikutnya.' },
  { id: 'privesc',    name: 'Privilege Escalation',  icon: '⬆️', ap: 1, res: 1,  vector: 'cyber', target: 'ownedAsset',
    desc: 'Naikkan hak akses di aset yang dikuasai → perkuat foothold & peluang pivot.' },
  { id: 'attackplc',  name: 'Serang PLC (Crown)',    icon: '🏭', ap: 2, res: 3,  vector: 'cyber', target: 'plc',
    desc: 'Serangan ke PLC OT. Compromise kedua PLC = KEMENANGAN RED.' },
  { id: 'dos',        name: 'Denial of Service',     icon: '🛑', ap: 2, res: 2,  vector: 'cyber', target: 'ownedAsset',
    desc: 'Lumpuhkan aset yang dikuasai → turunkan P/L Blue drastis (sabotase).' },
];

/* ---- Konfigurasi default game ------------------------------------------ */
const GAME_CONFIG = {
  maxRounds: 75,
  blue: { budget: 220, staff: 2, pl: 100, threatIntel: 0, apPerTurn: 3 },
  red:  { resources: 3, apPerTurn: 3 },
  salaryPerStaff: 1,        // tekanan P/L tiap giliran Blue
  plDamagePerCompromise: 5, // kerusakan P/L pasif per aset ter-compromise tiap giliran
};

if (typeof module !== 'undefined') {
  module.exports = { ZONES, ASSET_TEMPLATES, BLUE_ACTIONS, RED_ACTIONS, GAME_CONFIG };
}
