const SPREADSHEET_ID = "19u_urYpqFrhISW68L2rn-xMf6v0FiYIjceRVV6uPDp8";
const ZONA_WAKTU = "Asia/Makassar"; // Zona Waktu Indonesia Tengah (GMT+8)

/**
 * FUNGSI BARU: Untuk memasang pemicu 'onOpen' secara manual.
 * Jalankan fungsi ini SATU KALI dari editor untuk memperbaiki menu yang tidak muncul.
 */
function setupTrigger() {
  try {
    // Hapus pemicu lama jika ada untuk menghindari duplikasi
    const triggers = ScriptApp.getProjectTriggers();
    for (const trigger of triggers) {
      if (trigger.getHandlerFunction() === 'onOpen') {
        ScriptApp.deleteTrigger(trigger);
      }
    }
    // Buat pemicu baru menggunakan ID Spreadsheet agar lebih andal
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    ScriptApp.newTrigger('onOpen')
      .forSpreadsheet(ss) 
      .onOpen()
      .create();
    // PERBAIKAN: Menggunakan Logger.log untuk konfirmasi, bukan alert.
    Logger.log('Pemicu menu berhasil dipasang! Silakan muat ulang (refresh) spreadsheet Anda.');
  } catch (e) {
    Logger.log('Gagal memasang pemicu: ' + e.toString());
  }
}


/**
 * FUNGSI BARU: Untuk membuat menu custom di Spreadsheet saat file dibuka.
 * Menu ini akan berisi opsi untuk menjalankan fungsi pembersihan data.
 */
function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('⚙️ Admin Menu')
      .addItem('Hapus Data Transaksi & Laporan', 'hapusSemuaDataTransaksi')
      .addSeparator()
      .addItem('Refresh Dashboard', 'updateDashboardSheet')
      .addToUi();
}

/**
 * FUNGSI BARU: Untuk menghitung dan menulis data ringkasan ke sheet "Dashboard".
 * DIPERBARUI: Sekarang juga menampilkan total penjualan harian per cabang.
 * PERBAIKAN: Kode kini membersihkan spasi dari header untuk menghindari error.
 */
