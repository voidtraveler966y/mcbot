const mineflayer = require('mineflayer')
const { Vec3 } = require('vec3')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { gelisimKur } = require('./gelisim')
const { gelisim2Kur } = require('./gelisim2')
const { komutlarKur } = require('./komutlar')
const ayarlar = require('./ayarlar')
const { panelBaslat } = require('./panel')
const util = require('util')

// Sunucu adresi, port, bot adı, sürüm, giriş türü ve sahipler ayarlar.json dosyasında.
// En kolayı kontrol panelinden değiştirmek: bot çalışırken http://localhost:3000
// (uygulama olarak çalışınca panel kendi penceresinde açılır). İlk açılışta panel kurulum sorar.
// Sahip olmayanlar sadece !yardimet yazabilir (bota eşya yapıp vermek için).

// Terminale yazılan her satırı panelde göstermek için son 300 satırı sakla
const LOGLAR = []
const asilLog = console.log
console.log = (...parcalar) => {
  // Kütüphanelerin bastığı ham hata yığınları sadece terminale gitsin; panelde Türkçe hali görünür
  if (parcalar[0] instanceof Error) return asilLog(...parcalar)
  const saat = new Date().toLocaleTimeString('tr-TR')
  const satir = util.format(...parcalar)
  LOGLAR.push(saat + '  ' + satir)
  if (LOGLAR.length > 300) LOGLAR.shift()
  asilLog(...parcalar)
}

const TEKRAR_BAGLANMA_SN = 15

// Komutlar (Türkçe harfle de yazılabilir: !göm, !eğil, !yardım ...):
//   !yardim           -> komut listesini yazar
//   !gom              -> kaz ve üstünü kapat
//   !egil / !kalk     -> eğil / ayağa kalk
//   !git x y z        -> o koordinata yürü (y'siz hali: !git x z)
//   !gel              -> komutu yazanın yanına gel
//   !takip            -> komutu yazanı takip et (!dur diyene kadar)
//   !takip isim       -> o oyuncuyu takip et
//   !vur isim         -> o oyuncuya elindekiyle vur (isim yoksa en yakın yaratığa)
//   !yumruk isim      -> aynısı; envanterde kılıç varsa en iyisini alıp onla, yoksa yumrukla
//   !dur              -> ne yapıyorsa bıraksın
//   !konum            -> koordinatlarını söyle
//   !spawn / !yatak   -> en yakın yatağa gidip sağ tıklar, doğma noktası orası olur
//   !yaz mesaj        -> bot o mesajı sohbete yazar (sadece sahipler)
//   !durum            -> can ve açlık bilgisini söyle
//   !gelis            -> kendi kendine gelişsin: odun, taş, kömür, demir...
//                        sonunda full demir zırh + demir kazma/balta/kılıç
//   !gelis2           -> demir set tamamsa elmas set için çalışsın (derine iner, elmas arar)
//   !envanter         -> üstünde ne var söylesin
//   !yardimet         -> bot demir set için yardım isteyince yaz: yanına gelir,
//                        demir külçe ve çubuk atar, yaptığın eşyaları geri alır
//   !ver [isim] eşya [adet|hepsi] -> eşyayı sana (ya da o oyuncuya) atar. Örnek: !ver demir 10
//   !sandik           -> en yakın sandığa gereksiz eşyaları koyar (alet, zırh, yemek, meşale kalır)
//   !sandik hepsi     -> aletler ve zırh dışında her şeyi koyar;  !sandik eşya -> sadece o eşyayı
//   !topla malzeme [adet] -> odun, tas, komur, demir, bakir, altin, toprak, kum, cakil (varsayılan 16)
//   !yap eşya [adet]  -> üretir (gerekirse çalışma masası koyar). Örnek: !yap mesale 8, !yap tas kazma
//   !uyu              -> gece ise en yakın yatağa gidip uyur;  !uyu oto -> her gece kendisi uyusun (aç/kapa)
// Hem genel sohbetten hem de /msg ile yazılanlar çalışır.

const YARDIM = [
  '!gom, !egil, !kalk, !git x y z, !git x z',
  '!yaz mesaj, !spawn, !gel, !takip [isim], !vur [isim], !yumruk [isim], !dur, !konum, !durum',
  '!gelis (demir set), !gelis2 (elmas set), !envanter, !yardimet',
  '!ver [isim] esya [adet], !sandik [hepsi|esya], !topla odun 32, !yap mesale 8, !uyu, !uyu oto',
]

let otoUyku = false // !uyu oto: her gece kendiliğinden yatağa gitsin (yeniden bağlanınca da kalır)

