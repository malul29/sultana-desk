// Syarat & ketentuan, structured like the original .doc files.
// Item   = string | { text, subs?, dashPara? }       (numbered 1., 2., …)
// Sub    = string | { text, account?, para?, dashes? } (lettered a., b., …)
//   account → bank account block after the text · para → paragraph after the account block
//   dashes  → "- …" lines under the sub · dashPara → a "- …" paragraph under the numbered item

const SURAT_KONFIRMASI = {
  "title": "SYARAT-SYARAT DAN KETENTUAN-KETENTUAN SURAT KONFIRMASI UNIT",
  "items": [
    "Seluruh data-data dalam Surat Konfirmasi Unit (termasuk alamat dan nama) harus diisi dengan lengkap, jelas dan benar serta melampirkan fotokopi identitas diri (KTP yang masih berlaku). Penerima Pesanan tidak bertanggung jawab apapun apabila ternyata data atau dokumen yang diperlukan ternyata tidak/kurang lengkap/benar atau dipalsukan, termasuk tidak sampainya surat pemberitahuan kepada Pemesan atau Surat Konfirmasi Unit ini tidak ditandatangani sendiri oleh Pemesan dan/atau orang/pihak yang berwenang.",
    "Harga Unit Pesanan (Harga Pengikatan) dan cara pembayarannya (termasuk jadwal pembayaran) yang telah disepakati mengikat Pemesan dan Penerima Pesanan.",
    "Pemesan mengakui bahwa Penerima Pesanan hanya mempertemukan Pemesan dengan Bank dan oleh karenanya Penerima Pesanan tidak menjamin disetujui atau tidaknya permohonan KPR dari Bank Pemberi Kredit. Untuk itu, segala akibat dan resiko yang berkaitan dengan permohonan dan pemberian fasilitas pinjaman dan/atau pemesanan Unit Pesanan merupakan beban dan tanggung jawab Pemesan sepenuhnya serta tidak dapat dikaitkan atau dibebankan kepada Penerima Pesanan karena sebab atau alasan apapun.",
    "Dalam waktu 7 (tujuh) hari kalender setelah tanggal pembayaran uang reservasi, pemesan wajib memutuskan untuk melanjutkan proses pemesanan dengan melakukan pembayaran Booking Fee / Tanda Jadi. Apabila pemesan memutuskan tidak melanjutkan maka uang reservasi akan dikembalikan 100% selambat-lambatnya 7 (tujuh) hari kerja.",
    {
      "text": "Pembayaran",
      "subs": [
        {
          "text": "Pembayaran reservasi secara transfer atau cek atau bilyet giro wajib dilakukan secara penuh tanpa potongan apapun dan langsung ke rekening :",
          "account": true
        },
        "Segala biaya yang timbul sehubungan dengan pembayaran secara transfer (termasuk biaya transfer) merupakan beban dan wajib dibayar oleh Pemesan."
      ]
    },
    "Hal-hal yang tidak atau belum diatur dalam Surat Konfirmasi Unit ini akan diatur lebih lanjut dalam Surat Pesanan dan/atau Perjanjian Pengikatan Jual Beli dan perjanjian (-perjanjian) lain yang dibuat sehubungan dengan Unit Pesanan."
  ],
  "closing": "Demikian Surat Konfirmasi Unit ini dibuat dengan maksud untuk terikat oleh hukum dan diselesaikan, setelah Surat Konfirmasi Unit ini dibaca secara jelas serta dimengerti akan isinya, ketika itu juga disepakati dan ditandatangani oleh Pemesan dan Penerima Pesanan dalam keadaan sadar, sehat jasmani dan rohani, tidak di bawah tekanan atau paksaan pihak manapun, serta akan ditaati dan dilaksanakan oleh Pemesan dan Penerima Pesanan."
};