function updateDashboardSheet() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const trxSheet = ss.getSheetByName('Transaksi');
    const dashboardSheet = ss.getSheetByName('Dashboard');

    if (!trxSheet || !dashboardSheet) {
      SpreadsheetApp.getUi().alert('Pastikan sheet "Transaksi" dan "Dashboard" sudah ada.');
      return;
    }

    const data = trxSheet.getDataRange().getValues();
    const headersRaw = data.shift(); // Mengambil header
    // PERBAIKAN: Membersihkan setiap header dari spasi ekstra yang tidak terlihat
    const headers = headersRaw.map(h => String(h || '').trim());

    // Mencari indeks kolom berdasarkan nama yang sudah bersih
    const tsIndex = headers.indexOf('Tanggal'); // PERBAIKAN: Diubah dari Timestamp
    const totalIndex = headers.indexOf('Total Harga');
    const produkIndex = headers.indexOf('Nama Produk');
    const variasiIndex = headers.indexOf('Ukuran/Variasi');
    const qtyIndex = headers.indexOf('Qty');
    const cabangIndex = headers.indexOf('Cabang');

    if ([tsIndex, totalIndex, produkIndex, variasiIndex, qtyIndex, cabangIndex].includes(-1)) {
        SpreadsheetApp.getUi().alert('Error: Kolom penting di sheet "Transaksi" tidak ditemukan. Periksa header (Tanggal, Total Harga, Cabang, dll).');
        return;
    }

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const today = Utilities.formatDate(now, ZONA_WAKTU, "yyyy-MM-dd");

    let totalOmsetBulanan = 0;
    const produkSalesBulanan = {};
    const salesHarianCabang = {};

    data.forEach(row => {
      if (!row[tsIndex]) return; // Lewati baris jika tanggal kosong
      const timestamp = new Date(row[tsIndex]);
      const cabang = row[cabangIndex] || 'Tanpa Cabang';
      const total = parseFloat(row[totalIndex]) || 0;
      
      if (timestamp.getMonth() === currentMonth && timestamp.getFullYear() === currentYear) {
        totalOmsetBulanan += total;

        const produk = row[produkIndex];
        const variasi = row[variasiIndex] || '';
        const qty = parseInt(row[qtyIndex]) || 0;
        const uniqueName = `${produk} (${variasi})`.replace(' ()', '');

        produkSalesBulanan[uniqueName] = (produkSalesBulanan[uniqueName] || 0) + qty;
      }
      
      const rowDate = Utilities.formatDate(timestamp, ZONA_WAKTU, "yyyy-MM-dd");
      if (rowDate === today) {
        salesHarianCabang[cabang] = (salesHarianCabang[cabang] || 0) + total;
      }
    });

    const produkTerlarisArray = Object.keys(produkSalesBulanan).map(key => [key, produkSalesBulanan[key]]);
    produkTerlarisArray.sort((a, b) => b[1] - a[1]);
    const top10Produk = produkTerlarisArray.slice(0, 10);
    const salesHarianArray = Object.keys(salesHarianCabang).map(key => [key, salesHarianCabang[key]]);

    dashboardSheet.clear(); 
    dashboardSheet.getRange('A1').setValue("Dashboard Penjualan").setFontWeight('bold').setFontSize(14);
    
    dashboardSheet.getRange('A3').setValue("Ringkasan Bulan Ini").setFontWeight('bold').setFontSize(12);
    dashboardSheet.getRange('A4').setValue("Total Omset:");
    dashboardSheet.getRange('B4').setValue(totalOmsetBulanan).setNumberFormat("Rp #,##0").setFontWeight('bold');
    
    dashboardSheet.getRange('A6').setValue("10 Produk Terlaris Bulan Ini").setFontWeight('bold');
    dashboardSheet.getRange('A7').setValue("Nama Produk").setFontWeight('bold');
    dashboardSheet.getRange('B7').setValue("Jumlah Terjual").setFontWeight('bold');

    if (top10Produk.length > 0) {
      dashboardSheet.getRange(8, 1, top10Produk.length, 2).setValues(top10Produk);
    }
    
    const dailyReportStartRow = top10Produk.length > 0 ? 8 + top10Produk.length + 2 : 9;
    dashboardSheet.getRange(dailyReportStartRow, 1).setValue("Laporan Penjualan Hari Ini per Cabang").setFontWeight('bold').setFontSize(12);
    dashboardSheet.getRange(dailyReportStartRow + 1, 1).setValue("Cabang").setFontWeight('bold');
    dashboardSheet.getRange(dailyReportStartRow + 1, 2).setValue("Total Omset Hari Ini").setFontWeight('bold');

    if (salesHarianArray.length > 0) {
      const dailyDataRange = dashboardSheet.getRange(dailyReportStartRow + 2, 1, salesHarianArray.length, 2);
      dailyDataRange.setValues(salesHarianArray);
      dashboardSheet.getRange(dailyReportStartRow + 2, 2, salesHarianArray.length, 1).setNumberFormat("Rp #,##0");
    }

    dashboardSheet.autoResizeColumns(1, 2); 

    SpreadsheetApp.getUi().alert('Dashboard berhasil diperbarui!');
  } catch (e) {
      Logger.log(e);
      SpreadsheetApp.getUi().alert('Terjadi error saat memperbarui dashboard: ' + e.toString());
  }
}


/**
 * FUNGSI BARU: Untuk menghapus semua data transaksi dan laporan uji coba.
 * Jalankan fungsi ini SATU KALI dari editor Apps Script untuk membersihkan sheet.
 */