// Yürürken (pathfinder) asla kırmasın: oyuncuların yapıları zarar görmesin
const KIRMA_YASAK = (isim) =>
  isim.endsWith('_planks') || isim.endsWith('_door') || isim.endsWith('_bed') ||
  isim.endsWith('glass') || isim.endsWith('glass_pane') || isim.endsWith('_stairs') ||
  isim.endsWith('_slab') || isim.endsWith('_fence') || isim.endsWith('_wool') ||
  ['bricks', 'chest', 'barrel', 'crafting_table', 'furnace', 'bookshelf', 'torch'].includes(isim)

// "!Göm" -> "!gom": büyük/küçük harf ve Türkçe karakter farkını ortadan kaldırır
function sadelestir(metin) {
  return metin
    .toLocaleLowerCase('tr')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
}

// Port yazılmadıysa sunucunun portunu adresinden bul (SRV kaydı).
// Önce bilgisayarın kendi DNS'i, olmazsa Cloudflare ve Google DNS denenir.
async function portBul(host) {
  const { Resolver } = require('dns').promises
  for (const sunucular of [null, ['1.1.1.1', '8.8.8.8']]) {
    try {
      const cozucu = new Resolver({ timeout: 4000, tries: 2 })
      if (sunucular) cozucu.setServers(sunucular)
      const kayitlar = await cozucu.resolveSrv('_minecraft._tcp.' + host)
      if (kayitlar.length) return { host: kayitlar[0].name, port: kayitlar[0].port }
    } catch (e) {
      console.log(`Port aranırken hata (${sunucular ? 'Cloudflare/Google DNS' : 'bilgisayarın DNS\'i'}):`, e.code || e.message)
    }
  }
  return null
}

// ------------------------------------------------------------------ başlat / durdur
// Panelden botu başlatıp durdurabilmek ve ayar değişince yeniden bağlamak için
let aktifBot = null // şu an bağlı (ya da bağlanmaya çalışan) bot
let calisiyor = false // durdurulmadıysa true: bağlantı koparsa tekrar dener
let hemenBaglan = false // yeniden bağlan istendi: kopunca beklemeden bağlan
let zamanlayici = null
let durumYazi = 'Kapalı'
let baglanilanSunucu = ''
let baslatiliyor = false
let sonHata = '' // panelde kırmızı kutuda gösterilir; oyuna girince silinir
let msaKod = null // Microsoft girişi için kullanıcının gireceği kod { kod, adres, bitis }

// Bağlantı hatalarını herkesin anlayacağı Türkçeye çevir
function hataCevir(e) {
  const kod = e && e.code
  const m = String((e && e.message) || e || '')
  if (kod === 'ECONNREFUSED') return 'Sunucu bağlantıyı reddetti. Sunucu kapalı olabilir (Aternos\'ta "Başlat"a bastınız mı?) ya da port yanlış.'
  if (kod === 'ENOTFOUND' || kod === 'EAI_AGAIN') return 'Sunucu adresi bulunamadı. Adresin yazımını ve internet bağlantısını kontrol edin.'
  if (kod === 'ETIMEDOUT' || /timed? ?out/i.test(m)) return 'Sunucu cevap vermedi. Sunucu açık mı, adres ve port doğru mu?'
  if (kod === 'ECONNRESET' || kod === 'EPIPE') return 'Sunucuyla bağlantı koptu.'
  if (/not supported|unsupported|protocol version/i.test(m)) return 'Bu Minecraft sürümü desteklenmiyor. Panelden sürümü düzeltin ya da boş bırakın (otomatik).'
  if (/profile|xbox|msa|authenticat|token/i.test(m)) return 'Microsoft girişi başarısız: ' + m
  return m
}

// Sunucunun "atıldın" mesajı bazen düz yazı, bazen JSON ya da NBT nesnesi: içindeki yazıları topla
function duzMetin(sebep) {
  let veri = sebep
  if (typeof veri === 'string') {
    try { veri = JSON.parse(veri) } catch (e) { return veri }
  }
  const parcalar = []
  const gez = (d, anahtar) => {
    if (typeof d === 'string') {
      if (['text', 'translate', 'value', undefined].includes(anahtar)) parcalar.push(d)
    } else if (Array.isArray(d)) {
      d.forEach((x) => gez(x))
    } else if (d && typeof d === 'object') {
      for (const [k, v] of Object.entries(d)) if (k !== 'type' && k !== 'color') gez(v, k)
    }
  }
  gez(veri)
  return parcalar.join(' ').replace(/\s+/g, ' ').trim() || String(sebep)
}

