/* ============================================================================
 * CyberClash: Red vs Blue  —  data.js
 * Definisi statis: KATALOG SKENARIO (banyak peta jaringan bertema) + katalog aksi.
 * Terinspirasi oleh ThreatGEN: Red vs. Blue (replika edukatif, non-komersial).
 * ==========================================================================*/

'use strict';

/* ---- Palet warna zona (dipakai lintas skenario) ------------------------ */
const ZCOL = {
  internet: '#6b7280', perimeter: '#f59e0b', it: '#3b82f6', corp: '#3b82f6',
  ot: '#10b981', deep: '#a855f7', safety: '#ef4444', field: '#14b8a6',
};

/* ---- KATALOG SKENARIO ---------------------------------------------------
 * Setiap skenario = satu peta jaringan linier: zones[0] SELALU 'internet',
 * urutan array = kedalaman (perimeter → makin dalam). Red harus menembus
 * zona demi zona hingga menguasai seluruh crownJewel.
 *
 * asset: { id, name, zone, type, baseVuln(0-5), baseHard(0-6),
 *          internetFacing?, crownJewel? }
 * type : workstation | server | security | network | ics
 * start: override sumber daya awal (opsional)
 * ------------------------------------------------------------------------*/
const SCENARIOS = [
  /* 1 ───────────────────────────── INTRO ─────────────────────────────── */
  {
    id: 'smb', tier: 'intro', icon: '🏢',
    name: 'Kantor UKM',
    summary: 'Jaringan kecil 2 lapis. Cocok untuk belajar dasar. Target: server berkas perusahaan.',
    threat: 'Geng ransomware oportunis mengincar data & backup Anda.',
    maxRounds: 60,
    start: { blue: { budget: 180, staff: 2 }, red: { resources: 3 } },
    zones: [
      { id: 'internet',  name: 'Internet',     color: ZCOL.internet },
      { id: 'perimeter', name: 'Perimeter',    color: ZCOL.perimeter },
      { id: 'lan',       name: 'Office LAN',    color: ZCOL.corp },
    ],
    assets: [
      { id: 'EDGEFW',   name: 'Edge Firewall',   zone: 'perimeter', type: 'network', internetFacing: true, baseVuln: 3 },
      { id: 'WEBSITE',  name: 'Company Website',  zone: 'perimeter', type: 'server',  internetFacing: true, baseVuln: 4 },
      { id: 'WKSA',     name: 'Workstation A',    zone: 'lan', type: 'workstation', baseVuln: 5 },
      { id: 'WKSB',     name: 'Workstation B',    zone: 'lan', type: 'workstation', baseVuln: 5 },
      { id: 'NAS',      name: 'NAS Backup',       zone: 'lan', type: 'server', baseVuln: 4, baseHard: 1, crownJewel: true },
      { id: 'FILESRV',  name: 'File & DB Server', zone: 'lan', type: 'server', baseVuln: 4, baseHard: 1, crownJewel: true },
    ],
  },

  /* 2 ─────────────────────────── STANDARD ────────────────────────────── */
  {
    id: 'water', tier: 'standard', icon: '💧',
    name: 'Instalasi Air Minum (ICS)',
    summary: 'OT klasik 4 lapis (DMZ→IT→OT). Target: dua PLC pengendali pompa & katup.',
    threat: 'Kelompok APT menargetkan proses fisik pengolahan air.',
    maxRounds: 75,
    start: { blue: { budget: 220, staff: 2 }, red: { resources: 4 } },
    zones: [
      { id: 'internet', name: 'Internet',       color: ZCOL.internet },
      { id: 'dmz',      name: 'DMZ',            color: ZCOL.perimeter },
      { id: 'it',       name: 'Corporate / IT', color: ZCOL.it },
      { id: 'ot',       name: 'OT / ICS',       color: ZCOL.ot },
    ],
    assets: [
      { id: 'GATEWAYFW',   name: 'Gateway Firewall', zone: 'dmz', type: 'network', internetFacing: true, baseVuln: 2 },
      { id: 'VPNSECCOM',   name: 'VPN Gateway',      zone: 'dmz', type: 'network', internetFacing: true, baseVuln: 3 },
      { id: 'WEBSERVER',   name: 'Web Server',       zone: 'dmz', type: 'server',  internetFacing: true, baseVuln: 4 },
      { id: 'MAILSERVER',  name: 'Mail Server',      zone: 'it',  type: 'server',  baseVuln: 3 },
      { id: 'WKS01',       name: 'Workstation A',    zone: 'it',  type: 'workstation', baseVuln: 5 },
      { id: 'WKS02',       name: 'Workstation B',    zone: 'it',  type: 'workstation', baseVuln: 5 },
      { id: 'ADSERVER',    name: 'Domain Controller',zone: 'it',  type: 'server',  baseVuln: 3 },
      { id: 'SPLUNKSERVER',name: 'SIEM Server',      zone: 'it',  type: 'security', baseVuln: 2, baseHard: 2 },
      { id: 'HISTORIAN',   name: 'Data Historian',   zone: 'ot',  type: 'server',  baseVuln: 4 },
      { id: 'HMI01',       name: 'HMI Console',      zone: 'ot',  type: 'workstation', baseVuln: 4 },
      { id: 'PLC01',       name: 'PLC — Pump Ctrl',  zone: 'ot',  type: 'ics', baseVuln: 3, baseHard: 1, crownJewel: true },
      { id: 'PLC02',       name: 'PLC — Valve Ctrl', zone: 'ot',  type: 'ics', baseVuln: 3, baseHard: 1, crownJewel: true },
    ],
  },

  /* 3 ─────────────────────────── STANDARD ────────────────────────────── */
  {
    id: 'corp', tier: 'standard', icon: '🏦',
    name: 'Korporat Enterprise',
    summary: 'IT murni 4 lapis dengan Data Center. Target: database Finansial & HR.',
    threat: 'Aktor finansial mengejar exfiltrasi data keuangan & PII karyawan.',
    maxRounds: 75,
    start: { blue: { budget: 230, staff: 3 }, red: { resources: 3 } },
    zones: [
      { id: 'internet', name: 'Internet',      color: ZCOL.internet },
      { id: 'dmz',      name: 'DMZ',           color: ZCOL.perimeter },
      { id: 'corp',     name: 'Corporate LAN', color: ZCOL.it },
      { id: 'dc',       name: 'Data Center',   color: ZCOL.deep },
    ],
    assets: [
      { id: 'GATEWAYFW', name: 'Gateway Firewall', zone: 'dmz', type: 'network', internetFacing: true, baseVuln: 2 },
      { id: 'WEBSRV',    name: 'Web Portal',       zone: 'dmz', type: 'server',  internetFacing: true, baseVuln: 4 },
      { id: 'VPN',       name: 'VPN Gateway',      zone: 'dmz', type: 'network', internetFacing: true, baseVuln: 3 },
      { id: 'WKS01',     name: 'Workstation A',    zone: 'corp', type: 'workstation', baseVuln: 5 },
      { id: 'WKS02',     name: 'Workstation B',    zone: 'corp', type: 'workstation', baseVuln: 5 },
      { id: 'WKS03',     name: 'Workstation C',    zone: 'corp', type: 'workstation', baseVuln: 5 },
      { id: 'ADSERVER',  name: 'Domain Controller',zone: 'corp', type: 'server',  baseVuln: 3 },
      { id: 'MAILSRV',   name: 'Mail Server',      zone: 'corp', type: 'server',  baseVuln: 3 },
      { id: 'SIEM',      name: 'SIEM Server',      zone: 'dc', type: 'security', baseVuln: 2, baseHard: 2 },
      { id: 'BACKUPSRV', name: 'Backup Server',    zone: 'dc', type: 'server',  baseVuln: 3 },
      { id: 'FINANCEDB', name: 'Finance Database', zone: 'dc', type: 'server',  baseVuln: 3, baseHard: 2, crownJewel: true },
      { id: 'HRDB',      name: 'HR / PII Database', zone: 'dc', type: 'server', baseVuln: 3, baseHard: 2, crownJewel: true },
    ],
  },

  /* 4 ─────────────────────────── ADVANCED ────────────────────────────── */
  {
    id: 'hospital', tier: 'advanced', icon: '🏥',
    name: 'Rumah Sakit (IoMT)',
    summary: '4 lapis: klinis IT + perangkat medis. Target: rekam medis (EHR) & server PACS.',
    threat: 'Ransomware kesehatan mengancam data pasien & alat medis terhubung.',
    maxRounds: 80,
    start: { blue: { budget: 230, staff: 3 }, red: { resources: 4 } },
    zones: [
      { id: 'internet', name: 'Internet',        color: ZCOL.internet },
      { id: 'dmz',      name: 'DMZ',             color: ZCOL.perimeter },
      { id: 'clinit',   name: 'Clinical IT',     color: ZCOL.it },
      { id: 'meddev',   name: 'Medical Devices', color: ZCOL.deep },
    ],
    assets: [
      { id: 'GATEWAYFW', name: 'Gateway Firewall',  zone: 'dmz', type: 'network', internetFacing: true, baseVuln: 2 },
      { id: 'PORTAL',    name: 'Patient Portal',     zone: 'dmz', type: 'server',  internetFacing: true, baseVuln: 4 },
      { id: 'VPN',       name: 'VPN Gateway',        zone: 'dmz', type: 'network', internetFacing: true, baseVuln: 3 },
      { id: 'WKSNURSE',  name: 'Nurse Workstation',  zone: 'clinit', type: 'workstation', baseVuln: 5 },
      { id: 'WKSADMIN',  name: 'Admin Workstation',  zone: 'clinit', type: 'workstation', baseVuln: 5 },
      { id: 'ADSERVER',  name: 'Domain Controller',  zone: 'clinit', type: 'server',  baseVuln: 3 },
      { id: 'SIEM',      name: 'SIEM Server',        zone: 'clinit', type: 'security', baseVuln: 2, baseHard: 2 },
      { id: 'EHRDB',     name: 'EHR Database',       zone: 'clinit', type: 'server',  baseVuln: 3, baseHard: 2, crownJewel: true },
      { id: 'PACS',      name: 'PACS Imaging Server',zone: 'meddev', type: 'server',  baseVuln: 4, baseHard: 1, crownJewel: true },
      { id: 'INFUSION1', name: 'Infusion Pump 1',    zone: 'meddev', type: 'ics', baseVuln: 5 },
      { id: 'INFUSION2', name: 'Infusion Pump 2',    zone: 'meddev', type: 'ics', baseVuln: 5 },
      { id: 'MONITOR1',  name: 'Patient Monitor',    zone: 'meddev', type: 'workstation', baseVuln: 4 },
    ],
  },

  /* 5 ─────────────────────────── ADVANCED ────────────────────────────── */
  {
    id: 'factory', tier: 'advanced', icon: '🏭',
    name: 'Pabrik Manufaktur',
    summary: '5 lapis mendalam: IT → sel produksi OT → sistem keselamatan (SIS). Target: PLC robot & SIS.',
    threat: 'Sabotase industri menargetkan lini produksi dan sistem keselamatan.',
    maxRounds: 85,
    start: { blue: { budget: 250, staff: 3 }, red: { resources: 5 } },
    zones: [
      { id: 'internet', name: 'Internet',       color: ZCOL.internet },
      { id: 'dmz',      name: 'DMZ',            color: ZCOL.perimeter },
      { id: 'ent',      name: 'Enterprise IT',  color: ZCOL.it },
      { id: 'cell',     name: 'Production OT',   color: ZCOL.ot },
      { id: 'sis',      name: 'Safety (SIS)',    color: ZCOL.safety },
    ],
    assets: [
      { id: 'GATEWAYFW', name: 'Gateway Firewall', zone: 'dmz', type: 'network', internetFacing: true, baseVuln: 2 },
      { id: 'VPN',       name: 'VPN Gateway',      zone: 'dmz', type: 'network', internetFacing: true, baseVuln: 3 },
      { id: 'WEBSRV',    name: 'Web Server',       zone: 'dmz', type: 'server',  internetFacing: true, baseVuln: 4 },
      { id: 'WKS01',     name: 'Workstation A',    zone: 'ent', type: 'workstation', baseVuln: 5 },
      { id: 'WKS02',     name: 'Workstation B',    zone: 'ent', type: 'workstation', baseVuln: 5 },
      { id: 'MES',       name: 'MES Server',       zone: 'ent', type: 'server',  baseVuln: 3 },
      { id: 'ADSERVER',  name: 'Domain Controller',zone: 'ent', type: 'server',  baseVuln: 3 },
      { id: 'SIEM',      name: 'SIEM Server',      zone: 'ent', type: 'security', baseVuln: 2, baseHard: 2 },
      { id: 'HMI01',     name: 'HMI Line 1',       zone: 'cell', type: 'workstation', baseVuln: 4 },
      { id: 'HMI02',     name: 'HMI Line 2',       zone: 'cell', type: 'workstation', baseVuln: 4 },
      { id: 'HISTORIAN', name: 'Process Historian',zone: 'cell', type: 'server',  baseVuln: 4 },
      { id: 'PLCROBOT',  name: 'PLC — Robot Cell', zone: 'cell', type: 'ics', baseVuln: 3, baseHard: 1, crownJewel: true },
      { id: 'SAFEWKS',   name: 'Safety Eng. WKS',  zone: 'sis', type: 'workstation', baseVuln: 4 },
      { id: 'SISCTRL',   name: 'SIS Controller',   zone: 'sis', type: 'ics', baseVuln: 3, baseHard: 2, crownJewel: true },
      { id: 'SAFETYPLC', name: 'Safety PLC',       zone: 'sis', type: 'ics', baseVuln: 3, baseHard: 2, crownJewel: true },
    ],
  },

  /* 6 ──────────────────────────── EXPERT ─────────────────────────────── */
  {
    id: 'grid', tier: 'expert', icon: '⚡',
    name: 'Jaringan Listrik (SCADA)',
    summary: '5 lapis luas: IT → pusat kendali SCADA → gardu lapangan. Target: SCADA master, relay proteksi, PLC lapangan.',
    threat: 'Operasi negara-bangsa mengincar pemadaman lewat SCADA & gardu induk.',
    maxRounds: 90,
    start: { blue: { budget: 260, staff: 4 }, red: { resources: 4 } },
    zones: [
      { id: 'internet', name: 'Internet',          color: ZCOL.internet },
      { id: 'dmz',      name: 'DMZ',               color: ZCOL.perimeter },
      { id: 'corpit',   name: 'Corporate IT',      color: ZCOL.it },
      { id: 'scada',    name: 'SCADA Control Ctr',  color: ZCOL.ot },
      { id: 'sub',      name: 'Field Substation',   color: ZCOL.field },
    ],
    assets: [
      { id: 'GATEWAYFW', name: 'Gateway Firewall', zone: 'dmz', type: 'network', internetFacing: true, baseVuln: 2 },
      { id: 'VPN',       name: 'VPN Gateway',      zone: 'dmz', type: 'network', internetFacing: true, baseVuln: 3 },
      { id: 'WEBSRV',    name: 'Web Server',       zone: 'dmz', type: 'server',  internetFacing: true, baseVuln: 4 },
      { id: 'WKS01',     name: 'Workstation A',    zone: 'corpit', type: 'workstation', baseVuln: 5 },
      { id: 'WKS02',     name: 'Workstation B',    zone: 'corpit', type: 'workstation', baseVuln: 5 },
      { id: 'ADSERVER',  name: 'Domain Controller',zone: 'corpit', type: 'server',  baseVuln: 3 },
      { id: 'MAILSRV',   name: 'Mail Server',      zone: 'corpit', type: 'server',  baseVuln: 3 },
      { id: 'SIEM',      name: 'SIEM Server',      zone: 'corpit', type: 'security', baseVuln: 2, baseHard: 2 },
      { id: 'HMIOP1',    name: 'HMI Operator 1',   zone: 'scada', type: 'workstation', baseVuln: 4 },
      { id: 'HMIOP2',    name: 'HMI Operator 2',   zone: 'scada', type: 'workstation', baseVuln: 4 },
      { id: 'HISTORIAN', name: 'SCADA Historian',  zone: 'scada', type: 'server',  baseVuln: 4 },
      { id: 'EMS',       name: 'Energy Mgmt System',zone: 'scada', type: 'server', baseVuln: 3, baseHard: 1 },
      { id: 'SCADAMAST', name: 'SCADA Master',     zone: 'scada', type: 'ics', baseVuln: 3, baseHard: 2, crownJewel: true },
      { id: 'RTU01',     name: 'RTU 1',            zone: 'sub', type: 'ics', baseVuln: 4 },
      { id: 'RTU02',     name: 'RTU 2',            zone: 'sub', type: 'ics', baseVuln: 4 },
      { id: 'PROTRELAY', name: 'Protective Relay', zone: 'sub', type: 'ics', baseVuln: 3, baseHard: 2, crownJewel: true },
      { id: 'FIELDPLC',  name: 'Field PLC',        zone: 'sub', type: 'ics', baseVuln: 3, baseHard: 2, crownJewel: true },
    ],
  },

  /* 7 ──────────────────────────── EXPERT ─────────────────────────────── */
  {
    id: 'pipeline', tier: 'expert', icon: '🛢️',
    name: 'Pipa Minyak & Gas',
    summary: '6 lapis paling kompleks: IT → control room → situs pompa jarak jauh → ESD safety. Target: SCADA, RTU pompa, sistem shutdown darurat.',
    threat: 'Ancaman gabungan: pencurian data korporat + sabotase operasi pipa jarak jauh.',
    maxRounds: 100,
    start: { blue: { budget: 280, staff: 4 }, red: { resources: 5 } },
    zones: [
      { id: 'internet', name: 'Internet',        color: ZCOL.internet },
      { id: 'dmz',      name: 'DMZ',             color: ZCOL.perimeter },
      { id: 'corp',     name: 'Corporate IT',    color: ZCOL.it },
      { id: 'ctrl',     name: 'Control Room',    color: ZCOL.ot },
      { id: 'remote',   name: 'Remote Pump Site', color: ZCOL.field },
      { id: 'esd',      name: 'ESD Safety',       color: ZCOL.safety },
    ],
    assets: [
      { id: 'GATEWAYFW', name: 'Gateway Firewall', zone: 'dmz', type: 'network', internetFacing: true, baseVuln: 2 },
      { id: 'VPN',       name: 'VPN Gateway',      zone: 'dmz', type: 'network', internetFacing: true, baseVuln: 3 },
      { id: 'WEBSRV',    name: 'Web Server',       zone: 'dmz', type: 'server',  internetFacing: true, baseVuln: 4 },
      { id: 'JUMPHOST',  name: 'Jump Host',        zone: 'dmz', type: 'server',  internetFacing: true, baseVuln: 3, baseHard: 1 },
      { id: 'WKS01',     name: 'Workstation A',    zone: 'corp', type: 'workstation', baseVuln: 5 },
      { id: 'WKS02',     name: 'Workstation B',    zone: 'corp', type: 'workstation', baseVuln: 5 },
      { id: 'WKS03',     name: 'Workstation C',    zone: 'corp', type: 'workstation', baseVuln: 5 },
      { id: 'ADSERVER',  name: 'Domain Controller',zone: 'corp', type: 'server',  baseVuln: 3 },
      { id: 'MAILSRV',   name: 'Mail Server',      zone: 'corp', type: 'server',  baseVuln: 3 },
      { id: 'SIEM',      name: 'SIEM Server',      zone: 'corp', type: 'security', baseVuln: 2, baseHard: 2 },
      { id: 'HMI01',     name: 'HMI Console 1',    zone: 'ctrl', type: 'workstation', baseVuln: 4 },
      { id: 'HMI02',     name: 'HMI Console 2',    zone: 'ctrl', type: 'workstation', baseVuln: 4 },
      { id: 'HISTORIAN', name: 'Process Historian',zone: 'ctrl', type: 'server',  baseVuln: 4 },
      { id: 'SCADAMAST', name: 'SCADA Master',     zone: 'ctrl', type: 'ics', baseVuln: 3, baseHard: 2, crownJewel: true },
      { id: 'HMIFIELD',  name: 'Field HMI',        zone: 'remote', type: 'workstation', baseVuln: 4 },
      { id: 'FLOWPLC',   name: 'Flow Control PLC', zone: 'remote', type: 'ics', baseVuln: 4, baseHard: 1 },
      { id: 'RTUPUMP',   name: 'RTU — Pump',       zone: 'remote', type: 'ics', baseVuln: 3, baseHard: 2, crownJewel: true },
      { id: 'ESDSIS',    name: 'ESD Safety System',zone: 'esd', type: 'ics', baseVuln: 3, baseHard: 3, crownJewel: true },
    ],
  },
];

