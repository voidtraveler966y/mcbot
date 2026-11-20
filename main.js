// main.js — MCBot masaüstü uygulaması (Electron).
// Botu başlatır ve kontrol panelini kendi penceresinde açar. Pencere kapanınca bot da kapanır.
// Geliştirirken:  npm start        Kurulum dosyası yapmak için:  npm run dagit

const { app, BrowserWindow, Menu, shell, dialog } = require('electron')
const path = require('path')
const net = require('net')

let pencere = null
let kontrol = null

// Aynı anda iki MCBot açılmasın (ikinci açılış eski pencereyi öne getirir)
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!pencere) return
    if (pencere.isMinimized()) pencere.restore()
    pencere.focus()
  })
  app.whenReady().then(basla)
}

// 3000 boşsa onu, doluysa rastgele boş bir port kullan
function bosPort(tercih) {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', () => {
      const s2 = net.createServer()
      s2.listen(0, '127.0.0.1', () => {
        const p = s2.address().port
        s2.close(() => resolve(p))
      })
    })
    s.listen(tercih, '127.0.0.1', () => s.close(() => resolve(tercih)))
  })
}

async function basla() {
  // Ayarlar ve Microsoft girişi kullanıcının kendi klasöründe dursun
  // (Windows'ta: C:\Users\<ad>\AppData\Roaming\MCBot)
  process.env.MCBOT_VERI = app.getPath('userData')
  process.env.MCBOT_ELECTRON = '1'
  process.env.MCBOT_PANEL_PORT = String(await bosPort(3000))

  let adres
  try {
    const bot = require('./bot')
    kontrol = bot.kontrol
    adres = await bot.panelHazir
  } catch (e) {
    dialog.showErrorBox('MCBot açılamadı', String((e && e.message) || e))
    app.quit()
    return
  }

  Menu.setApplicationMenu(null)
  pencere = new BrowserWindow({
    width: 1200,
    height: 880,
    minWidth: 700,
    minHeight: 500,
    title: 'MCBot',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#f4f5f2',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })

  // Panel dışındaki bağlantılar (ör. Microsoft giriş sayfası) normal tarayıcıda açılsın
  pencere.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  pencere.webContents.on('will-navigate', (olay, url) => {
    if (!url.startsWith(adres)) {
      olay.preventDefault()
      if (/^https:\/\//.test(url)) shell.openExternal(url)
    }
  })
  pencere.on('page-title-updated', (olay) => olay.preventDefault())
  pencere.on('closed', () => { pencere = null })
  pencere.loadURL(adres)
}

// Pencere kapanınca botu düzgünce oyundan çıkar, sonra uygulamayı kapat
app.on('window-all-closed', () => {
  try { if (kontrol) kontrol.durdur() } catch (e) { /* önemli değil */ }
  setTimeout(() => app.quit(), 700)
})