const SURAT_PESANAN = {
  "title": "SYARAT DAN KETENTUAN SURAT PESANAN",
  "items": [
    "Seluruh data-data dalam Surat Pesanan (termasuk alamat dan nama) harus diisi dengan lengkap, jelas dan benar serta melampirkan fotokopi identitas diri (E-KTP) yang benar dan jelas. Penerima Pesanan tidak bertanggung jawab apapun apabila ternyata satu atau lebih data atau dokumen yang diperlukan ternyata tidak/kurang lengkap/benar atau dipalsukan, termasuk tidak sampainya surat pemberitahuan kepada Pemesan atau Surat Pesanan ini tidak ditandatangani sendiri oleh Pemesan dan/atau orang/pihak yang berwenang atau tidak dilaksanakannya satu atau lebih syarat atau ketentuan dalam Surat Pesanan ini.",
    "Harga Pengikatan dan cara pembayarannya (termasuk jadwal pembayaran) yang telah disepakati mengikat Pemesan dan Penerima Pesanan, dimana jadwal pembayaran tidak dikaitkan dengan progress pembangunan.",
    "Apabila dalam waktu 7 (tujuh) hari kalender setelah tanggal pembayaran uang tanda jadi pemesanan (booking fee), Pemesan tidak atau terlambat melaksanakan kewajiban pembayaran berikutnya karena sebab atau alasan apapun, maka Pemesan dan Penerima Pesanan sepakat dan setuju sekarang dan untuk nanti pada waktunya membatalkan secara otomatis Surat Pesanan ini dengan melepaskan ketentuan dalam Pasal 1266 dan Pasal 1267 Kitab Undang-undang Hukum Perdata (yang mana pengakhiran secara sepihaknya tidak memerlukan Keputusan Pengadilan) dan seluruh pembayaran yang telah diterima oleh Penerima Pesanan dinyatakan oleh Pemesan tetap menjadi haknya Penerima Pesanan.",
    "Unit Pesanan yang telah dipesan, tidak dapat ditukar dengan Unit lain.",
    {
      "text": "Fasilitas Kredit Bank (KPR)",
      "subs": [
        "Pemesan sepakat dan mengakui bahwa Penerima Pesanan bertindak selaku pihak yang hanya mempertemukan Pemesan dengan Bank dan oleh karenanya Penerima Pesanan tidak menjamin disetujui atau tidaknya permohonan KPR dari Bank Pemberi Kredit. Untuk itu, segala akibat dan resiko yang berkaitan dengan permohonan dan pemberian fasilitas pinjaman dan/atau pemesanan Unit Pesanan merupakan beban dan tanggung jawab Pemesan sepenuhnya serta tidak dapat dikaitkan atau dibebankan kepada Penerima Pesanan karena sebab atau alasan apapun. Pemesan dengan ini membebaskan Penerima Pesanan atas segala akibat dan resiko yang timbul sehubungan dengan fasilitas kredit Pemesan tersebut.",
        "Pemesan wajib melengkapi data untuk persyaratan KPR selambat-lambatnya 14 (empat belas) hari kerja setelah pembayaran 10% (sepuluh persen) dari Harga Pengikatan. Dengan lewatnya jangka waktu tersebut maupun toleransi waktu namun Pemesan belum melengkapi data untuk persyaratan KPR tersebut, maka Pemesan dianggap telah membatalkan Pemesanan Unit.",
        "Apabila fasilitas KPR disetujui namun Pemesan wajib menambah uang muka, maka atas pemberitahuan tertulis Penerima Pesanan, Pemesan wajib menambah uang muka tersebut selambat-lambatnya 14 (empat belas) hari kerja. Dengan lewatnya jangka waktu tersebut maupun toleransi namun Pemesan belum melunasi kekurangan Uang Muka, maka Pemesan dianggap telah membatalkan Pemesanan unit.",
        "Apabila lewat waktu Penandatangan Akad Kredit yang telah ditentukan namun Pemesan belum menandatangani Akad Kredit, maka Pemesan akan dikenakan biaya administrasi sebesar 1 o/oo (satu per mil) per hari dari pemunduran jadwal penandatanganan yang dihitung dari Plafond Kredit yang disetujui oleh Bank. Dengan lewatnya jangka waktu tersebut maupun toleransi namun Pemesan belum menandatangani Akad Kredit, maka Pemesan dianggap telah membatalkan Pemesanan unit.",
        "Apabila permohonan KPR ditolak oleh Bank karena sebab alasan apapun juga, Pemesan wajib meneruskan pembayaran melalui tunai keras atau tunai bertahap/angsuran sesuai dengan ketentuan-ketentuan yang berlaku. Apabila Pemesan tidak melakukan hal tersebut, maka Pemesan dianggap telah membatalkan Pemesanan Unit."
      ]
    },
    {
      "text": "Keterlambatan dan Pembatalan",
      "subs": [
        "Apabila Pemesan tidak atau terlambat membayar atau kurang membayar uang muka dan/atau angsuran dan/atau kewajiban pembayaran lain pada tanggal jatuh tempo kewajiban pembayaran, maka Pemesan sepakat untuk dikenakan denda keterlambatan sebesar 1 o/oo (satu per mil) per hari dari jumlah uang muka dan/atau angsuran dan/atau kewajiban dan dihitung sejak tanggal jatuh tempo hingga dilakukannya pembayaran secara penuh maksimal 30 (tigapuluh) hari kalender. Dengan lewatnya jangka waktu tersebut namun Pemesan belum membayar kewajibannya secara penuh, maka Pemesan dianggap telah membatalkan Pemesanan Unit.",
        "Batas waktu toleransi keterlambatan atas kewajiban setiap pembayaran dan/atau kewajiban melengkapi dokumen adalah maksimal 30 (tigapuluh) hari kalender terhitung sejak tanggal jatuh tempo. Untuk itu, dengan lewatnya waktu saja, maka Pemesan dianggap membatalkan secara sepihak Surat Pesanan ini. Pemesan dan Penerima Pesanan sepakat untuk mengesampingkan/melepaskan ketentuan dalam Pasal 1266 dan Pasal 1267 Kitab Undang-undang Hukum Perdata (yang mana pengakhiran secara sepihaknya tidak memerlukan Keputusan Pengadilan).",
        {
          "text": "Apabila pembatalan Unit Pesanan sebagaimana tercantum dalam Surat Pesanan ini atas kemauan Pemesan dan/atau akibat kesalahan/kelalaian Pemesan, maka Pemesan sepakat :",
          "dashes": [
            "Uang tanda jadi pemesanan (booking fee) tetap menjadi milik Penerima Pesanan dan akan membayar biaya administrasi pembatalan sebesar 50% (limapuluh persen) dari Uang Muka yang telah dibayarkan.",
            "Pengembalian sisa uang Pemesan setelah dikurangi PPN (jika ada), denda, biaya administrasi dan kewajiban pembayaran lainnya yang belum dibayarkan Pemesan kepada Penerima Pesanan (jika ada) akan dilakukan oleh Penerima Pesanan kepada Pemesan setelah adanya pembeli baru atas unit yang dipesan."
          ]
        },
        "Pembatalan akibat penolakan bank maka uang tanda jadi pemesanan (booking fee) tetap menjadi milik Penerima Pesanan dan Uang Muka yang telah dibayarkan akan dikembalikan seluruhnya setelah adanya Pembeli baru atas unit yang dipesan."
      ]
    },
    {
      "text": "Cara Pembayaran.",
      "subs": [
        "Pembayaran dengan menggunakan cek/bilyet giro baru dianggap sah apabila seluruh dananya telah diterima dengan baik dan untuk itu Pemesan akan menerima bukti pembayaran (kuitansi) resmi dari Penerima Pesanan.",
        "Biaya Penolakan cek/bilyet giro dari Pemesan ditetapkan sebesar Rp.250.000 (dua ratus lima puluh ribu rupiah) dan biaya materai sampai pembayaran lunas, seluruhnya ditanggung oleh Pemesan.",
        "Pemesan, tanpa persetujuan tertulis dari Penerima Pesanan, tidak diperkenankan mengubah cara pembayaran dan/atau tanggal Pembayaran."
      ]
    },
    {
      "text": "Pembayaran",
      "subs": [
        {
          "text": "Semua pembayaran secara transfer atau cek atau bilyet giro wajib dilakukan secara penuh tanpa potongan apapun dan langsung kepada :",
          "account": true,
          "para": "-dengan mencantumkan nama Perumahan dan nomor dari Unit Pesanan dan nama Pemesan. Pembayaran secara transfer wajib dilakukan secara penuh tanpa potongan apapun. Tanggal pembayaran yang diakui adalah tanggal efektif diterimanya dana tersebut dalam rekening bank Penerima Pesanan. Pemesan wajib mengirimkan bukti pembayaran ke Penerima Pesanan melalui layanan WA : 0877-8575-8656 Jika tidak ada konfirmasi dalam 3 (tiga) hari kalender, maka hal itu diluar tanggung jawab Penerima Pesanan."
        },
        "Segala biaya yang timbul sehubungan dengan pembayaran secara transfer (termasuk biaya transfer) merupakan beban dan wajib dibayar oleh Pemesan."
      ]
    },
    {
      "text": "Serah Terima unit dapat dilakukan jika Pemesan telah melunasi seluruh kewajiban pembayaran yang akan dilaksanakan 12 (dua belas) bulan setelah pelunasan atau angsuran pertama. Untuk itu Penerima Pesanan akan memberikan surat undangan penandatanganan Berita Acara Serah Terima (BAST) kepada Pemesan.",
      "dashPara": "-dalam hal terjadi keterlambatan serah terima unit meskipun telah melewati masa toleransi selama 6 (enam) bulan, maka penerima pesanan akan dikenakan denda keterlambatan sebesar 1 o/oo (satu permil per hari) maksimal 3% dari nilai sisa pekerjaan pembangunan yang belum diselesaikan"
    },
    "Pemesan tidak dapat mengalihkan atau memindahkan seluruh atau sebagian hak-hak dan kewajiban-kewajiban dalam Surat Pesanan ini kepada orang/pihak lain, termasuk menyewakan, meminjamkan haknya kepada orang lain. Apabila hal tersebut dilanggar, maka segala akibat (konsekuensi hukum) yang timbul termasuk tetapi tidak terbatas pada ketentuan perpajakan, sepenuhnya menjadi beban dan tanggung jawab Pemesan.",
    "Hal-hal yang tidak atau belum diatur dalam Surat Pesanan ini akan diatur lebih lanjut dalam Perjanjian Pengikatan Jual Beli dan/atau perjanjian (-perjanjian) lain yang dibuat sehubungan dengan Unit Pesanan di Perumahan Sultana Living."
  ],
  "closing": "Demikian Surat Pesanan beserta Syarat dan Ketentuan ini dibuat dengan maksud untuk terikat oleh hukum, setelah Surat Pesanan beserta Syarat dan ketentuan dibaca secara jelas serta dimengerti isinya, untuk itu akan ditaati dan dilaksanakan oleh Pemesan dan Penerima Pesanan dan ditandatangani sebagai tanda persetujuannya."
};

