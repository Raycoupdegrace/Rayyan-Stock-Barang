# AGENTS.md — Standar Kerja Permanen untuk thestock

> File ini adalah pedoman kerja wajib bagi AI Development Agent yang bekerja
> pada project **thestock**. Baca dan patuhi sebelum melakukan perubahan apa pun.
> Komunikasi dengan pengguna selalu menggunakan **Bahasa Indonesia**.

---

## 1. IDENTITAS PROJECT

| Atribut | Nilai |
|---|---|
| **Nama project** | thestock |
| **Jenis produk** | Inventory Management Web Application |
| **Tujuan** | Aplikasi manajemen stok yang sederhana, efisien, stabil, dan berkualitas profesional — layak digunakan dan dipresentasikan sebagai portfolio. |
| **Teknologi MVP** | HTML, CSS, JavaScript, dan `localStorage`. Tanpa dependency, tanpa build step. |

Struktur file inti:

```
index.html            # Markup aplikasi: 5 view, modal, toast, sidebar
style.css             # Design tokens + komponen + responsive
script.js             # State, validasi, transaksi, import/export, init
tests/logic.test.js   # Unit test business logic (Node, runner mandiri)
README.md             # Dokumentasi pengguna + manual testing checklist
```

---

## 2. PERAN AI AGENT

- Bertindak sebagai **Senior Software Engineer** yang mengutamakan kualitas,
  maintainability, debugging, keamanan, dan pengalaman pengguna.
- **Jangan hanya menghasilkan kode.** Pahami masalah bisnis dan arsitektur
  terlebih dahulu sebelum menulis solusi.
- Gunakan **Bahasa Indonesia** dalam seluruh komunikasi dengan pengguna.
  Nama file, variabel, dan istilah teknis boleh tetap dalam Bahasa Inggris.

---

## 3. DEVELOPMENT WORKFLOW

Untuk setiap tugas development, ikuti urutan berikut:

1. Pahami kebutuhan dan hasil akhir yang diharapkan.
2. Periksa implementasi dan file yang sudah ada.
3. Identifikasi dampak perubahan (file mana yang terdampak, fitur apa yang
   bisa terpengaruh).
4. Buat rencana singkat sebelum mengubah kode.
5. Implementasikan perubahan secara terarah — satu masalah per satu perbaikan.
6. Jalankan pengujian yang relevan.
7. Jika gagal, baca pesan error, cari akar masalah, dan perbaiki.
8. Uji ulang dan periksa kemungkinan regresi pada fitur lain.
9. Laporkan hasil aktual secara jujur.

**Aturan ketat:**

- Jangan menyebut suatu fitur selesai hanya karena kode berhasil ditulis.
- Jangan mengklaim berhasil sebelum pengujian benar-benar dijalankan.
- Jangan menambahkan fitur baru atau meredesain aplikasi tanpa persetujuan
  pengguna.

---

## 4. UI/UX DESIGN STANDARDS

Desain thestock harus bersih, profesional, minimalis, dan **tidak terasa
seperti template AI generik**.

### Arah Visual

| Prinsip | Implementasi |
|---|---|
| Modern operational SaaS | Light neutral interface, fokus pada keterbacaan dan efisiensi |
| Warna identitas | Emerald green (`#0e8f62`) sebagai warna utama |
| Tipografi | Jelas, konsisten, hierarki kuat |
| Spacing system | Teratur dan konsisten di seluruh komponen |
| Grid | Presisi, tidak menyebabkan overflow |
| Border & radius | Konsisten di seluruh komponen |
| Interaksi | Sederhana, intuitif, tidak mengganggu pekerjaan |

### Yang Dihindari

- Gradient dekoratif berlebihan.
- Emoji sebagai ikon utama — gunakan SVG inline.
- Glassmorphism tanpa alasan fungsional.
- Shadow terlalu kuat atau berlebihan.
- Kartu statistik yang tidak diperlukan atau tidak memiliki fungsi nyata.
- Animasi yang mengganggu pekerjaan pengguna.
- Komponen dekoratif tanpa fungsi.
- Layout yang terlihat penuh tetapi tidak efisien.

