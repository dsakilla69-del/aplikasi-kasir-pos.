const SPREADSHEET_ID = "19u_urYpqFrhISW68L2rn-xMf6v0FiYIjceRVV6uPDp8";
const ZONA_WAKTU = "Asia/Makassar"; // Zona Waktu Indonesia Tengah (GMT+8)

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
  if (!users) { return { success: false, message: 'Gagal mengakses data user.' }; }
  const userFound = users.find(user => user['Email'].toLowerCase() === email.toLowerCase());
  if (userFound) {
    if (userFound['Aktif'] === 'Ya') {
      return {
        success: true,
        user: { email: userFound['Email'], role: userFound['Role'], cabang: userFound['Cabang'] }
      };
    } else {
      return { success: false, message: 'User ditemukan namun tidak aktif.' };
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
    if (normalized.startsWith('0')) { return normalized.substring(1); }
    return normalized;
  };
  const inputNomorHp = normalizePhoneNumber(nomorHp);
  const memberFound = members.find(member => normalizePhoneNumber(member['Nomor HP']) === inputNomorHp);
  if (memberFound) {
    const status = memberFound['Status'] ? String(memberFound['Status']).trim() : '';
    if (status === 'Aktif') {
      return { success: true, nama: memberFound['Nama'] };
    } else {
      return { success: false, message: 'Member ditemukan namun tidak aktif.' };
    }
  } else {
    return { success: false, message: 'Member dengan nomor HP tersebut tidak ditemukan.' };
  }
}

// --- FUNGSI BARU UNTUK MENAMBAH MEMBER ---
function tambahMemberBaru(dataMember) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const memberSheet = ss.getSheetByName('Member');
    
    // Cek duplikasi nomor HP
    const data = memberSheet.getDataRange().getValues();
    const nomorHpColumn = data[0].indexOf('Nomor HP');
    const nomorHpExists = data.slice(1).some(row => String(row[nomorHpColumn]).replace(/\D/g, '') === String(dataMember.nomorHp).replace(/\D/g, ''));

    if (nomorHpExists) {
      return { success: false, message: 'Gagal: Nomor HP ini sudah terdaftar sebagai member.' };
    }

    const tanggalDaftar = new Date();
    // Sesuaikan dengan urutan kolom di sheet 'Member' Anda
    memberSheet.appendRow([
      dataMember.nomorHp,
      dataMember.nama,
      tanggalDaftar,
      'Aktif', // Status default
      '' // Kolom catatan kosong
    ]);

    return { success: true, message: `Member baru "${dataMember.nama}" berhasil didaftarkan!` };
  } catch (e) {
    Logger.log(e);
    return { success: false, message: 'Error di server: ' + e.toString() };
  }
}


function simpanTransaksi(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const trxSheet = ss.getSheetByName('Transaksi');
    const laporanSheet = ss.getSheetByName('Laporan');
    const timestamp = new Date();
    const idTransaksi = "TRX-" + timestamp.getTime();
    data.items.forEach(item => {
      const hargaJual = item.produk['Harga Jual'] || 0;
      const hargaAkhirSatuan = item.hargaAkhirSatuan || hargaJual;
      trxSheet.appendRow([ idTransaksi, timestamp, data.memberId, item.produk['ID Produk'], item.produk['Nama Produk'], item.produk['Ukuran/Variasi'], item.qty, hargaJual, hargaAkhirSatuan * item.qty, data.metodePembayaran, data.detailMetode, data.cabang ]);
    });
    updateLaporan(laporanSheet, timestamp, data.totalAkhir, data.metodePembayaran, data.cabang);
    return "Sukses";
  } catch (e) {
    Logger.log(e);
    return "Error: " + e.toString();
  }
}

function updateLaporan(sheet, timestamp, total, metode, cabang) {
  const tanggal = Utilities.formatDate(timestamp, ZONA_WAKTU, "yyyy-MM-dd");
  const data = sheet.getDataRange().getValues();
  let rowFound = -1;

  for (let i = 1; i < data.length; i++) {
    if(data[i][0]) {
      const rowDate = Utilities.formatDate(new Date(data[i][0]), ZONA_WAKTU, "yyyy-MM-dd");
      const rowCabang = data[i][1];
      if (rowDate === tanggal && rowCabang === cabang) {
        rowFound = i + 1;
        break;
      }
    }
  }

  if (rowFound !== -1) {
    const totalPenjualan = (parseFloat(sheet.getRange(rowFound, 3).getValue()) || 0) + total;
    const totalTunai = (parseFloat(sheet.getRange(rowFound, 4).getValue()) || 0) + (metode === 'Tunai' ? total : 0);
    const totalNonTunai = (parseFloat(sheet.getRange(rowFound, 5).getValue()) || 0) + (metode !== 'Tunai' ? total : 0);
    const jmlTransaksi = (parseInt(sheet.getRange(rowFound, 6).getValue()) || 0) + 1;
    
    sheet.getRange(rowFound, 3, 1, 4).setValues([[totalPenjualan, totalTunai, totalNonTunai, jmlTransaksi]]);
  } else {
    const formattedDate = new Date(tanggal + "T00:00:00");
    const newRow = [formattedDate, cabang, total, (metode === 'Tunai' ? total : 0), (metode !== 'Tunai' ? total : 0), 1];
    sheet.appendRow(newRow);
  }
}

function getLaporanHarian(userInfo) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Laporan');
    if (!sheet) { return { error: 'Sheet Laporan tidak ditemukan.' }; }
    
    const data = sheet.getDataRange().getValues();
    const today = Utilities.formatDate(new Date(), ZONA_WAKTU, "yyyy-MM-dd");
    const reports = [];

    for (let i = data.length - 1; i >= 1; i--) {
       if(data[i][0]) {
        const rowDate = Utilities.formatDate(new Date(data[i][0]), ZONA_WAKTU, "yyyy-MM-dd");
        if (rowDate === today) {
           const reportData = {
              cabang: data[i][1],
              totalPenjualan: data[i][2] || 0,
              totalTunai: data[i][3] || 0,
              totalNonTunai: data[i][4] || 0,
              jumlahTransaksi: data[i][5] || 0
           };
           reports.push(reportData);
        }
      }
    }

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