function atilmaCevir(sebep) {
  const metin = duzMetin(sebep)
  const k = metin.toLowerCase()
  if (k.includes('whitelist') || k.includes('white-list') || k.includes('not_whitelisted')) return 'Sunucunun beyaz listesinde (whitelist) değilsiniz. Sunucu sahibi botu listeye eklemeli.'
  if (k.includes('outdated') || k.includes('incompatible')) return 'Sürüm uyuşmuyor. Panelden sürümü düzeltin ya da boş bırakın (otomatik).'
  if (k.includes('unverified_username') || k.includes('failed to verify') || k.includes('not authenticated') || k.includes('invalid session')) {
    return 'Bu sunucu gerçek bir Microsoft hesabı istiyor. Panelden giriş türünü "Microsoft hesabı" yapın.'
  }
  if (k.includes('banned')) return 'Bu sunucudan yasaklanmışsınız: ' + metin
  if (k.includes('duplicate_login') || k.includes('another location')) return 'Aynı isimle başka biri sunucuya girdi.'
  if (k.includes('name_taken') || k.includes('already connected') || k.includes('already online')) return 'Bu isimde bir oyuncu zaten oyunda. Panelden bot adını değiştirin.'
  return 'Sunucu attı: ' + metin
}

function tekrarPlanla() {
  clearTimeout(zamanlayici)
  if (!calisiyor) return
  durumYazi = `Bekliyor, ${TEKRAR_BAGLANMA_SN} sn sonra tekrar denenecek`
  zamanlayici = setTimeout(() => baslat(), TEKRAR_BAGLANMA_SN * 1000)
}

const kontrol = {
  baslat: () => baslat(),
  durdur() {
    calisiyor = false
    clearTimeout(zamanlayici)
    durumYazi = 'Durduruldu'
    if (aktifBot) aktifBot.quit('Panelden durduruldu')
    console.log('Bot panelden durduruldu.')
  },
  yenidenBaglan() {
    calisiyor = true
    clearTimeout(zamanlayici)
    if (aktifBot) {
      hemenBaglan = true
      aktifBot.quit('Yeniden bağlanılıyor')
    } else {
      baslat()
    }
  },
  calisiyorMu: () => calisiyor,
  sohbet(metin) {
    if (!aktifBot || !aktifBot.entity) return false
    aktifBot.chat(metin)
    return true
  },
  durumAl() {
    const b = aktifBot
    const oyunda = Boolean(b && b.entity)
    return {
      durum: durumYazi,
      calisiyor,
      oyunda,
      sonHata,
      msaKod: msaKod && msaKod.bitis > Date.now() ? msaKod : null,
      sunucu: baglanilanSunucu,
      bot: oyunda ? {
        isim: b.username,
        can: b.health,
        aclik: b.food,
        doygunluk: b.foodSaturation,
        seviye: b.experience ? b.experience.level : 0,
        xpYuzde: b.experience ? b.experience.progress : 0,
        konum: [b.entity.position.x, b.entity.position.y, b.entity.position.z].map(Math.floor),
        oyuncular: Object.keys(b.players).filter((a) => a !== b.username),
        eldekiYuva: 36 + (b.quickBarSlot || 0),
        envanter: envanterListesi(b),
      } : null,
      loglar: LOGLAR.slice(-150),
    }
  },
}

// Panel için envanter: zırh (5-8), envanter (9-35), alt bar (36-44), sol el (45)
function envanterListesi(b) {
  const liste = []
  const yuvalar = (b.inventory && b.inventory.slots) || []
  for (let i = 5; i <= 45; i++) {
    const it = yuvalar[i]
    if (!it) continue
    let dayanim = null
    if (it.maxDurability) {
      const kullanilan = it.durabilityUsed || 0
      dayanim = Math.max(0, Math.round(((it.maxDurability - kullanilan) / it.maxDurability) * 100))
    }
    liste.push({ yuva: i, ad: it.name, gorunen: it.displayName || it.name, adet: it.count, dayanim })
  }
  return liste
}

async function baslat() {
  clearTimeout(zamanlayici)
  const ayar = ayarlar.oku()
  if (!ayar.kurulumTamam || !ayar.host) {
    // İlk açılış: panelden kurulum yapılınca panel botu başlatır
    calisiyor = false
    durumYazi = 'Kurulum bekleniyor'
    return
  }
  calisiyor = true
  if (aktifBot || baslatiliyor) return
  baslatiliyor = true
  try {
    await baglan()
  } catch (e) {
    sonHata = hataCevir(e)
    console.log('Başlatma hatası:', sonHata)
    tekrarPlanla()
  } finally {
    baslatiliyor = false
  }
}