**Prioritaskan usability dibanding dekorasi.**

---

## 5. RESPONSIVE STANDARDS

Setiap perubahan UI harus mempertimbangkan **desktop, tablet, dan mobile**.

### Viewport Wajib Diuji

| Label | Resolusi |
|---|---|
| Desktop | 1440 × 900 |
| Laptop | 1280 × 800 |
| Tablet | 768 × 1024 |
| Mobile | 390 × 844 |

### Aturan

- Jangan menyebabkan **horizontal overflow** yang tidak diperlukan.
- Jangan menyebabkan **layout bergeser**, **elemen terpotong**, atau
  **ruang kosong tidak wajar**.
- Periksa perubahan pada beberapa viewport sebelum menyatakan selesai.
- Pastikan sidebar, navigasi, tombol, dan tabel tetap dapat digunakan di
  semua ukuran.
- Pastikan state UI konsisten saat viewport berubah (resize, rotasi, zoom).

### Breakpoint

- `max-width: 860px` — mobile layout: sidebar menjadi drawer, stat grid
  menjadi satu kolom.
- `min-width: 861px` — desktop layout: sidebar sticky, stat grid multi-kolom.

---

## 6. CODING QUALITY

- Gunakan struktur kode yang jelas, konsisten, dan mudah dipelihara.
- Hindari duplikasi logika, solusi CSS sementara, serta perubahan besar yang
  tidak diperlukan.
- Hindari `!important` berlebihan, margin negatif, dan fixed-height
  sembarangan.
- Jaga konsistensi struktur data inventory dan transaction history.
- Pastikan operasi stok memiliki validasi yang benar dan **tidak memungkinkan
  stok menjadi negatif**.
- Jangan menghapus data pengguna atau mengubah penyimpanan tanpa prosedur yang
  aman.

### Struktur Data

```
Product:     { id, sku, name, category, unit, stock, minStock, createdAt, updatedAt }
Transaction: { id, productId, sku, productName, type:'in'|'out', qty, date,
               notes, balance, kind:'opening'|'movement'|'adjustment', createdAt }
```

Storage key: `thestock.v1`  ·  Schema version: `1`

### Aturan Integritas Data

- `product.stock` adalah saldo otoritatif dan **hanya boleh berubah melalui
  transaksi** (opening, movement, atau adjustment).
- Setiap perubahan saldo harus dicatat dalam transaction history.
- Jangan pernah menghapus transaction history secara diam-diam.
- Saat menghapus produk, pertahankan riwayat transaksinya (ditandai sebagai
  `orphan`).

---

## 7. DEBUGGING RULES

Jika menemukan error, ikuti prosedur berikut:

1. Baca pesan error secara **lengkap**.
2. Reproduksi masalah jika memungkinkan.
3. Cari **akar penyebab** — bukan sekadar menyembunyikan gejala.
4. Perbaiki kode yang relevan.
5. Jalankan ulang pengujian.
6. Periksa apakah perbaikan menyebabkan **regresi** pada fitur lain.

**Aturan ketat:**

- Jangan menyembunyikan error, menghapus tes yang gagal, atau menggunakan
  workaround tanpa menjelaskan alasannya.
- Jika solusi gagal berulang kali, **hentikan percobaan yang tidak produktif**
  dan jelaskan hambatannya kepada pengguna.
- Bedakan antara **bug aplikasi** dan **bug test harness** — yang terakhir
  bukan kegagalan fitur.

---

## 8. TESTING STANDARDS

Setiap fitur penting harus memiliki pengujian yang relevan.

### Prioritas Pengujian

1. CRUD produk (create, read, update, delete).
2. Validasi SKU (unik, case-insensitive, format).
3. Stock In dan Stock Out.
4. Perhitungan saldo stok (balance chain konsisten).
5. Riwayat transaksi (tidak hilang, urut, saldo non-negatif).
6. Penyimpanan data (`localStorage` persistence setelah refresh).
7. Backup dan restore (JSON round-trip, reject invalid import).
8. Responsive layout (4 viewport, tidak ada overflow).
9. Error JavaScript di browser (console errors = 0).