/* ---- Katalog aksi BLUE -------------------------------------------------- */
const BLUE_ACTIONS = [
  { id: 'policies',   name: 'Kebijakan & Prosedur', icon: '📋', ap: 1, cost: 20,  staff: 1, once: true,
    desc: 'Fondasi program keamanan. Membuka banyak aksi lanjutan & +1 Threat Intel/giliran pasif.' },
  { id: 'inventory',  name: 'Inventaris Aset',       icon: '🗂️', ap: 1, cost: 15,  staff: 1, once: true, req: 'policies',
    desc: 'Memetakan seluruh aset. Memperlambat recon Red.' },
  { id: 'firewall',   name: 'Perkuat Perimeter FW',  icon: '🧱', ap: 1, cost: 40,  staff: 1, req: 'policies',
    desc: 'Menaikkan hardening semua aset zona perimeter. Mempersulit breach awal.' },
  { id: 'segment',    name: 'Segmentasi Jaringan',   icon: '🚧', ap: 2, cost: 60,  staff: 1, req: 'policies',
    desc: 'Pasang firewall internal antar-zona. Red butuh usaha ekstra untuk pivot.' },
  { id: 'ids',        name: 'Pasang Sensor IDS',     icon: '📡', ap: 1, cost: 35,  staff: 1, req: 'policies', target: 'zone',
    desc: 'Deteksi serangan di satu zona. Serangan Red di zona itu berpeluang terdeteksi → Threat Intel.' },
  { id: 'siem',       name: 'Deploy SIEM',           icon: '🛰️', ap: 2, cost: 70,  staff: 2, once: true, req: 'policies',
    desc: 'Korelasi log pusat. Meningkatkan peluang deteksi semua sensor +25%.' },
  { id: 'awareness',  name: 'Pelatihan Awareness',   icon: '🎓', ap: 1, cost: 25,  staff: 1, req: 'policies',
    desc: 'Menurunkan peluang sukses phishing & social engineering Red secara signifikan.' },
  { id: 'surveil',    name: 'CCTV & Akses Fisik',    icon: '🎥', ap: 1, cost: 30,  staff: 1, req: 'policies',
    desc: 'Deteksi & cegah serangan fisik (USB drop, tailgating) Red.' },
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

/* ---- Katalog aksi RED --------------------------------------------------- */
const RED_ACTIONS = [
  { id: 'recruit',    name: 'Rekrut Hacker',         icon: '🧑‍💻', ap: 1, res: 0,  vector: 'cyber',
    desc: '+2 Hacker Resources permanen (kapasitas aksi tiap giliran).' },
  { id: 'osint',      name: 'OSINT Recon',           icon: '🔎', ap: 1, res: 1,  vector: 'cyber', once: true,
    desc: 'Ungkap seluruh aset yang menghadap internet (perimeter). Titik awal serangan.' },
  { id: 'hostscan',   name: 'Host Discovery',        icon: '📶', ap: 1, res: 1,  vector: 'cyber', target: 'reachZone',
    desc: 'Temukan aset-aset di zona yang sudah terjangkau foothold.' },
  { id: 'portscan',   name: 'Port & Service Scan',   icon: '🧭', ap: 1, res: 1,  vector: 'cyber', target: 'knownAsset',
    desc: 'Enumerasi layanan 1 aset → ungkap kerentanan yang bisa dieksploitasi.' },
  { id: 'passwd',     name: 'Serangan Password',     icon: '🔑', ap: 1, res: 2,  vector: 'cyber', target: 'scannedAsset',
    desc: 'Brute-force / credential stuffing. Peluang compromise aset dengan vuln tinggi.' },
  { id: 'exploit',    name: 'Eksploitasi Vuln',      icon: '💥', ap: 2, res: 2,  vector: 'cyber', target: 'scannedAsset',
    desc: 'Eksploitasi kerentanan yang ditemukan → compromise aset (peluang ∝ vuln & hardening).' },
  { id: 'phish',      name: 'Spearphishing',         icon: '🎣', ap: 1, res: 2,  vector: 'social', target: 'socialZone',
    desc: 'Kampanye email ke zona internal. Sukses = foothold langsung di zona itu (abai perimeter).' },
  { id: 'usb',        name: 'Akses Fisik / USB',     icon: '🔌', ap: 2, res: 2,  vector: 'physical', target: 'physicalZone',
    desc: 'Serangan fisik: tanam USB / tailgating di zona dalam. Bisa langsung foothold di sana.' },
  { id: 'pivot',      name: 'Pivot / Lateral',       icon: '↔️', ap: 2, res: 2,  vector: 'cyber', target: 'pivotZone',
    desc: 'Dari zona yang dikuasai, tembus firewall internal ke zona berikutnya.' },
  { id: 'privesc',    name: 'Privilege Escalation',  icon: '⬆️', ap: 1, res: 1,  vector: 'cyber', target: 'ownedAsset',
    desc: 'Naikkan hak akses di aset yang dikuasai → perlemah pertahanan di sekitarnya.' },
  { id: 'attackplc',  name: 'Serang Aset Inti',      icon: '🎯', ap: 2, res: 3,  vector: 'cyber', target: 'plc',
    desc: 'Serangan ke aset inti (crown jewel). Menguasai SELURUH crown jewel = KEMENANGAN RED.' },
  { id: 'dos',        name: 'Denial of Service',     icon: '🛑', ap: 2, res: 2,  vector: 'cyber', target: 'ownedAsset',
    desc: 'Lumpuhkan aset yang dikuasai → turunkan P/L Blue drastis (sabotase).' },
];

/* ---- Konfigurasi default game ------------------------------------------ */
const GAME_CONFIG = {
  maxRounds: 75,
  blue: { budget: 220, staff: 2, pl: 100, threatIntel: 0, apPerTurn: 3 },
  red:  { resources: 3, apPerTurn: 3 },
  salaryPerStaff: 1,
  plDamagePerCompromise: 5,
};

if (typeof module !== 'undefined') {
  module.exports = { SCENARIOS, BLUE_ACTIONS, RED_ACTIONS, GAME_CONFIG, ZCOL };
}