function hapusSemuaDataTransaksi() {
  try {
    const ui = SpreadsheetApp.getUi();
    const konfirmasi = ui.alert(
      'Konfirmasi Penghapusan Data',
      'Apakah Anda yakin ingin menghapus SEMUA data di sheet "Transaksi" dan "Laporan"? Tindakan ini tidak dapat diurungkan.',
      ui.ButtonSet.YES_NO
    );

    if (konfirmasi == ui.Button.NO) {
      ui.alert('Penghapusan dibatalkan.');
      return;
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Hapus data di sheet 'Transaksi'
    const trxSheet = ss.getSheetByName('Transaksi');
    if (trxSheet) {
      const lastRow = trxSheet.getLastRow();
      if (lastRow > 1) { // Hanya hapus jika ada data selain header
        trxSheet.getRange(2, 1, lastRow - 1, trxSheet.getLastColumn()).clearContent();
        Logger.log("Data di sheet 'Transaksi' berhasil dihapus.");
      }
    }
    
    // Hapus data di sheet 'Laporan'
    const laporanSheet = ss.getSheetByName('Laporan');
    if (laporanSheet) {
      const lastRowLaporan = laporanSheet.getLastRow();
      if (lastRowLaporan > 1) { // Hanya hapus jika ada data selain header
          laporanSheet.getRange(2, 1, lastRowLaporan - 1, laporanSheet.getLastColumn()).clearContent();
      }
      Logger.log("Data di sheet 'Laporan' berhasil dihapus.");
    }
    
    SpreadsheetApp.flush(); 
    ui.alert('Pembersihan Selesai', 'Semua data transaksi dan laporan uji coba telah berhasil dihapus.', ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log("Error saat menghapus data: " + e.toString());
    SpreadsheetApp.getUi().alert('Terjadi Error', e.toString(), SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Kasir Toko Tanaman')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function getSheetData(sheetName) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) { throw new Error(`Sheet "${sheetName}" tidak ditemukan.`); }
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    return data.map(row => {
      const obj = {};
      headers.forEach((header, index) => { obj[header] = row[index]; });
      return obj;
    });
  } catch (e) {
    Logger.log(`Error di getSheetData untuk sheet ${sheetName}: ${e.toString()}`);
    return null;
  }
}

function cekLogin(email) {
  const users = getSheetData('Users');
  if (!users) {
    return { success: false, message: 'Gagal mengakses data user. Pastikan sheet "Users" ada.' };
  }
  
  const inputEmail = email.toLowerCase().trim();

  const userFound = users.find(user => 
    user['Email'] && String(user['Email']).toLowerCase().trim() === inputEmail
  );

  if (userFound) {
    const statusAktif = userFound['Aktif'] ? String(userFound['Aktif']).toLowerCase().trim() : '';
    if (statusAktif === 'ya') {
      return {
        success: true,
        user: { 
          email: userFound['Email'], 
          role: userFound['Role'] ? String(userFound['Role']).trim() : '', 
          cabang: userFound['Cabang'] ? String(userFound['Cabang']).trim() : '' 
        }
      };
    } else {
      return { success: false, message: `User ditemukan namun statusnya "${userFound['Aktif']}", bukan "Ya".` };
    }
  } else {
    return { success: false, message: 'Email tidak terdaftar.' };
  }
}

function getProduk() { return getSheetData('Produk'); }

function cekMember(nomorHp) {
  const members = getSheetData('Member');
  if (!members) { return { success: false, message: 'Gagal mengakses data member.' }; }
  const normalizePhoneNumber = (phone) => {
    if (!phone) return '';
    let normalized = String(phone).replace(/\D/g, '');
    if (normalized.startsWith('62')) { normalized = '0' + normalized.substring(2); }
    return normalized.startsWith('0') ? normalized.substring(1) : normalized;
  };
  const inputNomorHp = normalizePhoneNumber(nomorHp);
  const memberFound = members.find(member => normalizePhoneNumber(member['Nomor HP']) === inputNomorHp);
  if (memberFound) {
    if (String(memberFound['Status']).trim() === 'Aktif') {
      return { success: true, nama: memberFound['Nama'] };
    } else {
      return { success: false, message: 'Member ditemukan namun tidak aktif.' };
    }
  } else {
    return { success: false, message: 'Member dengan nomor HP tersebut tidak ditemukan.' };
  }
}

function tambahMemberBaru(dataMember) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const memberSheet = ss.getSheetByName('Member');
    const data = memberSheet.getDataRange().getValues();
    const nomorHpColumn = data[0].indexOf('Nomor HP');
    const nomorHpExists = data.slice(1).some(row => String(row[nomorHpColumn]).replace(/\D/g, '') === String(dataMember.nomorHp).replace(/\D/g, ''));

    if (nomorHpExists) {
      return { success: false, message: 'Gagal: Nomor HP ini sudah terdaftar sebagai member.' };
    }

    memberSheet.appendRow([ dataMember.nomorHp, dataMember.nama, new Date(), 'Aktif', '' ]);
    return { success: true, message: `Member baru "${dataMember.nama}" berhasil didaftarkan!` };
  } catch (e) {
    Logger.log(e);
    return { success: false, message: 'Error di server: ' + e.toString() };
  }
}

/**
 * PERBAIKAN: Fungsi ini sekarang membersihkan nama cabang sebelum menyimpannya
 * ke sheet "Transaksi" untuk memastikan konsistensi data.
 */
function simpanTransaksi(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const trxSheet = ss.getSheetByName('Transaksi');
    const laporanSheet = ss.getSheetByName('Laporan');
    const timestamp = new Date();
    const idTransaksi = "TRX-" + timestamp.getTime();
    const cabangBersih = String(data.cabang || '').trim(); // Membersihkan nama cabang

    const dataToAppend = [];
    data.items.forEach(item => {
      const hargaJual = item.produk['Harga Jual'] || 0;
      const hargaAkhirSatuan = item.hargaSaatIni || hargaJual;
      dataToAppend.push([
        idTransaksi,
        timestamp,
        data.memberId,
        item.produk['ID Produk'],
        item.produk['Nama Produk'],
        item.produk['Ukuran/Variasi'],
        item.qty,
        hargaJual,
        hargaAkhirSatuan * item.qty,
        data.metodePembayaran,
        data.detailMetode,
        cabangBersih // Menggunakan nama cabang yang sudah bersih
      ]);
    });
    
    if (dataToAppend.length > 0) {
      trxSheet.getRange(trxSheet.getLastRow() + 1, 1, dataToAppend.length, dataToAppend[0].length).setValues(dataToAppend);
    }

    updateLaporan(laporanSheet, timestamp, data.totalAkhir, data.metodePembayaran, cabangBersih);
    return "Sukses";
  } catch (e) {
    Logger.log(e);
    return "Error: " + e.toString();
  }
}