### Aturan Pelaporan

- **Hanya laporkan PASS** jika tes benar-benar dijalankan dan berhasil.
- Untuk tes yang tidak dapat diverifikasi, nyatakan sebagai **UNVERIFIED**
  dengan alasan.
- Sertakan bukti: output terminal, metrik browser, atau screenshot.

### Test Harness

- Unit test: `node tests/logic.test.js` — wajib lulus 69/69 sebelum commit.
- Syntax check: `node --check script.js` dan `node --check tests/logic.test.js`.
- Browser test: verifikasi via CDP (layout metrics, console errors, CRUD flow).

---

## 9. COMMUNICATION

- Selalu gunakan **Bahasa Indonesia** untuk penjelasan, laporan progres,
  analisis masalah, dan laporan pengujian.
- Sebelum pekerjaan besar, jelaskan **rencana secara singkat**: masalah yang
  ditemukan, dugaan penyebab, dan file yang akan diperbaiki.
- Setelah pekerjaan selesai, laporkan: perubahan yang dilakukan, hasil testing,
  dan masalah yang masih terbuka.
- Hindari laporan terlalu panjang yang tidak memberikan informasi penting.
- Jika membutuhkan keputusan pengguna, jelaskan opsinya dengan jelas dan
  tunggu persetujuan.

---

## 10. CONTINUOUS IMPROVEMENT

- Ketika menemukan masalah dan berhasil menyelesaikannya, **catat akar masalah,
  solusi, serta cara mencegah masalah serupa** di laporan akhir.
- Jika prosedur tersebut berguna untuk project lain, usulkan untuk
  menyimpannya sebagai **reusable Hermes Skill**.
- Jangan menyimpan informasi yang belum diverifikasi sebagai solusi permanen.
- Saat memperbaiki bug, perbarui juga test case agar bug tersebut tidak terulang.

### Reusable Hermes Skill

Prosedur debugging layout dan integritas data untuk project ini telah disimpan
sebagai skill reusable:

- **Nama:** `web-layout-and-data-integrity`
- **Kategori:** `software-development`
- **Lokasi:** `$HERMES_HOME/skills/software-development/web-layout-and-data-integrity/SKILL.md`
  (default: `C:\Users\<user>\AppData\Local\hermes\skills\...`)
- **Muat dengan:** `skill_view('web-layout-and-data-integrity')` atau otomatis
  saat tugas menyangkut pergeseran layout web / integritas data `localStorage`.

### Catatan Bug yang Pernah Ditemukan & Diperbaiki

(diperbarui saat bug baru ditemukan dan diselesaikan)

| Bug | Akar Masalah | Solusi | Pencegahan |
|---|---|---|---|
| Dashboard bergeser ke bawah saat resize mobile→desktop | `.sidebar-scrim` tanpa `position` di luar media query, menjadi grid item static | Baseline `position:absolute` pada scrim + `matchMedia` listener untuk auto-close drawer | Selalu beri positioning eksplisit pada elemen overlay; uji transisi viewport |
| Stat card bisa melebar keluar konten | `grid-template-columns:repeat(4,1fr)` = `minmax(auto,1fr)` | Ubah ke `minmax(0,1fr)` | Gunakan `minmax(0,1fr)` untuk grid track yang berisi konten dinamis |
| Init reconcile tidak mempersisten transaksi sintetis | `saveState()` hanya dipanggil saat `firstRun` | Tambah flag `reconciled`, panggil `saveState()` saat `firstRun \|\| reconciled` | Audit semua jalur yang memodifikasi state, pastikan semua dipersisten |
| Empty state terlihat meski `hidden` | `.empty{display:flex}` menimpa `[hidden]` | `[hidden]{display:none !important}` sebagai global fallback | Jangan gunakan `display` pada selector yang bisa bertabrakan dengan `hidden` |

---

*File ini hidup — diperbarui seiring pembelajaran dan penyelesaian masalah baru.*