async function baglan() {
  const ayar = ayarlar.oku()
  const secenek = {
    host: ayar.host,
    port: ayar.port || undefined,
    username: ayar.username,
    version: ayar.version || false, // false: sunucunun sürümünü kendisi bulsun
    auth: ayar.giris === 'microsoft' ? 'microsoft' : 'offline',
    profilesFolder: ayarlar.HESAP_KLASORU, // Microsoft girişi bir kere yapılınca burada hatırlanır
    onMsaCode: (d) => {
      msaKod = { kod: d.user_code, adres: d.verification_uri, bitis: Date.now() + (d.expires_in || 900) * 1000 }
      durumYazi = 'Microsoft girişi bekleniyor'
      console.log(`Microsoft girişi: ${d.verification_uri} adresine gidip şu kodu girin: ${d.user_code}`)
    },
  }
  if (!secenek.port) {
    durumYazi = 'Port aranıyor'
    const bulunan = await portBul(ayar.host)
    if (!calisiyor) return // bu arada panelden durduruldu
    // port aranırken panelden ayar değiştiyse yeni ayarlarla baştan başla
    if (JSON.stringify(ayarlar.oku()) !== JSON.stringify(ayar)) return baglan()
    if (bulunan) {
      secenek.host = bulunan.host
      secenek.port = bulunan.port
      console.log(`Port bulundu: ${bulunan.port}`)
    } else {
      sonHata = 'Sunucunun portu bulunamadı. Sunucu açık mı? Açıksa panelden portu elle yazın.'
      console.log(sonHata)
      tekrarPlanla()
      return
    }
  }
  baglanilanSunucu = `${ayar.host}${ayar.port ? '' : ' → ' + secenek.host}:${secenek.port}`
  console.log('Bağlanılıyor:', secenek.host + ':' + secenek.port, 'adı:', secenek.username)
  durumYazi = 'Bağlanıyor'
  const bot = mineflayer.createBot(secenek)
  aktifBot = bot
  let mesgul = false // uzun süren bir iş (göm, git, gel) yapıyor mu?
  let durduruldu = false // !dur ile mi kesildi? (o zaman "ulaşamadım" demesin)
  let gelisim = null // !gelis beyni, dünyaya doğunca kurulur
  let gelisim2 = null // !gelis2 beyni (elmas set)
  let komutlar = null // !ver, !sandik, !topla, !yap, !uyu
  let calisanIs = '' // ölünce "tekrar denemek için ... yaz" diyebilmek için

  bot.loadPlugin(pathfinder)

  bot.on('login', () => {
    console.log('Sunucuya girdi')
    durumYazi = 'Giriş yaptı'
    msaKod = null
  })
  bot.on('spawn', () => {
    durumYazi = 'Oyunda'
    sonHata = ''
  })
  // Sohbeti panelde de göster
  bot.on('messagestr', (mesaj, konum) => {
    if (konum !== 'game_info' && mesaj.trim()) console.log('[Sohbet]', mesaj)
  })
  bot.once('spawn', () => {
    console.log('Dünyada doğdu. Sunucu sürümü:', bot.version)
    const hareket = new Movements(bot)
    for (const blok of bot.registry.blocksArray) {
      if (KIRMA_YASAK(blok.name)) hareket.blocksCantBreak.add(blok.id)
    }
    bot.pathfinder.setMovements(hareket)
    bot.pathfinder.thinkTimeout = 10000 // uzun yollar için daha çok düşünsün
    gelisim = gelisimKur(bot, hareket)
    gelisim2 = gelisim2Kur(bot, gelisim.araclar)
    komutlar = komutlarKur(bot, gelisim.araclar)
  })

  // Zırh kırılınca (ya da bir yuva boşsa) envanterdeki en iyi yedeği giy
  const ZIRH_PARCA = [['_helmet', 'head', 'Kaskım'], ['_chestplate', 'torso', 'Göğüslüğüm'],
    ['_leggings', 'legs', 'Pantolonum'], ['_boots', 'feet', 'Botum']]
  const MALZEME_SIRA = ['netherite', 'diamond', 'iron', 'chainmail', 'golden', 'leather', 'turtle']
  let zirhGiyiyor = false
  async function zirhKontrol(kirilan) {
    if (zirhGiyiyor || !bot.entity || bot.currentWindow) return
    zirhGiyiyor = true
    try {
      for (const [son, yer, ad] of ZIRH_PARCA) {
        if (bot.inventory.slots[bot.getEquipmentDestSlot(yer)]) continue // zaten giyili
        const yedek = bot.inventory.items()
          .filter((it) => it.name.endsWith(son))
          .sort((a, b) => MALZEME_SIRA.indexOf(a.name.split('_')[0]) - MALZEME_SIRA.indexOf(b.name.split('_')[0]))[0]
        if (!yedek) {
          if (kirilan === yer) bot.chat(`${ad} kırıldı, yedeğim yok.`)
          continue
        }
        await bot.equip(yedek, yer)
        if (kirilan === yer) bot.chat(`${ad} kırıldı, yedeğini giydim.`)
      }
    } catch (e) {
      console.log('Zırh giyilemedi:', e.message)
    } finally {
      zirhGiyiyor = false
    }
  }
  // Envanter bot dünyaya doğunca hazır oluyor; dinleyiciyi o zaman bağla
  bot.once('spawn', () => {
    bot.inventory.on('updateSlot', (yuva, eski, yeni) => {
      // zırh yuvaları: 5 kask, 6 göğüslük, 7 pantolon, 8 bot
      if (yuva < 5 || yuva > 8 || !eski || yeni) return
      const yer = ['head', 'torso', 'legs', 'feet'][yuva - 5]
      setTimeout(() => zirhKontrol(yer), 500)
    })
  })

  // !vur / !yumruk hedefi
  let saldiriHedef = null
  let saldiriCevap = null

  // Kendini koru: dibine gelen düşman yaratığa vur. !vur verildiyse hedefe vur.
  let tik = 0
  bot.on('physicsTick', () => {
    if (++tik % 12 === 0 && saldiriHedef && bot.entity) {
      if (!bot.entities[saldiriHedef.id] || !saldiriHedef.isValid) {
        if (saldiriCevap) saldiriCevap('Hedef gitti, vurmayı bıraktım.')
        saldiriHedef = null
        bot.pathfinder.setGoal(null)
      } else if (saldiriHedef.position.distanceTo(bot.entity.position) < 3.5) {
        bot.lookAt(saldiriHedef.position.offset(0, saldiriHedef.height * 0.8, 0), true)
        bot.attack(saldiriHedef)
      }
      return
    }
    if (tik % 200 === 0) zirhKontrol() // 10 saniyede bir boş zırh yuvası var mı bak
    if (tik % 600 === 0) otoUyu() // 30 saniyede bir: gece olduysa yatağa gitsin mi?
    if (tik % 10 !== 0 || !bot.entity) return
    if (bot.targetDigBlock || bot.currentWindow) return // kazarken / fırındayken bozmayalım
    const dusman = bot.nearestEntity((e) =>
      e.type === 'hostile' && e.position.distanceTo(bot.entity.position) < 3.5)
    if (dusman) bot.attack(dusman)
  })
  bot.on('death', () => {
    console.log('Öldü, yeniden doğuyor')
    bot.pathfinder.setGoal(null)
    if (mesgul) {
      bot.chat(calisanIs
        ? `Öldüm, işi bıraktım. Tekrar denemek için ${calisanIs} yaz.`
        : 'Öldüm, işi bıraktım.')
    }
    if (gelisim) gelisim.iptal()
    durduruldu = true
  })
  bot.on('kicked', (sebep) => {
    sonHata = atilmaCevir(sebep)
    console.log('Atıldı:', sonHata)
  })
  bot.on('error', (e) => {
    sonHata = hataCevir(e)
    console.log('Hata:', sonHata)
  })
  bot.on('end', (sebep) => {
    if (aktifBot === bot) aktifBot = null
    if (hemenBaglan) {
      hemenBaglan = false
      console.log('Bağlantı kapatıldı, yeni ayarlarla bağlanılıyor.')
      baslat()
    } else if (calisiyor) {
      console.log('Bağlantı bitti:', sebep, `- ${TEKRAR_BAGLANMA_SN} saniye sonra tekrar denenecek`)
      tekrarPlanla()
    } else {
      console.log('Bağlantı kapatıldı.')
      durumYazi = 'Durduruldu'
    }
  })

  // Sahip listesi her komutta ayarlar.json'dan okunur: panelden değişince hemen geçerli olur.
  // Liste boşsa kimse komut veremez (yabancılar botu yönetemesin); panelden sahip ekleyin.
  function yetkiliMi(kim) {
    return ayarlar.oku().sahipler.some((s) => s.toLowerCase() === kim.toLowerCase())
  }

  function oyuncuyuBul(kim) {
    const oyuncu = bot.players[kim]
    return oyuncu && oyuncu.entity ? oyuncu.entity : null
  }

  // Yazılan ismi oyundaki oyuncu adına çevir (büyük/küçük harf fark etmez, baş harfleri yeter)
  function oyuncuAdi(yazilan) {
    const adlar = Object.keys(bot.players).filter((a) => a !== bot.username)
    const kucuk = yazilan.toLowerCase()
    return adlar.find((a) => a.toLowerCase() === kucuk) ||
      (adlar.filter((a) => a.toLowerCase().startsWith(kucuk)).length === 1
        ? adlar.find((a) => a.toLowerCase().startsWith(kucuk))
        : null)
  }

  // Uzun süren işleri tek yerden yönetir: aynı anda iki iş yapmasın, hatayı bildirsin
  // En yakın yatağa git, sağ tıkla: doğma noktası o yatak olur.
  // Gündüz bot uyuyamaz ama doğma noktası yine ayarlanır. Gece uyursa hemen kalkar.
  async function yatakSpawnAl(cevap) {
    const yatakIdleri = bot.registry.blocksArray.filter((b) => b.name.endsWith('_bed')).map((b) => b.id)
    const yatak = bot.findBlock({ matching: yatakIdleri, maxDistance: 48 })
    if (!yatak) throw new Error('48 blok içinde yatak yok')
    const p = yatak.position
    cevap(`Yatağa gidiyorum (${p.x} ${p.y} ${p.z}).`)
    bot.setControlState('sneak', false) // eğilikken sağ tık yatağa yatmaz
    await bot.pathfinder.goto(new goals.GoalNear(p.x, p.y, p.z, 2))

    // Sunucunun cevabını dinle (doğma noktası ayarlandı / gece değil / canavar var ...)
    const mesajlar = []
    const dinle = (mesaj) => {
      const ceviri = mesaj.translate || ''
      if (ceviri.startsWith('block.minecraft.') || ceviri.startsWith('sleep.')) mesajlar.push(ceviri)
    }
    bot.on('message', dinle)
    try {
      await bot.lookAt(p.offset(0.5, 0.5, 0.5))
      await bot.activateBlock(bot.blockAt(p))
      await bot.waitForTicks(30)
    } finally {
      bot.removeListener('message', dinle)
    }
    if (bot.isSleeping) {
      await bot.wake().catch(() => {})
    }
    console.log('Yatak cevapları:', mesajlar.join(', ') || 'yok')

    if (mesajlar.includes('block.minecraft.set_spawn')) {
      cevap('Doğma noktam artık bu yatak.')
    } else if (mesajlar.includes('block.minecraft.bed.not_safe')) {
      cevap('Yakında canavar var, yatak kabul etmedi. Ortalık temizlenince tekrar dene.')
    } else if (mesajlar.includes('block.minecraft.bed.too_far_away')) {
      cevap('Yatağa yeterince yaklaşamadım.')
    } else if (mesajlar.includes('block.minecraft.bed.obstructed')) {
      cevap('Yatağın üstü kapalı, kullanamıyorum.')
    } else if (mesajlar.includes('block.minecraft.bed.occupied')) {
      cevap('Yatakta başkası yatıyor.')
    } else {
      cevap('Yatağa sağ tıkladım. Doğma noktası zaten bu yataksa sunucu ayrıca bir şey demez.')
    }
  }

  // tekrar: ölünce "tekrar denemek için ... yaz" mesajında söylenecek komut (yoksa söylenmez)
  async function isYap(cevap, is, basariMesaji, hataOneki, tekrar = '') {
    if (mesgul) {
      cevap('Meşgulüm, önce !dur yaz.')
      return
    }
    mesgul = true
    durduruldu = false
    calisanIs = tekrar
    try {
      await is()
      if (basariMesaji) cevap(basariMesaji)
    } catch (e) {
      if (!durduruldu) cevap(hataOneki + e.message)
    } finally {
      mesgul = false
      calisanIs = ''
    }
  }

  // !uyu oto açıksa: gece olunca, boştaysa (iş yapmıyor, kimseyi takip etmiyor) yatağa gitsin.
  // Hataları sohbete yazmaz (yatak yoksa her 30 sn'de bir şikâyet etmesin), sadece terminale.
  function otoUyu() {
    if (!otoUyku || !komutlar || mesgul || saldiriHedef || bot.isSleeping) return
    if (bot.pathfinder.goal || !komutlar.geceMi()) return
    const sessiz = (m) => console.log('[Oto uyku]', m)
    isYap(sessiz, () => komutlar.uyu(sessiz), null, 'Uyuyamadım: ')
  }

  async function komutCalistir(kim, mesaj, ozel) {
    if (kim === bot.username) return
    if (!mesaj.trim().startsWith('!')) return

    const cevap = (m) => (ozel ? bot.whisper(kim, m) : bot.chat(m))
    const parcalar = sadelestir(mesaj.trim()).split(/\s+/)
    const komut = parcalar[0]
    const isimYazilan = mesaj.trim().split(/\s+/)[1] // oyuncu adı (büyük/küçük harfi korunmuş)
    // Sahip olmayanlar sadece bota yardım edebilir
    if (!yetkiliMi(kim) && komut !== '!yardimet') return

    switch (komut) {
      case '!yardim':
        YARDIM.forEach((satir) => cevap(satir))
        return

      case '!egil':
        bot.setControlState('sneak', true)
        cevap('Eğildim.')
        return

      case '!kalk':
        bot.setControlState('sneak', false)
        cevap('Kalktım.')
        return

      case '!dur':
        durduruldu = true
        if (gelisim) gelisim.iptal()
        bot.pathfinder.setGoal(null)
        bot.pathfinder.stop()
        bot.stopDigging()
        bot.clearControlStates()
        saldiriHedef = null
        if (bot.isSleeping) bot.wake().catch(() => {})
        cevap('Durdum.')
        return

      case '!yaz':
      case '!soyle': {
        // komuttan sonraki her şeyi olduğu gibi (büyük/küçük harf ve Türkçe karakterler korunarak) yaz
        const metin = mesaj.trim().replace(/^\S+\s*/, '').slice(0, 256)
        if (!metin) {
          cevap('Kullanım: !yaz merhaba millet')
          return
        }
        bot.chat(metin)
        return
      }

      case '!spawn':
      case '!yatak':
        await isYap(cevap, () => yatakSpawnAl(cevap), null, 'Olmadı: ')
        return

      case '!konum': {
        const p = bot.entity.position
        cevap(`Buradayım: ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}`)
        return
      }

      case '!durum':
        cevap(`Can: ${Math.round(bot.health)}/20, Açlık: ${bot.food}/20`)
        return

      case '!gelis':
        if (!gelisim) {
          cevap('Daha dünyaya doğmadım, biraz bekle.')
          return
        }
        await isYap(
          cevap,
          () => gelisim.gelis(cevap),
          'Bitti! Demir setimi giydim.',
          'Takıldım: ',
          '!gelis'
        )
        return

      case '!gelis2':
        if (!gelisim2) {
          cevap('Daha dünyaya doğmadım, biraz bekle.')
          return
        }
        await isYap(
          cevap,
          () => gelisim2.gelis2(cevap),
          'Bitti! Elmas setim hazır.',
          'Takıldım: ',
          '!gelis2'
        )
        return

      case '!ver':
      case '!sandik':
      case '!topla':
      case '!yap':
      case '!uyu': {
        if (!komutlar) {
          cevap('Daha dünyaya doğmadım, biraz bekle.')
          return
        }
        const kelimeler = parcalar.slice(1)
        const hamKelimeler = mesaj.trim().split(/\s+/).slice(1)
        if (komut === '!uyu' && kelimeler[0] === 'oto') {
          otoUyku = !otoUyku
          cevap(otoUyku
            ? 'Otomatik uyku açık: gece olunca boştaysam yatağa giderim. Kapatmak için yine !uyu oto yaz.'
            : 'Otomatik uyku kapalı.')
          return
        }
        if (komut === '!ver' && !kelimeler.length) {
          cevap('Kullanım: !ver demir 10  veya  !ver OyuncuAdi elmas hepsi')
          return
        }
        if ((komut === '!topla' || komut === '!yap') && !kelimeler.length) {
          cevap(komut === '!topla' ? 'Kullanım: !topla odun 32  (odun, tas, komur, demir, bakir, altin, toprak, kum, cakil)'
            : 'Kullanım: !yap mesale 8  veya  !yap tas kazma')
          return
        }
        bot.setControlState('sneak', false)
        const isler = {
          '!ver': () => komutlar.ver(kim, kelimeler, hamKelimeler, cevap),
          '!sandik': () => komutlar.sandik(kelimeler, cevap),
          '!topla': () => komutlar.topla(kelimeler, cevap),
          '!yap': () => komutlar.yap(kelimeler, cevap),
          '!uyu': () => komutlar.uyu(cevap),
        }
        const hatalar = { '!ver': 'Veremedim: ', '!sandik': 'Olmadı: ', '!topla': 'Takıldım: ', '!yap': 'Yapamadım: ', '!uyu': 'Uyuyamadım: ' }
        await isYap(cevap, isler[komut], null, hatalar[komut], komut === '!topla' ? mesaj.trim() : '')
        return
      }

      case '!yardimet':
        if (gelisim) gelisim.yardimEt(kim, cevap)
        return

      case '!envanter':
        if (gelisim) cevap(gelisim.envanterOzeti().slice(0, 250))
        return

      case '!gom':
        bot.pathfinder.setGoal(null) // takip ediyorsa bıraksın
        await isYap(cevap, () => gomVeKapat(bot), 'Tamam, içerdeyim.', 'Olmadı: ')
        return

      case '!git': {
        const sayilar = parcalar.slice(1).map(Number)
        if ((sayilar.length !== 2 && sayilar.length !== 3) || sayilar.some(isNaN)) {
          cevap('Kullanım: !git x y z  veya  !git x z')
          return
        }
        const hedef =
          sayilar.length === 3
            ? new goals.GoalBlock(sayilar[0], sayilar[1], sayilar[2])
            : new goals.GoalXZ(sayilar[0], sayilar[1])
        await isYap(
          cevap,
          async () => {
            bot.setControlState('sneak', false) // eğilikken yavaş yürümesin
            cevap('Gidiyorum.')
            await bot.pathfinder.goto(hedef)
          },
          'Vardım.',
          'Ulaşamadım: '
        )
        return
      }

      case '!gel': {
        const oyuncu = oyuncuyuBul(kim)
        if (!oyuncu) {
          cevap('Seni göremiyorum, çok uzaktasın. Koordinat ver: !git x y z')
          return
        }
        const p = oyuncu.position
        await isYap(
          cevap,
          async () => {
            bot.setControlState('sneak', false)
            cevap('Geliyorum.')
            await bot.pathfinder.goto(new goals.GoalNear(p.x, p.y, p.z, 2))
          },
          'Geldim.',
          'Gelemedim: '
        )
        return
      }

      case '!takip': {
        if (mesgul) {
          cevap('Meşgulüm, önce !dur yaz.')
          return
        }
        const ad = isimYazilan ? oyuncuAdi(isimYazilan) : kim
        if (!ad) {
          cevap(`${isimYazilan} adında bir oyuncu bulamadım.`)
          return
        }
        const oyuncu = oyuncuyuBul(ad)
        if (!oyuncu) {
          cevap(`${ad} çok uzakta, göremiyorum.`)
          return
        }
        saldiriHedef = null
        bot.setControlState('sneak', false)
        bot.pathfinder.setGoal(new goals.GoalFollow(oyuncu, 2), true)
        cevap(`${ad === kim ? 'Seni' : ad + ' adlı oyuncuyu'} takip ediyorum. Bırakmam için !dur yaz.`)
        return
      }

      case '!vur':
      case '!yumruk': {
        if (mesgul) {
          cevap('Meşgulüm, önce !dur yaz.')
          return
        }
        let hedef = null
        let hedefAdi = ''
        if (isimYazilan) {
          const ad = oyuncuAdi(isimYazilan)
          if (!ad) {
            cevap(`${isimYazilan} adında bir oyuncu bulamadım.`)
            return
          }
          hedef = oyuncuyuBul(ad)
          hedefAdi = ad
          if (!hedef) {
            cevap(`${ad} çok uzakta, göremiyorum.`)
            return
          }
        } else {
          // isim yoksa en yakın yaratık (oyuncu değil)
          hedef = bot.nearestEntity((e) =>
            ['hostile', 'mob', 'animal', 'passive'].includes(e.type) &&
            e.position.distanceTo(bot.entity.position) < 16)
          hedefAdi = hedef ? hedef.name : ''
          if (!hedef) {
            cevap('Yakında vuracak bir şey yok. Kullanım: !vur oyuncuadı')
            return
          }
        }
        if (komut === '!yumruk') {
          // envanterde kılıç varsa en iyisini eline al, yoksa yumrukla vur
          const SIRA = ['netherite', 'diamond', 'iron', 'stone', 'golden', 'wooden']
          const kilic = bot.inventory.items()
            .filter((it) => it.name.endsWith('_sword'))
            .sort((a, b) => SIRA.indexOf(a.name.split('_')[0]) - SIRA.indexOf(b.name.split('_')[0]))[0]
          try {
            if (kilic) await bot.equip(kilic, 'hand')
            else await bot.unequip('hand')
          } catch (e) { /* olmazsa elindekiyle vurur */ }
        }
        bot.setControlState('sneak', false)
        saldiriHedef = hedef
        saldiriCevap = cevap
        bot.pathfinder.setGoal(new goals.GoalFollow(hedef, 1), true)
        cevap(`${hedefAdi} hedefim! Bırakmam için !dur yaz.`)
        return
      }

      default:
        // Bilinmeyen komutlara cevap vermiyoruz ki sohbeti doldurmasın
        return
    }
  }

  bot.on('chat', (kim, mesaj) => komutCalistir(kim, mesaj, false))
  bot.on('whisper', (kim, mesaj) => komutCalistir(kim, mesaj, true))
}