/**
 * PERBAIKAN: Fungsi ini sekarang mencari kolom berdasarkan nama header,
 * sehingga tidak akan rusak jika urutan kolom diubah atau ada kolom baru.
 */
function updateLaporan(sheet, timestamp, total, metode, cabang) {
  const cabangBersih = String(cabang || '').trim();
  const tanggal = Utilities.formatDate(timestamp, ZONA_WAKTU, "yyyy-MM-dd");
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0]; 
  
  const tglIndex = headers.indexOf('Tanggal');
  const cabangIndex = headers.indexOf('Cabang');
  const totalPenjualanIndex = headers.indexOf('Total Penjualan');
  const tunaiIndex = headers.indexOf('Tunai');
  const nonTunaiIndex = headers.indexOf('Non-Tunai');
  const jmlTransaksiIndex = headers.indexOf('Jumlah Transaksi');

  if ([tglIndex, cabangIndex, totalPenjualanIndex, tunaiIndex, nonTunaiIndex, jmlTransaksiIndex].includes(-1)) {
    Logger.log("Error: Kolom penting di sheet 'Laporan' tidak ditemukan. Periksa nama header.");
    return;
  }

  let rowFound = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][tglIndex] && data[i][cabangIndex]) {
      const rowDate = Utilities.formatDate(new Date(data[i][tglIndex]), ZONA_WAKTU, "yyyy-MM-dd");
      const rowCabang = String(data[i][cabangIndex]).trim();
      if (rowDate === tanggal && rowCabang === cabangBersih) {
        rowFound = i + 1;
        break;
      }
    }
  }

  if (rowFound !== -1) {
    const totalPenjualan = (parseFloat(sheet.getRange(rowFound, totalPenjualanIndex + 1).getValue()) || 0) + total;
    const totalTunai = (parseFloat(sheet.getRange(rowFound, tunaiIndex + 1).getValue()) || 0) + (metode === 'Tunai' ? total : 0);
    const totalNonTunai = (parseFloat(sheet.getRange(rowFound, nonTunaiIndex + 1).getValue()) || 0) + (metode !== 'Tunai' ? total : 0);
    const jmlTransaksi = (parseInt(sheet.getRange(rowFound, jmlTransaksiIndex + 1).getValue()) || 0) + 1;
    
    sheet.getRange(rowFound, totalPenjualanIndex + 1).setValue(totalPenjualan);
    sheet.getRange(rowFound, tunaiIndex + 1).setValue(totalTunai);
    sheet.getRange(rowFound, nonTunaiIndex + 1).setValue(totalNonTunai);
    sheet.getRange(rowFound, jmlTransaksiIndex + 1).setValue(jmlTransaksi);
  } else {
    const newRow = new Array(headers.length).fill('');
    const dateForSheet = Utilities.parseDate(tanggal, ZONA_WAKTU, "yyyy-MM-dd");
    
    newRow[tglIndex] = dateForSheet;
    newRow[cabangIndex] = cabangBersih;
    newRow[totalPenjualanIndex] = total;
    newRow[tunaiIndex] = (metode === 'Tunai' ? total : 0);
    newRow[nonTunaiIndex] = (metode !== 'Tunai' ? total : 0);
    newRow[jmlTransaksiIndex] = 1;

    sheet.appendRow(newRow);
  }
}

/**
 * PERBAIKAN: Fungsi ini sekarang juga membaca data laporan berdasarkan nama header.
 */
