// panel.js — botun kontrol paneli. Bot çalışırken tarayıcıda http://localhost:3000 adresinden açılır.
// Sadece bu bilgisayardan erişilebilir (127.0.0.1), başka kimse panele giremez.
// Tarayıcıda açık başka bir web sitesi de panele istek gönderemez (Host ve Content-Type kontrolü).

const http = require('http')
const { exec } = require('child_process')
const ayarlar = require('./ayarlar')
const lan = require('./lan')

const PANEL_PORT = Number(process.env.MCBOT_PANEL_PORT) || 3000
const IZINLI_HOST = [`localhost:${PANEL_PORT}`, `127.0.0.1:${PANEL_PORT}`]

function panelBaslat(kontrol) {
  const sunucu = http.createServer(async (istek, yanit) => {
    const gonder = (kod, veri) => {
      yanit.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8' })
      yanit.end(JSON.stringify(veri))
    }
    // Güvenlik: sadece bu bilgisayardaki panel sayfası konuşabilsin.
    // Host kontrolü "DNS rebinding" saldırısını, JSON zorunluluğu başka sitelerin gizli form göndermesini engeller.
    if (!IZINLI_HOST.includes(String(istek.headers.host || '').toLowerCase())) return gonder(403, { hata: 'İzin yok' })
    if (istek.method === 'POST' && !String(istek.headers['content-type'] || '').startsWith('application/json')) {
      return gonder(415, { hata: 'İzin yok' })
    }
    try {
      if (istek.method === 'GET' && istek.url === '/') {
        yanit.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        yanit.end(SAYFA)
        return
      }
      if (istek.method === 'GET' && istek.url === '/api/durum') {
        gonder(200, { ...kontrol.durumAl(), ayarlar: ayarlar.oku() })
        return
      }
      if (istek.method === 'GET' && istek.url === '/api/lan') {
        lan.dinle()
        gonder(200, { dunyalar: lan.liste(), ...lan.durum() })
        return
      }
      if (istek.method === 'GET' && istek.url === '/api/harita') {
        gonder(200, kontrol.haritaAl() || { yok: true })
        return
      }
      if (istek.method === 'POST') {
        const govde = await govdeOku(istek)
        if (istek.url === '/api/ayarlar') {
          const { hata, ayar } = ayarlar.dogrula(govde.ayarlar || {})
          if (hata) return gonder(400, { hata })
          const eski = ayarlar.oku()
          ayarlar.yaz(ayar)
          const baglantiDegisti = ['tur', 'host', 'port', 'lanAd', 'username', 'version', 'giris'].some((k) => eski[k] !== ayar[k])
          let mesaj = 'Kaydedildi.'
          if (baglantiDegisti && kontrol.calisiyorMu()) {
            kontrol.yenidenBaglan()
            mesaj = 'Kaydedildi, bot yeni ayarlarla yeniden bağlanıyor.'
          }
          console.log('Panel: ayarlar değişti ->', JSON.stringify({ ...ayar }))
          return gonder(200, { mesaj, ayarlar: ayar })
        }
        if (istek.url === '/api/kurulum') {
          // İlk açılış sihirbazı: tüm bağlantı ayarları + en az bir sahip
          const g = govde.ayarlar || {}
          if (!String(g.host || '').trim()) return gonder(400, { hata: 'Sunucu adresini yazın.' })
          if (!Array.isArray(g.sahipler) || !g.sahipler.some((s) => String(s).trim())) {
            return gonder(400, { hata: 'Oyundaki adınızı yazın; botu sadece siz yönetebileceksiniz.' })
          }
          const { hata, ayar } = ayarlar.dogrula({ ...g, kurulumTamam: true })
          if (hata) return gonder(400, { hata })
          ayarlar.yaz(ayar)
          console.log('Panel: kurulum tamamlandı ->', JSON.stringify(ayar))
          kontrol.baslat()
          return gonder(200, { mesaj: 'Kurulum tamam, bot bağlanıyor.', ayarlar: ayar })
        }
        if (istek.url === '/api/baslat') {
          kontrol.baslat()
          return gonder(200, { mesaj: 'Bot başlatılıyor.' })
        }
        if (istek.url === '/api/durdur') {
          kontrol.durdur()
          return gonder(200, { mesaj: 'Bot durduruldu.' })
        }
        if (istek.url === '/api/yeniden') {
          kontrol.yenidenBaglan()
          return gonder(200, { mesaj: 'Bot yeniden bağlanıyor.' })
        }
        if (istek.url === '/api/komut') {
          // Paneldeki komut düğmeleri: komut, seçilen sahibin sohbete yazmış gibi çalışır
          const metin = String(govde.metin || '').trim().slice(0, 250)
          if (!metin.startsWith('!')) return gonder(400, { hata: 'Komut ! ile başlamalı (ör. !gel).' })
          const hata = kontrol.komut(metin, String(govde.kim || ''))
          if (hata) return gonder(409, { hata })
          return gonder(200, { mesaj: metin + ' gönderildi.' })
        }
        if (istek.url === '/api/sohbet') {
          const metin = String(govde.metin || '').trim().slice(0, 250)
          if (!metin) return gonder(400, { hata: 'Mesaj boş.' })
          if (!kontrol.sohbet(metin)) return gonder(409, { hata: 'Bot şu an oyunda değil.' })
          return gonder(200, { mesaj: 'Gönderildi.' })
        }
      }
      gonder(404, { hata: 'Bulunamadı' })
    } catch (e) {
      gonder(500, { hata: e.message })
    }
  })

  // hazir: panel dinlemeye başlayınca adresiyle çözülür (uygulama penceresi bunu bekler)
  const hazir = new Promise((resolve, reject) => {
    sunucu.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.log(`Panel açılamadı: ${PANEL_PORT} portu kullanımda. Bot başka bir pencerede zaten çalışıyor olabilir.`)
      } else {
        console.log('Panel hatası:', e.message)
      }
      reject(e)
    })

    sunucu.listen(PANEL_PORT, '127.0.0.1', () => {
      const adres = `http://localhost:${PANEL_PORT}`
      console.log(`Kontrol paneli: ${adres}`)
      // Uygulama olarak (bilgisayar penceresi ya da telefon) çalışırken panel kendi penceresinde açılır
      if (ayarlar.oku().paneliAc && !process.env.MCBOT_ELECTRON && !process.env.MCBOT_MOBIL) {
        const komut = process.platform === 'win32' ? `start "" "${adres}"`
          : process.platform === 'darwin' ? `open "${adres}"` : `xdg-open "${adres}"`
        exec(komut, () => {})
      }
      resolve(adres)
    })
  })
  hazir.catch(() => {}) // "node bot.js" ile çalışırken yakalanmamış hata uyarısı çıkmasın
  return { sunucu, hazir }
}

function govdeOku(istek) {
  return new Promise((resolve, reject) => {
    let veri = ''
    istek.on('data', (parca) => {
      veri += parca
      if (veri.length > 100000) {
        reject(new Error('istek çok büyük'))
        istek.destroy()
      }
    })
    istek.on('end', () => {
      try {
        resolve(veri ? JSON.parse(veri) : {})
      } catch (e) {
        reject(new Error('geçersiz istek'))
      }
    })
    istek.on('error', reject)
  })
}