async function gomVeKapat(bot) {
  // 3 blok kazıp 1'ini geri koyuyoruz, böylece bot 2 blok derinliğinde kapalı çukurda kalıyor.
  let kazilan = 0
  for (let i = 0; i < 3; i++) {
    const alt = bot.blockAt(bot.entity.position.offset(0, -1, 0))
    if (!alt || alt.name === 'air') break
    if (!bot.canDigBlock(alt)) throw new Error(alt.name + ' kazılamıyor')
    await bot.dig(alt)
    await bot.waitForTicks(15) // düşmesini ve bloğu toplamasını bekle
    kazilan++
  }
  if (kazilan < 3) throw new Error('3 blok kazamadım, altım boş ya da kazılamıyor')

  // Elde koyulacak blok bul
  const blok = bot.inventory.items().find((it) => bot.registry.blocksByName[it.name])
  if (!blok) throw new Error('envanterde blok yok')
  await bot.equip(blok, 'hand')

  // Başımızın 2 üstündeki hücreyi kapat (yan duvarlara yaslanarak)
  const p = bot.entity.position.floored()
  const hedef = p.offset(0, 2, 0)
  const yonler = [new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1)]
  for (const y of yonler) {
    const ref = bot.blockAt(hedef.plus(y))
    if (ref && ref.boundingBox === 'block') {
      await bot.lookAt(hedef.offset(0.5, 0.5, 0.5))
      await bot.placeBlock(ref, y.scaled(-1))
      return
    }
  }
  throw new Error('yaslanacak duvar bulunamadı')
}

const panel = panelBaslat(kontrol)
baslat()

// Uygulama (main.js) botu kapatmak ve paneli açmak için bunları kullanır
module.exports = { kontrol, panelHazir: panel.hazir }