function getLaporanHarian(userInfo) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Laporan');
    if (!sheet) { return { error: 'Sheet Laporan tidak ditemukan.' }; }
    
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    const today = Utilities.formatDate(new Date(), ZONA_WAKTU, "yyyy-MM-dd");
    
    const tglIndex = headers.indexOf('Tanggal');
    const cabangIndex = headers.indexOf('Cabang');
    const totalPenjualanIndex = headers.indexOf('Total Penjualan');
    const tunaiIndex = headers.indexOf('Tunai');
    const nonTunaiIndex = headers.indexOf('Non-Tunai');
    const jmlTransaksiIndex = headers.indexOf('Jumlah Transaksi');

    if ([tglIndex, cabangIndex, totalPenjualanIndex, tunaiIndex, nonTunaiIndex, jmlTransaksiIndex].includes(-1)) {
      return { error: "Kolom penting di sheet 'Laporan' tidak ditemukan." };
    }

    const dailyTotals = {};

    data.forEach(row => {
        if (row[tglIndex]) {
            const rowDate = Utilities.formatDate(new Date(row[tglIndex]), ZONA_WAKTU, "yyyy-MM-dd");
            if (rowDate === today) {
                const cabang = String(row[cabangIndex]).trim();
                if (!dailyTotals[cabang]) {
                    dailyTotals[cabang] = {
                        cabang: cabang, totalPenjualan: 0, totalTunai: 0, totalNonTunai: 0, jumlahTransaksi: 0
                    };
                }
                dailyTotals[cabang].totalPenjualan += parseFloat(row[totalPenjualanIndex]) || 0;
                dailyTotals[cabang].totalTunai += parseFloat(row[tunaiIndex]) || 0;
                dailyTotals[cabang].totalNonTunai += parseFloat(row[nonTunaiIndex]) || 0;
                dailyTotals[cabang].jumlahTransaksi += parseInt(row[jmlTransaksiIndex]) || 0;
            }
        }
    });

    const reports = Object.values(dailyTotals);

    if (userInfo.role === 'Admin') {
      return { reports: reports };
    } else {
      const kasirReport = reports.find(r => r.cabang === userInfo.cabang);
      if (kasirReport) {
        return { reports: [kasirReport] };
      } else {
        return { reports: [{ cabang: userInfo.cabang, totalPenjualan: 0, jumlahTransaksi: 0, totalTunai: 0, totalNonTunai: 0 }]};
      }
    }
    
  } catch (e) {
    Logger.log(e);
    return { error: e.toString() };
  }
}

/**
 * DIPERBARUI: Fungsi ini sekarang mengirimkan data harga satuan.
 */
function getLaporanDetail(userInfo) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Transaksi');
    if (!sheet) {
      return { error: 'Sheet Transaksi tidak ditemukan.' };
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    
    const today = Utilities.formatDate(new Date(), ZONA_WAKTU, "yyyy-MM-dd");
    const transactions = [];

    const tsIndex = headers.indexOf('Tanggal');
    const produkIndex = headers.indexOf('Nama Produk');
    const variasiIndex = headers.indexOf('Ukuran/Variasi');
    const qtyIndex = headers.indexOf('Qty');
    const totalIndex = headers.indexOf('Total Harga');
    const cabangIndex = headers.indexOf('Cabang');
    
    if (tsIndex === -1 || cabangIndex === -1) {
      return { error: 'Kolom "Tanggal" atau "Cabang" tidak ditemukan di sheet Transaksi.' };
    }

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if(row[tsIndex]) {
        const rowDate = Utilities.formatDate(new Date(row[tsIndex]), ZONA_WAKTU, "yyyy-MM-dd");
        const rowCabang = String(row[cabangIndex] || '').trim();
        
        const isDateMatch = rowDate === today;
        const isCabangMatch = (userInfo.role === 'Admin' || rowCabang === userInfo.cabang);
        
        if (isDateMatch && isCabangMatch) {
            const total = parseFloat(row[totalIndex]) || 0;
            const qty = parseInt(row[qtyIndex]) || 0;
            const hargaSatuan = qty > 0 ? total / qty : 0; // Menghitung harga satuan

            transactions.push({
              timestamp: Utilities.formatDate(new Date(row[tsIndex]), ZONA_WAKTU, "HH:mm:ss"),
              produk: row[produkIndex],
              variasi: row[variasiIndex],
              qty: qty,
              hargaSatuan: hargaSatuan, // Menambahkan harga satuan ke data
              total: total,
              cabang: rowCabang
            });
        }
      }
    }
    
    if (userInfo.role === 'Admin') {
      const groupedByCabang = transactions.reduce((acc, trx) => {
        const cabang = trx.cabang;
        if (!acc[cabang]) {
          acc[cabang] = [];
        }
        acc[cabang].push(trx);
        return acc;
      }, {});
      return { groupedTransactions: groupedByCabang };
    }

    return { transactions: transactions };
  } catch (e) {
    Logger.log(e);
    return { error: e.toString() };
  }
}