// ------------------------------------------------------------------ sayfa
const SAYFA = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bot Paneli</title>
<style>
  :root {
    --zemin: #f4f5f2; --kart: #ffffff; --yazi: #1d2120; --soluk: #67706c; --cizgi: #e2e5e0;
    --yesil: #3f8f3a; --yesil-acik: #e6f2e4; --kirmizi: #c2412d; --kirmizi-acik: #fbe9e6;
    --sari: #b7791f; --sari-acik: #fdf3e1; --gri-acik: #eef0ec;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 "Segoe UI", system-ui, sans-serif; background: var(--zemin); color: var(--yazi); }
  header { padding: 22px 28px 6px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  header h1 { font-size: 22px; margin: 0; letter-spacing: -0.01em; }
  .rozet { display: inline-flex; align-items: center; gap: 7px; padding: 4px 11px; border-radius: 999px;
    font-size: 13px; font-weight: 600; background: var(--gri-acik); color: var(--soluk); }
  .rozet::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
  .rozet.oyunda { background: var(--yesil-acik); color: var(--yesil); }
  .rozet.bekliyor { background: var(--sari-acik); color: var(--sari); }
  .rozet.kapali { background: var(--kirmizi-acik); color: var(--kirmizi); }
  main { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; padding: 16px 28px 32px; }
  .kart { background: var(--kart); border: 1px solid var(--cizgi); border-radius: 12px; padding: 18px 20px; }
  .kart h2 { font-size: 15px; margin: 0 0 14px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--soluk); }
  .genis { grid-column: 1 / -1; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; }
  dt { color: var(--soluk); } dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
  label { display: block; font-weight: 600; margin: 12px 0 4px; }
  label:first-of-type { margin-top: 0; }
  .ipucu { font-weight: 400; color: var(--soluk); font-size: 13px; }
  input[type=text] { width: 100%; padding: 9px 11px; border: 1px solid var(--cizgi); border-radius: 8px;
    font: inherit; background: #fbfcfa; }
  input[type=text]:focus { outline: 2px solid var(--yesil); outline-offset: -1px; background: #fff; }
  .satir { display: flex; gap: 8px; align-items: center; }
  .satir input { flex: 1; }
  button { font: inherit; font-weight: 600; border: 1px solid transparent; border-radius: 8px; padding: 9px 15px;
    cursor: pointer; background: var(--yesil); color: #fff; }
  button:hover { filter: brightness(1.07); }
  button.ikincil { background: #fff; color: var(--yazi); border-color: var(--cizgi); }
  button.tehlike { background: #fff; color: var(--kirmizi); border-color: #efc7bf; }
  button:disabled { opacity: 0.5; cursor: default; }
  .butonlar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
  .komut-izgara { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; margin-top: 12px; }
  .komut-izgara button { padding: 9px 8px; }
  .komut-izgara button.ayri { grid-column: 1 / -1; }
  .is-ad { font-weight: 600; }
  .kucuk-baslik { font-size: 13px; color: var(--soluk); margin: 12px 0 6px; }
  .kisa-liste { display: flex; flex-wrap: wrap; gap: 6px; }
  .kisa-liste button { padding: 5px 10px; font-size: 13px; font-weight: 500; }
  .kisa-liste .bos { color: var(--soluk); font-size: 13px; }
  #harita.tiklanir { cursor: crosshair; }
  .is-adim { color: var(--soluk); font-size: 13px; margin-top: 2px; overflow-wrap: anywhere; }
  .is-cubuk { height: 8px; background: var(--cizgi); border-radius: 4px; overflow: hidden; margin-top: 5px; max-width: 260px; }
  .is-cubuk span { display: block; height: 100%; background: var(--yesil, #3a8f3a); }
  .bildirim-liste { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 6px; max-height: 260px; overflow-y: auto; }
  .bildirim-liste li { display: flex; gap: 8px; align-items: baseline; font-size: 14px; padding: 6px 8px; border-radius: 8px; background: #f6f7f5; }
  .bildirim-liste li.kotu { background: #fbecea; }
  .bildirim-liste time { color: var(--soluk); font-size: 12px; white-space: nowrap; }
  .bildirim-liste .bos { background: none; color: var(--soluk); padding: 0; }
  .cipler { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; min-height: 34px; }
  .cip { display: inline-flex; align-items: center; gap: 6px; background: var(--gri-acik); border-radius: 999px;
    padding: 5px 6px 5px 12px; font-weight: 600; }
  .cip button { background: transparent; color: var(--soluk); padding: 0 7px; border-radius: 50%; font-size: 16px; line-height: 22px; }
  .cip button:hover { background: var(--kirmizi-acik); color: var(--kirmizi); }
  .bos { color: var(--soluk); font-style: italic; }
  .oyuncular { display: flex; flex-wrap: wrap; gap: 6px; }
  .oyuncu { font-size: 13px; background: var(--gri-acik); border-radius: 6px; padding: 3px 8px; cursor: pointer; border: 0; color: var(--yazi); font-weight: 500; }
  .oyuncu:hover { background: var(--yesil-acik); }
  .cubuk { height: 8px; background: var(--gri-acik); border-radius: 4px; overflow: hidden; width: 140px; display: inline-block; vertical-align: middle; margin-right: 8px; }
  .cubuk > span { display: block; height: 100%; background: var(--yesil); }
  .cubuk.aclik > span { background: var(--sari); }
  #kayit { background: #1c1f1e; color: #d7ddd9; font: 13px/1.55 Consolas, "Cascadia Mono", monospace; border-radius: 8px;
    padding: 12px 14px; height: 320px; overflow-y: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  /* canlı izleme */
  .simgeler { display: flex; gap: 2px; align-items: center; }
  .simgeler svg { width: 18px; height: 18px; display: block; }
  .yarim { position: relative; display: block; }
  .yarim > span { position: absolute; top: 0; left: 0; width: 50%; height: 100%; overflow: hidden; }
  .gosterge { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
  .gosterge .etiket { width: 58px; color: var(--soluk); font-size: 13px; }
  .gosterge .sayi { font-weight: 600; font-size: 13px; color: var(--soluk); }
  .xp { flex: 1; min-width: 140px; max-width: 220px; height: 7px; background: var(--gri-acik); border-radius: 4px; overflow: hidden; }
  .xp > span { display: block; height: 100%; background: #7cc84a; }
  .alt-baslik { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--soluk); margin: 14px 0 6px; font-weight: 600; }
  .izgara { display: grid; grid-template-columns: repeat(9, minmax(0, 54px)); gap: 4px; }
  .zirh-izgara { display: grid; grid-template-columns: repeat(5, minmax(0, 54px)); gap: 4px; }
  .yuva { position: relative; aspect-ratio: 1; background: #f0f2ee; border: 1px solid var(--cizgi); border-radius: 7px;
    display: flex; align-items: center; justify-content: center; text-align: center; overflow: hidden; }
  .yuva.dolu { background: var(--renk, #e9ece6); border-color: rgba(0,0,0,.08); }
  .yuva.secili { outline: 2px solid var(--yazi); outline-offset: 1px; }
  .yuva .ad { font-size: 9.5px; line-height: 1.15; font-weight: 600; color: #1d2120; padding: 2px; word-break: break-word; }
  .yuva .adet { position: absolute; right: 3px; bottom: 1px; font-size: 11px; font-weight: 700; color: #1d2120;
    text-shadow: 0 0 2px #fff, 0 0 2px #fff; }
  .yuva .dayanim { position: absolute; left: 4px; right: 4px; bottom: 3px; height: 3px; background: rgba(0,0,0,.18); border-radius: 2px; }
  .yuva .dayanim > span { display: block; height: 100%; border-radius: 2px; }
  .yuva .yer { font-size: 10px; color: #a3aaa6; }
  .eldeki { margin-top: 10px; font-size: 14px; }
  .eldeki b { font-weight: 600; }
  #bildirim { position: fixed; right: 20px; bottom: 20px; padding: 11px 16px; border-radius: 8px; font-weight: 600;
    box-shadow: 0 6px 20px rgba(0,0,0,.12); opacity: 0; transform: translateY(8px); transition: .2s; pointer-events: none; max-width: 420px; }
  #bildirim.goster { opacity: 1; transform: none; }
  #bildirim.iyi { background: var(--yesil); color: #fff; } #bildirim.kotu { background: var(--kirmizi); color: #fff; }
  select { width: 100%; padding: 9px 11px; border: 1px solid var(--cizgi); border-radius: 8px; font: inherit; background: #fbfcfa; }
  /* uyarı kutuları */
  .uyarilar { padding: 0 28px; display: grid; gap: 10px; }
  .uyari { border-radius: 10px; padding: 12px 16px; font-weight: 500; }
  .uyari[hidden] { display: none; }
  .uyari.hata { background: var(--kirmizi-acik); color: #7d2416; border: 1px solid #efc7bf; }
  .uyari.msa { background: var(--sari-acik); color: #6b4a12; border: 1px solid #ecd3a3; }
  .uyari.yeni { background: #e6effb; color: #1d3f73; border: 1px solid #bcd0ee; }
  /* harita */
  .harita-kutu { position: relative; width: 100%; max-width: 390px; }
  #harita { width: 100%; aspect-ratio: 1; image-rendering: pixelated; border-radius: 8px; background: #1c1f24; display: block; }
  .harita-alt { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12.5px; color: var(--soluk); margin-top: 8px; }
  .harita-alt i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; }
  .uyari .kod { font: 700 22px/1.2 Consolas, "Cascadia Mono", monospace; letter-spacing: .12em; background: #fff;
    padding: 4px 10px; border-radius: 6px; display: inline-block; margin: 6px 6px 0 0; user-select: all; }
  .uyari a { color: inherit; font-weight: 700; }
  /* ilk açılış sihirbazı */
  #sihirbaz { max-width: 560px; margin: 30px auto 40px; }
  #sihirbaz[hidden], main[hidden] { display: none; }
  #sihirbaz h2 { text-transform: none; letter-spacing: 0; color: var(--yazi); font-size: 20px; margin-bottom: 4px; }
  .secenekler { display: grid; gap: 8px; margin-top: 4px; }
  .secenek { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--cizgi); border-radius: 8px;
    padding: 10px 12px; cursor: pointer; font-weight: 400; margin: 0; }
  .secenek:has(input:checked) { border-color: var(--yesil); background: var(--yesil-acik); }
  .secenek input { margin-top: 4px; }
  .secenekler.iki { grid-template-columns: 1fr 1fr; }
  .lan-liste { display: grid; gap: 6px; margin-top: 4px; }
  .lan-dunya { text-align: left; background: #fff; color: var(--yazi); border: 1px solid var(--cizgi); font-weight: 500; display: block; width: 100%; }
  .lan-dunya b { display: block; }
  .lan-dunya .ipucu { display: block; margin: 0; font-weight: 400; }
  .lan-dunya.secili { border-color: var(--yesil); background: var(--yesil-acik); }
  .lan-bos { color: var(--soluk); font-size: 14px; padding: 10px; border: 1px dashed var(--cizgi); border-radius: 8px; }
  .secenek b { display: block; }
</style>
</head>
<body>
<header>
  <h1 id="baslik">Bot Paneli</h1>
  <span id="rozet" class="rozet">Yükleniyor…</span>
</header>
<div class="uyarilar">
  <div id="u-yeni" class="uyari yeni" hidden>
    <b>Yeni sürüm var:</b> MCBot <span id="u-yeni-surum"></span> (sizdeki <span id="u-yeni-eski"></span>).
    <a id="u-yeni-adres" href="#" target="_blank" rel="noopener">MCBot sitesinden indir</a>
  </div>
  <div id="u-hata" class="uyari hata" hidden></div>
  <div id="u-msa" class="uyari msa" hidden>
    <b>Microsoft hesabıyla giriş:</b> <a id="u-msa-adres" href="#" target="_blank" rel="noopener"></a>
    adresini açıp aşağıdaki kodu girin, ardından hesabınızla giriş yapın. Bunu bir kere yapmanız yeterli.<br>
    <span id="u-msa-kod" class="kod"></span>
  </div>
</div>

<section id="sihirbaz" class="kart" hidden>
  <h2>Hoş geldiniz! Botu kuralım</h2>
  <p class="ipucu" style="margin-top:0">Bu bilgileri sonra da panelden değiştirebilirsiniz.</p>
  <form id="f-kurulum" autocomplete="off">
    <label>Nereye girsin?</label>
    <div class="secenekler iki">
      <label class="secenek"><input type="radio" name="k-tur" value="sunucu" checked>
        <span><b>Sunucu</b><span class="ipucu">Aternos gibi adresi olan bir sunucu</span></span></label>
      <label class="secenek"><input type="radio" name="k-tur" value="lan">
        <span><b>LAN dünyası</b><span class="ipucu">Aynı evde "LAN'a Aç" ile açılan dünya</span></span></label>
    </div>
    <div id="k-lan-alan" hidden>
      <label>Açık LAN dünyaları <span class="ipucu">— birini seçin</span></label>
      <div class="lan-liste" id="k-lan-liste"></div>
      <p class="ipucu">Dünyayı açan oyunda Esc &gt; "LAN'a Aç" deyin; birkaç saniye içinde burada görünür. Port her açılışta değişir, bot güncelini kendisi bulur.
        Normal Minecraft LAN dünyaları hesabı doğrular: bot için satın alınmış bir hesap (Microsoft girişi) ya da dünyayı açanda LAN'ı offline yapan bir mod (ör. LAN World Plug-n-Play) gerekir.</p>
    </div>
    <div id="k-sunucu-alan">
    <label for="k-host">Sunucu adresi</label>
    <input type="text" id="k-host" placeholder="ornek.aternos.me" spellcheck="false">
    <label for="k-port">Port <span class="ipucu">— boş bırakırsanız otomatik bulunur</span></label>
    <input type="text" id="k-port" placeholder="otomatik" inputmode="numeric">
    </div>
    <label>Hesap türü</label>
    <div class="secenekler">
      <label class="secenek"><input type="radio" name="k-giris" value="offline" checked>
        <span><b>Korsan / offline sunucu</b><span class="ipucu">Aternos'ta "Cracked" açık sunucular gibi. Bota istediğiniz adı verirsiniz.</span></span></label>
      <label class="secenek"><input type="radio" name="k-giris" value="microsoft">
        <span><b>Normal (online) sunucu</b><span class="ipucu">Bot için satın alınmış ayrı bir Minecraft hesabı gerekir; Microsoft ile bir kere giriş yapılır. Oyundaki ad hesaptan gelir.</span></span></label>
    </div>
    <label for="k-isim">Bot adı <span class="ipucu">— 3-16 karakter, harf, rakam, _ ve .</span></label>
    <input type="text" id="k-isim" maxlength="16" spellcheck="false" value="MCBot">
    <label for="k-sahip">Sizin oyundaki adınız <span class="ipucu">— botu sadece siz yönetebileceksiniz</span></label>
    <input type="text" id="k-sahip" maxlength="16" spellcheck="false" placeholder="Minecraft adınız">
    <label for="k-surum">Minecraft sürümü <span class="ipucu">— bilmiyorsanız boş bırakın</span></label>
    <input type="text" id="k-surum" placeholder="otomatik" spellcheck="false">
    <div class="butonlar"><button type="submit">Kaydet ve başlat</button></div>
  </form>
</section>

<main id="ana" hidden>
  <section class="kart genis">
    <h2>Canlı izleme</h2>
    <div>
        <div class="gosterge"><span class="etiket">Can</span><span class="simgeler" id="kalpler"></span><span class="sayi" id="can-sayi"></span></div>
        <div class="gosterge"><span class="etiket">Açlık</span><span class="simgeler" id="butlar"></span><span class="sayi" id="aclik-sayi"></span></div>
        <div class="gosterge"><span class="etiket">Seviye</span><span class="xp"><span id="xp-dolu" style="width:0"></span></span><span class="sayi" id="seviye">0</span></div>
        <div class="eldeki">Elinde: <b id="eldeki">–</b></div>
        <div class="alt-baslik">Zırh ve sol el</div>
        <div class="zirh-izgara" id="zirh"></div>
        <div class="alt-baslik">Envanter</div>
        <div class="izgara" id="envanter"></div>
        <div class="alt-baslik">Alt bar</div>
        <div class="izgara" id="altbar"></div>
    </div>
  </section>

  <section class="kart">
    <h2>Durum</h2>
    <dl>
      <dt>Sunucu</dt><dd id="d-sunucu">–</dd>
      <dt>Bot adı</dt><dd id="d-isim">–</dd>
      <dt>Can</dt><dd id="d-can">–</dd>
      <dt>Açlık</dt><dd id="d-aclik">–</dd>
      <dt>Konum</dt><dd id="d-konum">–</dd>
      <dt>Şu an</dt><dd id="d-is">–</dd>
      <dt>Oyuncular</dt><dd><div id="d-oyuncular" class="oyuncular">–</div></dd>
    </dl>
    <div class="butonlar">
      <button id="b-baslat">Başlat</button>
      <button id="b-yeniden" class="ikincil">Yeniden bağlan</button>
      <button id="b-durdur" class="tehlike">Durdur</button>
    </div>
  </section>

  <section class="kart">
    <h2>Komutlar</h2>
    <div class="satir">
      <label for="i-kim" style="white-space:nowrap">Kim için:</label>
      <select id="i-kim" title="Gel, Takip et ve Koru bu oyuncuya göre çalışır"></select>
    </div>
    <div class="komut-izgara" id="komutlar">
      <button type="button" data-komut="!gel">Gel</button>
      <button type="button" data-komut="!takip">Takip et</button>
      <button type="button" data-komut="!koru">Koru</button>
      <button type="button" data-komut="!eve git" class="ikincil">Eve git</button>
      <button type="button" data-komut="!esyalarim" class="ikincil">Eşyalarımı topla</button>
      <button type="button" data-komut="!uyu" class="ikincil">Uyu</button>
      <button type="button" data-komut="!ev" class="ikincil">Taş ev yap</button>
      <button type="button" data-komut="!ev koylu" class="ikincil">Köylü evi yap</button>
      <button type="button" data-komut="!gelis" class="ikincil">Demir set (gelişim)</button>
      <button type="button" data-komut="!balik" class="ikincil">Balık tut</button>
      <button type="button" data-komut="!dur" class="tehlike ayri">Dur</button>
    </div>
    <form id="f-komut" class="satir" autocomplete="off" style="margin-top:12px">
      <input type="text" id="i-komut" placeholder="Başka komut: !topla odun 32" maxlength="250" spellcheck="false">
      <button type="submit" class="ikincil">Çalıştır</button>
    </form>
    <div class="kucuk-baslik">Kayıtlı noktalar (oyunda: !kaydet ad)</div>
    <div class="kisa-liste" id="nokta-liste"></div>
    <div class="kucuk-baslik">Son komutlar</div>
    <div class="kisa-liste" id="gecmis-liste"></div>
    <p class="ipucu" id="komut-bilgi" style="margin-bottom:0"></p>
  </section>

  <section class="kart">
    <h2>Bildirimler</h2>
    <div class="secenekler">
      <label><input type="checkbox" id="c-ses"> Sesli uyarı</label>
      <label id="c-masaustu-satir"><input type="checkbox" id="c-masaustu"> Masaüstü bildirimi (panel arkada olsa da görünür)</label>
    </div>
    <p class="ipucu" style="margin-bottom:0">Bot ölünce, canı azalınca, yardım isteyince, iş bitince ya da yarım kalınca, biri adını yazınca ve bağlantı kopunca.</p>
    <ul id="bildirim-liste" class="bildirim-liste"></ul>
  </section>

  <section class="kart">
    <h2>Harita</h2>
    <div class="harita-kutu"><canvas id="harita" width="390" height="390"></canvas></div>
    <div class="harita-alt">
      <span><i style="background:#fff;border:1px solid #333"></i>Bot (ok baktığı yön)</span>
      <span><i style="background:#3d8bfd"></i>Oyuncu</span>
      <span><i style="background:#e5413a"></i>Düşman</span>
      <span>Kuzey yukarıda · 65×65 blok</span>
    </div>
    <p class="ipucu" id="harita-bilgi" style="margin-bottom:0">–</p>
    <p class="ipucu" style="margin:6px 0 0">Haritada bir yere tıklayınca bot oraya yürür.</p>
  </section>

  <section class="kart">
    <h2>Bağlantı ayarları</h2>
    <form id="f-ayar" autocomplete="off">
      <label>Nereye girsin?</label>
    <div class="secenekler iki">
      <label class="secenek"><input type="radio" name="i-tur" value="sunucu" checked>
        <span><b>Sunucu</b><span class="ipucu">Aternos gibi adresi olan bir sunucu</span></span></label>
      <label class="secenek"><input type="radio" name="i-tur" value="lan">
        <span><b>LAN dünyası</b><span class="ipucu">Aynı evde "LAN'a Aç" ile açılan dünya</span></span></label>
    </div>
    <div id="i-lan-alan" hidden>
      <label>Açık LAN dünyaları <span class="ipucu">— birini seçin</span></label>
      <div class="lan-liste" id="i-lan-liste"></div>
      <p class="ipucu">Dünyayı açan oyunda Esc &gt; "LAN'a Aç" deyin; birkaç saniye içinde burada görünür. Port her açılışta değişir, bot güncelini kendisi bulur.
        Normal Minecraft LAN dünyaları hesabı doğrular: bot için satın alınmış bir hesap (Microsoft girişi) ya da dünyayı açanda LAN'ı offline yapan bir mod (ör. LAN World Plug-n-Play) gerekir.</p>
    </div>
    <div id="i-sunucu-alan">
      <label for="i-host">Sunucu adresi</label>
      <input type="text" id="i-host" placeholder="ornek.aternos.me" spellcheck="false">
      <label for="i-port">Port <span class="ipucu">— boş bırakırsanız otomatik bulunur</span></label>
      <input type="text" id="i-port" placeholder="otomatik" inputmode="numeric">
      </div>
      <label for="i-isim">Bot adı <span class="ipucu">— 3-16 karakter, harf, rakam, _ ve .</span></label>
      <input type="text" id="i-isim" maxlength="16" spellcheck="false">
      <label for="i-surum">Minecraft sürümü <span class="ipucu">— boş bırakırsanız otomatik</span></label>
      <input type="text" id="i-surum" placeholder="otomatik" spellcheck="false">
      <label for="i-giris">Giriş türü</label>
      <select id="i-giris">
        <option value="offline">Korsan / offline (ad sizden)</option>
        <option value="microsoft">Microsoft hesabı (satın alınmış hesap)</option>
      </select>
      <div class="butonlar"><button type="submit">Kaydet ve bağlan</button></div>
    </form>
  </section>

  <section class="kart">
    <h2>Sahipler</h2>
    <p class="ipucu" style="margin-top:0">Botu sadece bu oyuncular yönetebilir. Liste boşsa kimse komut veremez.
      Diğer oyuncular yalnızca <b>!yardimet</b> yazabilir.</p>
    <div id="cipler" class="cipler"></div>
    <form id="f-sahip" class="satir" autocomplete="off">
      <input type="text" id="i-sahip" placeholder="Oyuncu adı" maxlength="16" spellcheck="false">
      <button type="submit">Ekle</button>
    </form>
    <p class="ipucu">İpucu: Durum kartındaki bir oyuncu adına tıklayınca buraya yazılır.</p>
  </section>

  <section class="kart genis">
    <h2>Kayıt</h2>
    <div id="kayit"></div>
    <form id="f-sohbet" class="satir" autocomplete="off" style="margin-top:10px">
      <input type="text" id="i-sohbet" placeholder="Botun ağzından sohbete mesaj yaz" maxlength="250">
      <button type="submit" class="ikincil">Gönder</button>
    </form>
  </section>
</main>
<footer style="text-align:center;color:var(--soluk);font-size:13px;padding:0 0 22px">MCBot <span id="surum"></span> — VoidTraveler tarafından yapılmıştır</footer>
<div id="bildirim"></div>

<script>
const $ = (id) => document.getElementById(id)
let ayar = null
let formDolduruldu = false
let sonHarita = null
let haritaTiklanir = false
let haritaHedef = null // { x, z, zaman }: tıklanan yer, bot varana kadar haritada işaretli

function bildir(metin, iyi = true) {
  const b = $('bildirim')
  b.textContent = metin
  b.className = 'goster ' + (iyi ? 'iyi' : 'kotu')
  clearTimeout(bildir.z)
  bildir.z = setTimeout(() => { b.className = '' }, 3500)
}

async function istek(yol, govde) {
  const y = await fetch(yol, govde === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde),
  })
  const veri = await y.json()
  if (!y.ok) throw new Error(veri.hata || 'Hata')
  return veri
}

function cubuk(deger, sinif) {
  const yuzde = Math.max(0, Math.min(100, (deger / 20) * 100))
  return '<span class="cubuk ' + sinif + '"><span style="width:' + yuzde + '%"></span></span>' + Math.round(deger) + '/20'
}

function sahipleriCiz() {
  const k = $('cipler')
  k.innerHTML = ''
  if (!ayar.sahipler.length) {
    k.innerHTML = '<span class="bos">Liste boş — kimse komut veremez</span>'
    return
  }
  for (const ad of ayar.sahipler) {
    const c = document.createElement('span')
    c.className = 'cip'
    c.textContent = ad
    const x = document.createElement('button')
    x.type = 'button'
    x.title = ad + ' adlı oyuncuyu çıkar'
    x.textContent = '×'
    x.onclick = () => sahipKaydet(ayar.sahipler.filter((s) => s !== ad), ad + ' çıkarıldı.')
    c.appendChild(x)
    k.appendChild(c)
  }
}

async function sahipKaydet(liste, mesaj) {
  try {
    const v = await istek('/api/ayarlar', { ayarlar: { sahipler: liste } })
    ayar = v.ayarlar
    sahipleriCiz()
    bildir(mesaj)
  } catch (e) { bildir(e.message, false) }
}

const KALP = '<svg viewBox="0 0 16 16"><path d="M8 14.2 1.9 8.1A3.6 3.6 0 0 1 8 3.3a3.6 3.6 0 0 1 6.1 4.8z" fill="FILL" stroke="#7a1f14" stroke-width="1"/></svg>'
const BUT = '<svg viewBox="0 0 16 16"><path d="M10.2 1.8a4 4 0 0 1 4 4c0 2.6-2.7 4.6-5 4.6l-3.5 3.4a1.4 1.4 0 1 1-2-2l-.1-.1a1.4 1.4 0 1 1 2-2l3.4-3.5c0-2.3 1.2-4.4 1.2-4.4z" fill="FILL" stroke="#6b3b12" stroke-width="1"/></svg>'

function simgeDizisi(deger, sablon, dolu, bos) {
  const tam = sablon.replace('FILL', dolu)
  const yok = sablon.replace('FILL', bos)
  let h = ''
  for (let i = 0; i < 10; i++) {
    const kalan = deger - i * 2
    if (kalan >= 2) h += tam
    else if (kalan >= 1) h += '<span class="yarim">' + yok + '<span>' + tam + '</span></span>'
    else h += yok
  }
  return h
}

const MALZEME_RENK = [
  ['netherite', '#8a7b84'], ['diamond', '#9de8e0'], ['iron', '#d7dcdf'], ['golden', '#f2dc7d'], ['gold', '#f2dc7d'],
  ['stone', '#c3c7c8'], ['cobble', '#c3c7c8'], ['deepslate', '#a2a4ab'], ['wooden', '#d9b88c'], ['_log', '#c9a174'],
  ['_planks', '#e3c89b'], ['stick', '#e3c89b'], ['leather', '#c99b74'], ['coal', '#9a9a9a'], ['raw_', '#e8c9b0'],
  ['dirt', '#c7a988'], ['crafting', '#e3c89b'], ['furnace', '#c3c7c8'], ['beef', '#f0b3a6'], ['bread', '#f0d49b'],
]
function renkBul(ad) {
  for (const [parca, renk] of MALZEME_RENK) if (ad.includes(parca)) return renk
  return '#e4e8e1'
}

function yuvaHtml(it, secili, bosYazi) {
  if (!it) return '<div class="yuva' + (secili ? ' secili' : '') + '">' + (bosYazi ? '<span class="yer">' + bosYazi + '</span>' : '') + '</div>'
  const d = it.dayanim
  const dRenk = d === null ? '' : d > 50 ? '#3f8f3a' : d > 20 ? '#d29922' : '#c2412d'
  return '<div class="yuva dolu' + (secili ? ' secili' : '') + '" style="--renk:' + renkBul(it.ad) + '" title="' + it.gorunen + (it.adet > 1 ? ' ×' + it.adet : '') + (d !== null ? ' — dayanıklılık %' + d : '') + '">' +
    '<span class="ad">' + it.gorunen + '</span>' +
    (it.adet > 1 ? '<span class="adet">' + it.adet + '</span>' : '') +
    (d !== null && d < 100 ? '<span class="dayanim"><span style="width:' + d + '%;background:' + dRenk + '"></span></span>' : '') +
    '</div>'
}

function canliCiz(v) {
  const b = v.bot
  // can, açlık, seviye
  $('kalpler').innerHTML = b ? simgeDizisi(b.can, KALP, '#e5413a', '#dcdcdc') : ''
  $('butlar').innerHTML = b ? simgeDizisi(b.aclik, BUT, '#c97a3a', '#dcdcdc') : ''
  $('can-sayi').textContent = b ? Math.round(b.can) + '/20' : '–'
  $('aclik-sayi').textContent = b ? b.aclik + '/20' : '–'
  $('seviye').textContent = b ? b.seviye : '–'
  $('xp-dolu').style.width = b ? Math.round((b.xpYuzde || 0) * 100) + '%' : '0'

  // envanter
  const yuva = {}
  if (b) for (const it of b.envanter) yuva[it.yuva] = it
  const eldeki = b ? yuva[b.eldekiYuva] : null
  $('eldeki').textContent = eldeki ? eldeki.gorunen + (eldeki.adet > 1 ? ' ×' + eldeki.adet : '') : (b ? 'boş el' : '–')
  $('zirh').innerHTML = [[5, 'kask'], [6, 'göğüs'], [7, 'pantolon'], [8, 'bot'], [45, 'sol el']]
    .map(([i, y]) => yuvaHtml(yuva[i], false, y)).join('')
  let h = ''
  for (let i = 9; i <= 35; i++) h += yuvaHtml(yuva[i], false)
  $('envanter').innerHTML = h
  h = ''
  for (let i = 36; i <= 44; i++) h += yuvaHtml(yuva[i], b && b.eldekiYuva === i)
  $('altbar').innerHTML = h
}

async function yenile() {
  let v
  try { v = await istek('/api/durum') } catch (e) {
    $('rozet').className = 'rozet kapali'
    $('rozet').textContent = 'Panele ulaşılamıyor (bot kapalı mı?)'
    return
  }
  ayar = v.ayarlar
  // ilk açılış: kurulum yapılmadıysa sadece sihirbazı göster
  $('sihirbaz').hidden = ayar.kurulumTamam
  $('ana').hidden = !ayar.kurulumTamam
  $('u-hata').hidden = !v.sonHata
  $('u-hata').textContent = v.sonHata || ''
  $('u-msa').hidden = !v.msaKod
  $('surum').textContent = v.surum || ''
  $('u-yeni').hidden = !v.guncelleme
  if (v.guncelleme) {
    $('u-yeni-surum').textContent = v.guncelleme.surum
    $('u-yeni-eski').textContent = v.surum
    $('u-yeni-adres').href = v.guncelleme.adres
  }
  if (v.msaKod) {
    $('u-msa-adres').textContent = v.msaKod.adres
    $('u-msa-adres').href = v.msaKod.adres
    $('u-msa-kod').textContent = v.msaKod.kod
  }
  canliCiz(v)
  const r = $('rozet')
  r.textContent = v.durum
  r.className = 'rozet ' + (v.oyunda ? 'oyunda' : v.calisiyor ? 'bekliyor' : 'kapali')
  $('baslik').textContent = (v.bot ? v.bot.isim : ayar.username) + ' — Bot Paneli'
  document.title = $('baslik').textContent
  $('d-sunucu').textContent = v.sunucu || (ayar.host + (ayar.port ? ':' + ayar.port : ''))
  $('d-isim').textContent = v.bot ? v.bot.isim : ayar.username
  $('d-can').innerHTML = v.bot ? cubuk(v.bot.can, '') : '–'
  $('d-aclik').innerHTML = v.bot ? cubuk(v.bot.aclik, 'aclik') : '–'
  $('d-konum').textContent = v.bot && v.bot.konum ? v.bot.konum.join('  ') : '–'
  const o = $('d-oyuncular')
  o.innerHTML = ''
  if (v.bot && v.bot.oyuncular.length) {
    for (const ad of v.bot.oyuncular) {
      const b = document.createElement('button')
      b.className = 'oyuncu'
      b.type = 'button'
      b.textContent = ad + (ayar.sahipler.includes(ad) ? ' ★' : '')
      b.title = 'Sahip ekleme kutusuna yaz'
      b.onclick = () => { $('i-sahip').value = ad; $('i-sahip').focus() }
      o.appendChild(b)
    }
  } else o.textContent = '–'
  $('b-baslat').disabled = v.calisiyor || !ayar.kurulumTamam
  $('b-durdur').disabled = !v.calisiyor
  $('b-yeniden').disabled = !v.calisiyor

  if (!formDolduruldu) {
    $('i-host').value = ayar.host
    $('i-port').value = ayar.port || ''
    $('i-isim').value = ayar.username
    $('i-surum').value = ayar.version
    $('i-giris').value = ayar.giris
    turSec('i', ayar.tur || 'sunucu')
    if (ayar.tur === 'lan' && ayar.host) lanSecim.i = { host: ayar.host, port: ayar.port, ad: ayar.lanAd || '' }
    formDolduruldu = true
  }
  sahipleriCiz()
  kimListesiCiz(v)
  isCiz(v.is)
  bildirimleriIsle(v.bildirimler)
  noktalariCiz(v)
  haritaTiklanir = Boolean(v.oyunda) && ((ayar && ayar.sahipler) || []).length > 0
  $('harita').classList.toggle('tiklanir', haritaTiklanir)

  const k = $('kayit')
  const enAltta = k.scrollTop + k.clientHeight >= k.scrollHeight - 30
  k.textContent = v.loglar.join('\\n')
  if (enAltta) k.scrollTop = k.scrollHeight
}

$('f-ayar').onsubmit = async (e) => {
  e.preventDefault()
  try {
    const v = await istek('/api/ayarlar', { ayarlar: Object.assign({
      username: $('i-isim').value, version: $('i-surum').value, giris: $('i-giris').value,
    }, baglantiAlanlari('i')) })
    ayar = v.ayarlar
    $('i-host').value = ayar.host
    $('i-port').value = ayar.port || ''
    bildir(v.mesaj)
    yenile()
  } catch (e) { bildir(e.message, false) }
}

$('f-kurulum').onsubmit = async (e) => {
  e.preventDefault()
  const secili = document.querySelector('input[name="k-giris"]:checked')
  try {
    const v = await istek('/api/kurulum', { ayarlar: Object.assign({
      username: $('k-isim').value, version: $('k-surum').value, giris: secili ? secili.value : 'offline',
      sahipler: [$('k-sahip').value],
    }, baglantiAlanlari('k')) })
    ayar = v.ayarlar
    formDolduruldu = false
    bildir(v.mesaj)
    yenile()
  } catch (e) { bildir(e.message, false) }
}

$('f-sahip').onsubmit = (e) => {
  e.preventDefault()
  const ad = $('i-sahip').value.trim()
  if (!ad) return
  if (ayar.sahipler.some((s) => s.toLowerCase() === ad.toLowerCase())) { bildir(ad + ' zaten sahip.', false); return }
  $('i-sahip').value = ''
  sahipKaydet([...ayar.sahipler, ad], ad + ' sahip yapıldı.')
}

$('f-sohbet').onsubmit = async (e) => {
  e.preventDefault()
  const metin = $('i-sohbet').value.trim()
  if (!metin) return
  try { await istek('/api/sohbet', { metin }); $('i-sohbet').value = ''; yenile() } catch (e) { bildir(e.message, false) }
}

for (const [id, yol] of [['b-baslat', '/api/baslat'], ['b-durdur', '/api/durdur'], ['b-yeniden', '/api/yeniden']]) {
  $(id).onclick = async () => {
    try { const v = await istek(yol, {}); bildir(v.mesaj); yenile() } catch (e) { bildir(e.message, false) }
  }
}

// ---------------------------------------------------------------- nereye girsin: sunucu / LAN
// on: 'k' (ilk kurulum) ya da 'i' (bağlantı ayarları)
const lanSecim = { k: null, i: null } // seçilen LAN dünyası { host, port, ad }
function seciliTur(on) {
  const r = document.querySelector('input[name="' + on + '-tur"]:checked')
  return r ? r.value : 'sunucu'
}
function turSec(on, tur) {
  for (const r of document.querySelectorAll('input[name="' + on + '-tur"]')) r.checked = r.value === tur
  turGoster(on)
}
function turGoster(on) {
  const lanMi = seciliTur(on) === 'lan'
  $(on + '-lan-alan').hidden = !lanMi
  $(on + '-sunucu-alan').hidden = lanMi
  if (lanMi) lanYenile()
}
for (const on of ['k', 'i']) {
  for (const r of document.querySelectorAll('input[name="' + on + '-tur"]')) r.onchange = () => turGoster(on)
}
// Kaydederken gönderilecek bağlantı alanları
function baglantiAlanlari(on) {
  if (seciliTur(on) === 'lan') {
    const d = lanSecim[on]
    if (!d) return { tur: 'lan', host: '' } // sunucu "Listeden bir LAN dünyası seçin" der
    return { tur: 'lan', host: d.host, port: d.port, lanAd: d.ad }
  }
  return { tur: 'sunucu', host: $(on + '-host').value, port: $(on + '-port').value }
}

let lanSon = []
async function lanYenile() {
  const gorunen = ['k', 'i'].filter((on) => !$(on + '-lan-alan').hidden && !$(on + '-lan-alan').closest('[hidden]'))
  if (!gorunen.length) return
  try { const v = await istek('/api/lan'); lanSon = v.dunyalar || []; lanSon.hata = v.hata } catch (e) { return }
  for (const on of gorunen) lanCiz(on)
}
function lanCiz(on) {
  const kutu = $(on + '-lan-liste')
  const secili = lanSecim[on]
  const liste = lanSon.slice()
  // kayıtlı dünya şu an kapalıysa da seçili olarak görünsün
  if (secili && !liste.some((d) => d.host === secili.host && d.ad === secili.ad)) {
    liste.push({ ad: secili.ad || 'Kayıtlı LAN dünyası', host: secili.host, port: secili.port, kapali: true })
  }
  kutu.innerHTML = ''
  if (!liste.length) {
    const b = document.createElement('div')
    b.className = 'lan-bos'
    b.textContent = lanSon.hata ? 'Ağ dinlenemiyor: ' + lanSon.hata : 'Açık LAN dünyası aranıyor…'
    kutu.appendChild(b)
    return
  }
  for (const d of liste) {
    const b = document.createElement('button')
    b.type = 'button'
    const seciliMi = secili && secili.host === d.host && (secili.ad === d.ad || !secili.ad)
    b.className = 'lan-dunya' + (seciliMi ? ' secili' : '')
    const ad = document.createElement('b')
    ad.textContent = d.ad
    const alt = document.createElement('span')
    alt.className = 'ipucu'
    alt.textContent = (d.yerel ? 'Bu bilgisayar' : d.host) + ' · port ' + d.port + (d.kapali ? ' · şu an kapalı' : '')
    b.appendChild(ad)
    b.appendChild(alt)
    b.onclick = () => { lanSecim[on] = { host: d.host, port: d.port, ad: d.ad }; lanCiz(on) }
    kutu.appendChild(b)
  }
}
setInterval(lanYenile, 2000)

// ---------------------------------------------------------------- şu an ne yapıyor
function sureYazi(sn) {
  if (sn < 60) return sn + ' sn'
  return Math.floor(sn / 60) + ' dk ' + (sn % 60) + ' sn'
}
function isCiz(is) {
  const d = $('d-is')
  d.innerHTML = ''
  if (!is) { d.textContent = '–'; return }
  const ad = document.createElement('div')
  ad.className = 'is-ad'
  ad.textContent = is.ad + (is.sure ? ' · ' + sureYazi(is.sure) : '')
  d.appendChild(ad)
  if (is.toplam) {
    const c = document.createElement('div')
    c.className = 'is-cubuk'
    const dolu = document.createElement('span')
    dolu.style.width = Math.min(100, Math.round((is.sayi / is.toplam) * 100)) + '%'
    c.appendChild(dolu)
    c.title = is.sayi + '/' + is.toplam
    d.appendChild(c)
  }
  if (is.adim) {
    const adim = document.createElement('div')
    adim.className = 'is-adim'
    adim.textContent = is.adim
    d.appendChild(adim)
  }
}

// ---------------------------------------------------------------- bildirimler
const KOTU_BILDIRIM = ['olum', 'hata', 'baglanti', 'can']
const SIMGE = { olum: '💀', can: '❤️', yardim: '🙋', is: '✅', hata: '⚠️', ad: '💬', baglanti: '🔌' }
function tercihOku(ad, varsayilan) {
  try { const v = localStorage.getItem('mcbot-' + ad); return v === null ? varsayilan : v === '1' } catch (e) { return varsayilan }
}
function tercihYaz(ad, deger) {
  try { localStorage.setItem('mcbot-' + ad, deger ? '1' : '0') } catch (e) {}
}
const masaustuVar = typeof Notification !== 'undefined'
$('c-ses').checked = tercihOku('ses', true)
$('c-masaustu').checked = masaustuVar && tercihOku('masaustu', false) && Notification.permission === 'granted'
$('c-masaustu-satir').hidden = !masaustuVar
$('c-ses').onchange = () => { tercihYaz('ses', $('c-ses').checked); if ($('c-ses').checked) sesCal('is') }
$('c-masaustu').onchange = async () => {
  const kutu = $('c-masaustu')
  if (kutu.checked && Notification.permission !== 'granted') {
    let izin = 'denied'
    try { izin = await Notification.requestPermission() } catch (e) {}
    if (izin !== 'granted') { kutu.checked = false; bildir('Masaüstü bildirimine izin verilmedi.', false) }
  }
  tercihYaz('masaustu', kutu.checked)
}

let sesBaglam = null
function sesCal(tur) {
  try {
    if (!sesBaglam) sesBaglam = new (window.AudioContext || window.webkitAudioContext)()
    if (sesBaglam.state === 'suspended') sesBaglam.resume()
    const notalar = KOTU_BILDIRIM.includes(tur) ? [440, 330] : [660, 880]
    notalar.forEach((frekans, i) => {
      const o = sesBaglam.createOscillator()
      const g = sesBaglam.createGain()
      o.type = 'sine'
      o.frequency.value = frekans
      const t = sesBaglam.currentTime + i * 0.18
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      o.connect(g)
      g.connect(sesBaglam.destination)
      o.start(t)
      o.stop(t + 0.17)
    })
  } catch (e) {}
}
// Tarayıcılar sesi ilk tıklamadan sonra açar
document.addEventListener('click', () => { if (sesBaglam && sesBaglam.state === 'suspended') sesBaglam.resume() })

let sonBildirim = null
let bildirimImza = ''
function bildirimleriIsle(liste) {
  liste = liste || []
  const enSon = liste.length ? liste[liste.length - 1].no : 0
  if (sonBildirim !== null && enSon > sonBildirim) {
    for (const b of liste.filter((x) => x.no > sonBildirim)) {
      const iyi = !KOTU_BILDIRIM.includes(b.tur)
      bildir((SIMGE[b.tur] || '') + ' ' + b.metin, iyi)
      if ($('c-ses').checked) sesCal(b.tur)
      if (masaustuVar && $('c-masaustu').checked && Notification.permission === 'granted') {
        try {
          const n = new Notification('MCBot', { body: b.metin, tag: 'mcbot-' + b.no })
          n.onclick = () => window.focus()
        } catch (e) {}
      }
    }
  }
  sonBildirim = enSon // ilk açılışta eskiler için ses çalmasın; bot yeniden başlayınca sayı sıfırlanır
  const imza = String(enSon) + ':' + liste.length
  if (imza === bildirimImza) return
  bildirimImza = imza
  const ul = $('bildirim-liste')
  ul.innerHTML = ''
  const son = liste.slice(-10).reverse()
  if (!son.length) {
    const li = document.createElement('li')
    li.className = 'bos'
    li.textContent = 'Henüz bildirim yok.'
    ul.appendChild(li)
    return
  }
  for (const b of son) {
    const li = document.createElement('li')
    if (KOTU_BILDIRIM.includes(b.tur)) li.className = 'kotu'
    const zaman = document.createElement('time')
    zaman.textContent = new Date(b.zaman).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    const metin = document.createElement('span')
    metin.textContent = (SIMGE[b.tur] || '') + ' ' + b.metin
    li.appendChild(zaman)
    li.appendChild(metin)
    ul.appendChild(li)
  }
}

// ---------------------------------------------------------------- komut düğmeleri
// "Kim için" listesi: oyundaki sahipler önce, sonra diğer sahipler (oyunda değil)
function kimListesiCiz(v) {
  const sec = $('i-kim')
  const oyundakiler = v.bot ? v.bot.oyuncular : []
  const kucuk = (x) => x.toLowerCase()
  const sahipler = (ayar && ayar.sahipler) || []
  const oyunda = sahipler.filter((s) => oyundakiler.some((o) => kucuk(o) === kucuk(s)))
  const disarida = sahipler.filter((s) => !oyunda.includes(s))
  const secenekler = oyunda.map((s) => [s, s]).concat(disarida.map((s) => [s, s + ' (oyunda değil)']))
  const imza = JSON.stringify(secenekler)
  if (sec.dataset.imza !== imza) {
    const onceki = sec.value
    sec.innerHTML = ''
    for (const [deger, yazi] of secenekler) {
      const o = document.createElement('option')
      o.value = deger
      o.textContent = yazi
      sec.appendChild(o)
    }
    if (secenekler.some(([d]) => d === onceki)) sec.value = onceki
    sec.dataset.imza = imza
  }
  const hazir = Boolean(v.oyunda) && secenekler.length > 0
  for (const b of document.querySelectorAll('#komutlar button, #f-komut button')) b.disabled = !hazir
  $('komut-bilgi').textContent = !v.oyunda ? 'Bot oyunda değilken komut verilemez.'
    : !secenekler.length ? 'Önce aşağıdan bir sahip ekleyin.'
    : 'Komutlar seçilen sahip sohbete yazmış gibi çalışır; bot cevabını sohbete yazar (aşağıdaki kayıtlarda görünür).'
}

async function komutGonder(metin) {
  try {
    const v = await istek('/api/komut', { metin, kim: $('i-kim').value })
    bildir(v.mesaj)
    gecmiseEkle(metin)
    yenile()
  } catch (e) { bildir(e.message, false) }
}

// Son 10 komut (bu bilgisayarda saklanır); tıklayınca tekrar çalışır
function gecmisOku() {
  try { const g = JSON.parse(localStorage.getItem('mcbot-gecmis') || '[]'); return Array.isArray(g) ? g : [] } catch (e) { return [] }
}
function gecmiseEkle(metin) {
  const g = [metin].concat(gecmisOku().filter((x) => x !== metin)).slice(0, 10)
  try { localStorage.setItem('mcbot-gecmis', JSON.stringify(g)) } catch (e) {}
  gecmisCiz()
}
function gecmisCiz() {
  const kutu = $('gecmis-liste')
  kutu.innerHTML = ''
  const g = gecmisOku()
  if (!g.length) {
    const b = document.createElement('span')
    b.className = 'bos'
    b.textContent = 'Panelden verilen komutlar burada görünür.'
    kutu.appendChild(b)
    return
  }
  for (const metin of g) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'ikincil'
    b.textContent = metin
    b.title = 'Tekrar çalıştır'
    b.onclick = () => komutGonder(metin)
    kutu.appendChild(b)
  }
}
gecmisCiz()

// Kayıtlı noktalar: tıklayınca bot oraya gider
let noktaImza = ''
function noktalariCiz(v) {
  const liste = ((ayar && ayar.noktalar) || []).filter((n) => n.sunucu === ayar.host)
  const imza = JSON.stringify(liste) + String(Boolean(v.oyunda))
  if (imza === noktaImza) return
  noktaImza = imza
  const kutu = $('nokta-liste')
  kutu.innerHTML = ''
  if (!liste.length) {
    const b = document.createElement('span')
    b.className = 'bos'
    b.textContent = 'Henüz yok. Oyunda bir yerde durup !kaydet maden yazın.'
    kutu.appendChild(b)
    return
  }
  for (const n of liste) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'ikincil'
    b.textContent = n.ad
    b.title = 'Git: ' + n.x + ' ' + n.y + ' ' + n.z
    b.disabled = !v.oyunda
    b.onclick = () => komutGonder('!git ' + n.ad)
    kutu.appendChild(b)
  }
}
for (const b of document.querySelectorAll('#komutlar button')) b.onclick = () => komutGonder(b.dataset.komut)
$('f-komut').onsubmit = (e) => {
  e.preventDefault()
  let metin = $('i-komut').value.trim()
  if (!metin) return
  if (!metin.startsWith('!')) metin = '!' + metin
  $('i-komut').value = ''
  komutGonder(metin)
}

yenile()
setInterval(yenile, 1000)

// ---------------------------------------------------------------- harita
$('harita').onclick = (e) => {
  const h = sonHarita
  if (!haritaTiklanir || !h || h.yok) return
  const cv = $('harita')
  const kutu = cv.getBoundingClientRect()
  const s = kutu.width / h.n
  const dx = Math.floor((e.clientX - kutu.left) / s) - h.r
  const dz = Math.floor((e.clientY - kutu.top) / s) - h.r
  const x = h.merkez[0] + dx
  const z = h.merkez[2] + dz
  haritaHedef = { x, z, zaman: Date.now() }
  komutGonder('!git ' + x + ' ' + z)
  haritaYenile()
}

async function haritaYenile() {
  if (document.hidden || $('ana').hidden) return
  let h
  try { h = await istek('/api/harita') } catch (e) { return }
  const cv = $('harita')
  const c = cv.getContext('2d')
  c.fillStyle = '#1c1f24'
  c.fillRect(0, 0, cv.width, cv.height)
  sonHarita = h
  if (!h || h.yok) {
    $('harita-bilgi').textContent = 'Bot oyunda değil.'
    return
  }
  const n = h.n
  const s = cv.width / n
  for (let i = 0; i < n * n; i++) {
    if (!h.renkler[i]) continue
    c.fillStyle = h.renkler[i]
    c.fillRect((i % n) * s, Math.floor(i / n) * s, Math.ceil(s), Math.ceil(s))
  }
  const yer = (dx, dz) => [(dx + h.r + 0.5) * s, (dz + h.r + 0.5) * s]
  const nokta = (x, y, r, renk) => {
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2)
    c.fillStyle = renk; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#111'; c.stroke()
  }
  for (const d of h.dusmanlar) { const [x, y] = yer(d.dx, d.dz); nokta(x, y, s * 0.75, '#e5413a') }
  c.font = 'bold 11px system-ui, sans-serif'
  c.textAlign = 'center'
  for (const o of h.oyuncular) {
    const [x, y] = yer(o.dx, o.dz)
    nokta(x, y, s * 0.9, '#3d8bfd')
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.75)'; c.strokeText(o.ad, x, y - s * 1.4)
    c.fillStyle = '#fff'; c.fillText(o.ad, x, y - s * 1.4)
  }
  // tıklanan hedef: bot varınca ya da 3 dakika geçince silinir
  if (haritaHedef) {
    const hx = haritaHedef.x - h.merkez[0]
    const hz = haritaHedef.z - h.merkez[2]
    if ((Math.abs(hx) <= 1 && Math.abs(hz) <= 1) || Date.now() - haritaHedef.zaman > 180000) haritaHedef = null
    else if (Math.abs(hx) <= h.r && Math.abs(hz) <= h.r) {
      const [tx, ty] = yer(hx, hz)
      c.lineWidth = 2.5; c.strokeStyle = '#ffd23f'
      c.beginPath(); c.moveTo(tx - s * 1.2, ty - s * 1.2); c.lineTo(tx + s * 1.2, ty + s * 1.2)
      c.moveTo(tx + s * 1.2, ty - s * 1.2); c.lineTo(tx - s * 1.2, ty + s * 1.2); c.stroke()
    }
  }
  // bot: baktığı yöne dönük ok (yaw 0 = kuzey, yön vektörü (-sin, -cos))
  const [bx, by] = yer(0, 0)
  const ix = -Math.sin(h.yon), iy = -Math.cos(h.yon)
  const r = s * 1.6
  c.beginPath()
  c.moveTo(bx + ix * r, by + iy * r)
  c.lineTo(bx - ix * r * 0.6 - iy * r * 0.7, by - iy * r * 0.6 + ix * r * 0.7)
  c.lineTo(bx - ix * r * 0.6 + iy * r * 0.7, by - iy * r * 0.6 - ix * r * 0.7)
  c.closePath()
  c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#111'; c.stroke()
  $('harita-bilgi').textContent = (h.yuzeyde ? 'Yer üstü' : 'Yer altı (botun katı)') + ' · Merkez: ' + h.merkez.join(' ') + ' · ' +
    h.oyuncular.length + ' oyuncu, ' + h.dusmanlar.length + ' düşman yakında'
}
setInterval(haritaYenile, 2000)
haritaYenile()
</script>
</body>
</html>`

module.exports = { panelBaslat }
