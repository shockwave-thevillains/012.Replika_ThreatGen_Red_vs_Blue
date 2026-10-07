# 🛡️ CyberClash: Red vs Blue ⚔️👾

Game strategi keamanan siber **turn-based** — **Red Team (penyerang)** vs **Blue Team (bertahan)** —
dibuat sebagai **replika edukatif** yang terinspirasi oleh
[**ThreatGEN®: Red vs. Blue**](https://threatgen.com/red-vs-blue).

Seluruhnya **HTML + CSS + JavaScript murni** tanpa dependensi, jadi **langsung jalan di GitHub Pages / github.io**.

> ⚠️ Proyek non-komersial untuk pembelajaran. "ThreatGEN" adalah merek dagang pemiliknya;
> game ini bukan produk resmi dan tidak memakai aset mereka.

---

## 🎮 Cara Main

1. Buka `index.html` (atau versi GitHub Pages-nya).
2. Pilih sisi: **🛡️ Blue Team** atau **👾 Red Team**, dan tingkat kesulitan AI.
3. Bergiliran memainkan **aksi** menggunakan **Action Points (AP)**. Klik kartu aksi,
   lalu (jika perlu) klik aset/zona di peta sebagai target. Klik **Akhiri Giliran** saat selesai.
4. AI lawan akan menjalankan gilirannya secara otomatis.

### Papan permainan: peta jaringan berlapis
`Internet → DMZ → Corporate/IT → OT/ICS`

Red harus menembus zona demi zona hingga mencapai **OT** dan menguasai **PLC (crown jewels)**.

### 🛡️ Blue Team (Defender)
- Kelola **💰 anggaran** & **🧑‍💼 staff** untuk membangun pertahanan berlapis.
- Mulai dari **Kebijakan & Prosedur** → membuka aksi lanjutan.
- Pasang **IDS** & **SIEM** untuk mendeteksi serangan → menaikkan **Threat Intel**.
- **Menang bila:** Threat Intel capai **100%** (Red tertangkap), semua kerentanan ditambal tanpa aset dikuasai, atau bertahan **75 ronde**.
- **Kalah bila:** **P/L** jatuh ke 0, atau **kedua PLC** dikuasai Red.

### 👾 Red Team (Attacker)
- Gunakan **👾 Hacker Resources**. Mulai **OSINT** → temukan aset DMZ.
- Tiga vektor serangan: **Cyber** (scan → exploit → pivot), **Social** (spearphishing), **Physical** (USB drop).
- **Menang bila:** menguasai **kedua PLC**, atau menjatuhkan **P/L** Blue ke 0 (via DoS/kompromi).
- Hati-hati: aksi di zona ber-IDS berpeluang **terdeteksi** & menaikkan Threat Intel Blue.

---

## ✨ Fitur (termasuk tambahan di luar konsep aslinya)

- ✅ **Dua sisi dapat dimainkan** (Blue atau Red) melawan **AI** heuristik.
- ✅ **3 tingkat kesulitan** (Mudah / Normal / Sulit) yang memengaruhi efektivitas AI lawan.
- ✅ **Peta jaringan berlapis** (DMZ/IT/OT) dengan aset realistis: firewall, VPN, web server, mail, workstation, Domain Controller, SIEM, HMI, Historian, dan **PLC** sebagai crown jewels.
- ✅ **Sistem sumber daya**: anggaran, staff, gaji, Hacker Resources, Action Points.
- ✅ **Fog-of-war untuk Red**: aset tersembunyi sampai ditemukan lewat recon.
- ✅ **Mekanik deteksi**: IDS + SIEM, serangan berpeluang terungkap → Threat Intel.
- ✅ **3 vektor serangan**: cyber, social engineering, physical.
- ✅ **Mekanik pertahanan**: patch, hardening, segmentasi, backup & remediasi, forensik/IR.
- ✅ **Fifteen+ aksi** bergaya "kartu" dengan biaya, prasyarat, cooldown, & efek.
- ✅ **Log kejadian** real-time, **meter** Threat Intel / P/L / Crown Jewels.
- ✅ **UI gelap responsif** (desktop & mobile), tanpa build step / dependensi.

---

## 🚀 Menjalankan di GitHub Pages (github.io)

1. Push isi repo ini (sudah berisi `index.html` di root).
2. Di GitHub: **Settings → Pages**.
3. **Source:** _Deploy from a branch_. Pilih branch tempat file ini berada, folder **`/ (root)`**, lalu **Save**.
4. Tunggu beberapa saat; situs tersedia di `https://<user>.github.io/<repo>/`.

Karena semua path bersifat relatif (`css/…`, `js/…`), game berjalan baik walau di sub-path proyek.

### Menjalankan lokal
Cukup buka `index.html` di browser, atau jalankan server statis:
```bash
python3 -m http.server 8000
# buka http://localhost:8000
```

---

## 🗂️ Struktur

```
index.html        # halaman & markup
css/styles.css    # tema gelap, layout, responsif
js/data.js        # topologi jaringan, aset, katalog aksi, konfigurasi
js/engine.js      # state game, resolusi aksi, deteksi, AI, kondisi menang/kalah
js/ui.js          # render DOM, interaksi, orkestrasi giliran AI
```

Engine (`data.js` + `engine.js`) bebas DOM sehingga bisa diuji headless di Node.js.

---

_Replika edukatif. Hak atas "ThreatGEN: Red vs. Blue" milik pemiliknya masing-masing._