// Surat Pemesanan Unit: same clauses as Surat Konfirmasi Unit, but there is no
// reservation stage — the process starts at Booking Fee.
const swap = (s) => s
  .replace(/Surat Konfirmasi Unit/g, 'Surat Pemesanan Unit')
  .replace(/Pembayaran reservasi secara transfer/g, 'Pembayaran secara transfer');
const mapItem = (it) => (typeof it === 'string' ? swap(it) : { ...it, text: swap(it.text), subs: it.subs && it.subs.map(mapItem) });
const SURAT_PESANAN_UNIT = {
  title: 'SYARAT-SYARAT DAN KETENTUAN-KETENTUAN SURAT PEMESANAN UNIT',
  items: SURAT_KONFIRMASI.items
    .filter((it) => !(typeof it === 'string' && it.startsWith('Dalam waktu 7 (tujuh) hari kalender setelah tanggal pembayaran uang reservasi')))
    .map(mapItem),
  closing: swap(SURAT_KONFIRMASI.closing),
};

// Receiving accounts differ per document (as in the originals).
const ACCOUNT_KONFIRMASI = [['An', 'MEGAWATI DAN ROSDIANA'], ['Bank', 'MANDIRI'], ['Acc', '174-00-1310120-9']];
const ACCOUNT_PESANAN = [['Atas nama', 'PT. Balla Sultana Samata'], ['Bank', 'BTN KCP CIPAYUNG'], ['Acc', '01057-01-30-000035-8']];

module.exports = { SURAT_KONFIRMASI, SURAT_PESANAN, SURAT_PESANAN_UNIT, ACCOUNT_KONFIRMASI, ACCOUNT_PESANAN };
