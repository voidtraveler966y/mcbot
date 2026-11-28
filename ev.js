// ev.js — !ev komutu: bot kendine içi 3x3, dışı 5x5 küçük bir ev yapar.
//   Duvarlar taştan (3 blok yüksek), çatı tahtadan (düz). Güney duvarında kapı,
//   içeride çalışma masası, duvarda meşale; üstünde yatak varsa yatak.
// Taşı ve odunu kendisi toplar: ~46 taş, ~37 tahta (yaklaşık 10 kütük). Kapı, çalışma masası ve
// meşaleyi kendisi yapmaz: !yardimet ile oyunculardan yardım ister (köylü evindeki gibi).
// Yakında düz, boş bir 5x5 alan arar; bulamazsa söyler.
//
// Yerleşim (yukarıdan bakış, kuzey yukarıda; m = evin ortası):
//   D D D D D        D = duvar        M = çalışma masası
//   D M . . D        Y = yatak (ayak ucu güneyde, başı kuzeyde)
//   D . . Y D        K = kapı (güney duvarının ortası)
//   D . . Y D        Meşale: kuzey duvarında, ortada
//   D D K D D

const { Vec3 } = require('vec3')
const { goals, Movements } = require('mineflayer-pathfinder')
const { Iptal } = require('./gelisim')
const evler = require('./evler')

const DUVAR_TASI = ['cobblestone', 'cobbled_deepslate', 'stone', 'stone_bricks', 'deepslate_bricks', 'mossy_cobblestone']
// Yarım ev ararken sadece bunlara bakılır (doğal "stone" mağarada yanlışlıkla ev sanılmasın)
const EV_TASI = ['cobblestone', 'cobbled_deepslate', 'stone_bricks', 'deepslate_bricks', 'mossy_cobblestone']
const DUVAR_GEREK = 46 // 16 x 3 - kapı boşluğu (2)
const CATI_GEREK = 25 // 5 x 5
const SIVI = ['water', 'lava', 'fire', 'soul_fire', 'nether_portal', 'end_portal', 'bubble_column']
// Bu bloklara karşı blok koymaya çalışırsak bot onları açar (masa, sandık, kapı...): referans olarak kullanma
const ETKILESIMLI = /crafting_table|chest|barrel|furnace|smoker|door|_bed$|trapdoor|gate|button|lever|anvil|table|shulker|hopper|dispenser|dropper|bell|loom|stonecutter|grindstone|lectern|composter|cauldron|note_block|jukebox|beacon|brewing|enchanting|sign|torch/

// 6 yön; önce "altındaki bloğun üstüne" koymayı dener
const YONLER = [
  new Vec3(0, 1, 0), new Vec3(1, 0, 0), new Vec3(-1, 0, 0),
  new Vec3(0, 0, 1), new Vec3(0, 0, -1), new Vec3(0, -1, 0),
]

const katiMi = (b) => Boolean(b) && b.boundingBox === 'block' && !b.name.includes('leaves') && !SIVI.includes(b.name)
// Hava ya da ot/çiçek/kar gibi içinden geçilen şeyler (koyarken kırılır)
const bosMu = (b) => Boolean(b) && b.boundingBox === 'empty' && !SIVI.includes(b.name)
const havaMi = (b) => Boolean(b) && ['air', 'cave_air', 'void_air'].includes(b.name)

// anaHareket: bot.js'in normal yol bulma ayarları (inşaat bitince geri yüklenir)
function evKur(bot, a, komutlar, anaHareket) {
  const reg = () => bot.registry
  const tahtaAdlari = () => reg().itemsArray.map((i) => i.name).filter((n) => n.endsWith('_planks'))
  const kapiVar = () => bot.inventory.items().some((i) => i.name.endsWith('_door') && i.name !== 'iron_door')
  const yatakVar = () => bot.inventory.items().some((i) => i.name.endsWith('_bed'))

  // Listede ilk sıradaki malzemeyi tercih et
  function esyaSec(adlar) {
    const esyalar = bot.inventory.items()
    for (const ad of adlar) {
      const it = esyalar.find((i) => i.name === ad)
      if (it) return it
    }
    return null
  }

  // ------------------------------------------------------------------ tahta (iki ev de kullanır)
  // Stripped olmayan kütükler (tahtaya çevrilecek, yatay kuşakta kullanılacak olanlar)
  const duzKutukMu = (n) => n.endsWith('_log') && !n.startsWith('stripped_')
  const duzKutukSay = () => bot.inventory.items().filter((i) => duzKutukMu(i.name)).reduce((t, i) => t + i.count, 0)

  // Ağaç türüne göre tahta sayısı, en çok olandan başlayarak
  function tahtaTurleri() {
    const sayi = {}
    for (const it of bot.inventory.items()) if (it.name.endsWith('_planks')) sayi[it.name] = (sayi[it.name] || 0) + it.count
    return Object.entries(sayi).sort((x, y) => y[1] - x[1])
  }
  function kutukTurleri() {
    const sayi = {}
    for (const it of bot.inventory.items()) if (duzKutukMu(it.name)) sayi[it.name] = (sayi[it.name] || 0) + it.count
    return Object.entries(sayi).sort((x, y) => y[1] - x[1])
  }

  // Elde en az `gerek` tahta olsun. Kütüklerin `ayrilacakKutuk` kadarı kütük olarak kalır
  // (köylü evinin kuşağı, odun kömürü için yardımcıya verilecek kütük). Fazlası tahtaya çevrilir;
  // o da yetmezse odun toplanır. Hata olursa (odun bulamazsa) atmaz, elde ne varsa onunla devam edilir.
  async function tahtaHazirla(gerek, ayrilacakKutuk, cevap, etiket) {
    const cevir = async () => {
      while (a.tahtaSay() < gerek && duzKutukSay() > ayrilacakKutuk) {
        const kutuk = bot.inventory.items().find((i) => duzKutukMu(i.name))
        const tahta = kutuk.name.replace('_log', '_planks')
        if (!reg().itemsByName[tahta]) break
        const once = a.tahtaSay()
        await a.uret(tahta, 4)
        if (a.tahtaSay() <= once) break
      }
    }
    await cevir()
    if (a.tahtaSay() >= gerek) return
    const eksik = Math.ceil((gerek - a.tahtaSay()) / 4) + Math.max(0, ayrilacakKutuk - duzKutukSay())
    cevap(`${etiket} için ${eksik} kütük daha lazım, topluyorum.`)
    try {
      await komutlar.topla(['odun', String(eksik + 1)], cevap)
    } catch (e) {
      if (e instanceof Iptal) throw e
      console.log(`[${etiket}] odun toplanamadı:`, e.message)
    }
    a.baslat(cevap)
    await cevir()
  }

  // Yardımcıya `n` tahta ver (en çok olan ağaç türünden başlayarak; çit, kapı, merdiven aynı tür ister).
  // `ayrilacakTahta` kadar tahta (duvar/çatı için) ve `ayrilacakKutuk` kadar kütük bende kalır.
  // Tahta yetmezse eksiği kütük olarak verir (1 kütük = 4 tahta). Dönüş: [[eşya, adet], ...]
  function tahtaListesi(n, ayrilacakTahta, ayrilacakKutuk) {
    const ver = []
    let kalan = Math.min(n, Math.max(0, a.tahtaSay() - ayrilacakTahta))
    let eksik = n - kalan
    for (const [isim, adet] of tahtaTurleri()) {
      if (kalan <= 0) break
      const k = Math.min(adet, kalan)
      ver.push([isim, k])
      kalan -= k
    }
    let kutukHakki = Math.max(0, duzKutukSay() - ayrilacakKutuk)
    for (const [isim, adet] of kutukTurleri()) {
      if (eksik <= 0 || kutukHakki <= 0) break
      const k = Math.min(adet, kutukHakki, Math.ceil(eksik / 4))
      ver.push([isim, k])
      eksik -= k * 4
      kutukHakki -= k
    }
    return ver
  }
  const listeYazi = (ver) => ver.map(([i, n]) => `${n} ${i}`).join(', ') || 'yok'

  // ------------------------------------------------------------------ malzeme
  // ihtiyac: { duvar: kaç taş, cati: kaç tahta, kapi, masa, mesale: takılacak mı }
  // Bot taşı ve kütüğü kendisi toplar, çatı için kütüğü tahtaya çevirir. Kapı, çalışma masası ve
  // meşaleyi kendisi YAPMAZ: "Biri bana yardım edebilir mi?" diye sorar, !yardimet yazan
  // oyuncuya malzemeyi atar, yapılanları geri toplar (köylü evindeki gibi).
  async function malzemeHazirla(cevap, ihtiyac) {
    const DUVAR = ihtiyac.duvar
    const CATI = ihtiyac.cati
    const kapiLazim = ihtiyac.kapi && !kapiVar()
    const masaLazim = ihtiyac.masa && !a.varMi('crafting_table')
    const mesaleLazim = ihtiyac.mesale && !a.varMi('torch')
    const komurVar = () => a.varMi('coal') || a.varMi('charcoal')
    const komurKutugu = mesaleLazim && !komurVar() ? 1 : 0 // kömür yoksa yardımcı odun kömürü yapsın

    // 1) taş
    const tas = a.say(DUVAR_TASI)
    if (tas < DUVAR) {
      cevap(`Duvarlar için ${DUVAR - tas} taş eksik, topluyorum.`)
      await komutlar.topla(['tas', String(DUVAR - tas + 2)], cevap)
      a.baslat(cevap)
    }

    // 2) tahta: çatı + yardımcıya verilecek (kapı 6, masa 4, meşale çubuğu için 2)
    const yardimTahta = (kapiLazim ? 6 : 0) + (masaLazim ? 4 : 0) + (mesaleLazim ? 2 : 0)
    await tahtaHazirla(CATI + yardimTahta, komurKutugu, cevap, 'Çatı ve kapı')

    // 3) eşyaları yardımcı yapsın
    const istenen = []
    if (kapiLazim) istenen.push({ ad: 'tahta kapı', adet: 1, eslesir: (n) => n.endsWith('_door') && n !== 'iron_door' })
    if (masaLazim) istenen.push({ ad: 'çalışma masası', adet: 1, eslesir: (n) => n === 'crafting_table' })
    if (mesaleLazim) istenen.push({ ad: 'meşale', adet: 1, eslesir: (n) => n === 'torch' })
    if (istenen.length) {
      console.log(`[Taş ev] yardım öncesi: tahta ${a.tahtaSay()}, kütük ${duzKutukSay()}, çatı tahtası ${CATI}, yardım tahtası ${yardimTahta}`)
      const ver = tahtaListesi(yardimTahta, CATI, komurKutugu)
      if (mesaleLazim) {
        const komur = ['coal', 'charcoal'].find((k) => a.varMi(k))
        const kutuk = kutukTurleri()[0]
        if (komur) ver.push([komur, 1])
        else if (kutuk) ver.push([kutuk[0], 1]) // odun kömürü için
      }
      console.log(`[Taş ev] yardımcıya verilecek: ${listeYazi(ver)}`)
      await a.yardimIste(istenen, ver, cevap, 'Biri bana yardım edebilir mi? Taş ev için şunlar lazım:')
      a.baslat(cevap)
    }

    // 4) son kontrol: çatı tahtası (yardımcıya fazla verdiysek tamamla)
    if (a.tahtaSay() < CATI) await tahtaHazirla(CATI, 0, cevap, 'Çatı')
    if (a.say(DUVAR_TASI) < DUVAR) throw new Error('duvar için yeterli taş toplayamadım')
    if (a.tahtaSay() < CATI) throw new Error('çatı için yeterli tahta yok')
  }

  // ------------------------------------------------------------------ yer seçimi
  // m: evin ortası, zemin hizasında (ayağının bastığı blok m.y - 1)
  function yerUygunMu(m) {
    if (evler.yakindaEvVar(m)) return false // başka evimizin dibine (kapısının önüne) kurma
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (!katiMi(bot.blockAt(m.offset(dx, -1, dz)))) return false
        for (let y = 0; y <= 3; y++) if (!bosMu(bot.blockAt(m.offset(dx, y, dz)))) return false
      }
    }
    // kapının önü: üstünde durulabilmeli
    if (!katiMi(bot.blockAt(m.offset(0, -1, 3)))) return false
    return bosMu(bot.blockAt(m.offset(0, 0, 3))) && bosMu(bot.blockAt(m.offset(0, 1, 3)))
  }

  function yerBul() {
    const p = bot.entity.position.floored()
    for (let r = 0; r <= 12; r++) {
      const halka = []
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) === r) halka.push([dx, dz])
        }
      }
      halka.sort((x, y) => (x[0] ** 2 + x[1] ** 2) - (y[0] ** 2 + y[1] ** 2))
      for (const [dx, dz] of halka) {
        for (const dy of [0, -1, 1, -2, 2, -3, 3]) {
          const m = p.offset(dx, dy, dz)
          if (yerUygunMu(m)) return m
        }
      }
    }
    return null
  }

  // Daha önce başlanmış (yarım kalmış ya da hasar görmüş) bir evimiz var mı?
  // Önce kayıtlı evlere bakar; sonra taban sırası taş halka olan yerlere (birkaç blok eksik olabilir).
  function yarimEvBul() {
    const p = bot.entity.position.floored()
    const kayitli = evler.hepsi()
      .filter((e) => e.tur !== 'koylu') // köylü evleri !koylu ile tamamlanır
      .map((e) => new Vec3(e.x, e.y, e.z))
      .filter((m) => m.distanceTo(p) <= 32)
      .sort((x, y) => x.distanceTo(p) - y.distanceTo(p))
    if (kayitli.length) return kayitli[0]

    const esyaMi = (b) => b && (bosMu(b) || /crafting_table|_bed$/.test(b.name))
    for (let r = 0; r <= 16; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          for (let dy = -4; dy <= 4; dy++) {
            const m = p.offset(dx, dy, dz)
            if (!bosMu(bot.blockAt(m)) || !bosMu(bot.blockAt(m.offset(0, 1, 0)))) continue // ortası boş olmalı
            let tas = 0
            for (let i = -2; i <= 2; i++) {
              for (let k = -2; k <= 2; k++) {
                if (Math.max(Math.abs(i), Math.abs(k)) !== 2 || (i === 0 && k === 2)) continue
                const b = bot.blockAt(m.offset(i, 0, k))
                if (b && EV_TASI.includes(b.name)) tas++
              }
            }
            if (tas < 11) continue // 15 taban bloğundan en az 11'i yerinde olmalı
            const kapiYeri = bot.blockAt(m.offset(0, 0, 2))
            if (!kapiYeri || !(bosMu(kapiYeri) || kapiYeri.name.endsWith('_door'))) continue
            let ic = 0
            for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) if (esyaMi(bot.blockAt(m.offset(i, 0, k)))) ic++
            if (ic < 8) continue
            return m
          }
        }
      }
    }
    return null
  }

  function planYap(m) {
    const duvarlar = []
    const cati = []
    for (let y = 0; y < 3; y++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue
          if (dx === 0 && dz === 2 && y < 2) continue // kapı boşluğu
          duvarlar.push(m.offset(dx, y, dz))
        }
      }
    }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) cati.push(m.offset(dx, 3, dz))
    cati.sort((p, q) => Math.max(Math.abs(q.x - m.x), Math.abs(q.z - m.z)) - Math.max(Math.abs(p.x - m.x), Math.abs(p.z - m.z)))
    return { duvarlar, cati }
  }

  // ------------------------------------------------------------------ blok koyma
  // yonler: hangi yönden dayanak aranacağı (kütüğü yatay koymak için tek yön verilir)
  function komsuBul(hedef, yonler = YONLER) {
    for (const yon of yonler) {
      const ref = bot.blockAt(hedef.minus(yon))
      if (katiMi(ref) && !ETKILESIMLI.test(ref.name)) return { ref, yon }
    }
    return null
  }

  function hedefteMiyim(hedef) {
    const b = bot.entity.position
    const x = Math.floor(b.x)
    const z = Math.floor(b.z)
    const y = Math.floor(b.y)
    return x === hedef.x && z === hedef.z && (y === hedef.y || y + 1 === hedef.y)
  }

  const ERISIM = 4.3 // blok koyarken gözden hedefe en fazla bu kadar (sunucular ~4.5'e izin verir)
  const goz = () => bot.entity.position.offset(0, 1.62, 0)
  const merkezi = (v) => v.offset(0.5, 0.5, 0.5)
  const menzilde = (hedef) => goz().distanceTo(merkezi(hedef)) <= ERISIM && !hedefteMiyim(hedef)

  // Sırayla duruş yerlerine gider; vardığı yerden hedefe gerçekten yetişiyorsa durur
  async function durusaGit(durus, hedef, yetismeli) {
    for (const d of durus) {
      try {
        await a.git(new goals.GoalBlock(d.x, d.y, d.z), 30000)
      } catch (e) {
        if (e instanceof Iptal) throw e
        try {
          await a.git(new goals.GoalNear(d.x, d.y, d.z, 1), 20000)
        } catch (e2) {
          if (e2 instanceof Iptal) throw e2
          continue
        }
      }
      if (!hedefteMiyim(hedef) && (!yetismeli || menzilde(hedef))) return
    }
    throw new Error(`${hedef.x} ${hedef.y} ${hedef.z} noktasına yetişebileceğim bir yere gidemedim`)
  }

  // durus: durulabilecek yerler (verilen sırayla denenir; sirala=true ise yakından uzağa)
  // zorla: menzilde olsa bile ilk duruş yerine git (yatak/kapı yönü için)
  // yonler: sadece bu yönlerdeki bloklara dayan (varsayılan: önce alttaki, sonra yanlar)
  async function koy(hedef, adlar, durus, { zorla = false, sirala = true, yonler = YONLER } = {}) {
    a.kontrol()
    const mevcut = bot.blockAt(hedef)
    if (!mevcut) throw new Error('o bölge yüklenmemiş')
    if (!havaMi(mevcut)) {
      const ayniMi = adlar.some((ad) => mevcut.name === ad || mevcut.name === ad.replace('torch', 'wall_torch'))
      if (katiMi(mevcut) || ayniMi) return true // zaten dolu
      if (!bosMu(mevcut)) throw new Error(`${hedef} dolu (${mevcut.name})`)
    }
    const komsu = komsuBul(hedef, yonler)
    if (!komsu) return false // henüz dayanacak blok yok, sonra tekrar denenir
    const esya = esyaSec(adlar)
    if (!esya) throw new Error('malzemem bitti')

    // oradan bakınca yetişilemeyecek duruş yerlerini hiç deneme
    const tahmini = (d) => d.offset(0.5, 1.62, 0.5).distanceTo(merkezi(hedef))
    let liste = zorla ? durus : durus.filter((d) => tahmini(d) <= ERISIM + 0.3)
    if (!zorla && sirala) liste = liste.slice().sort((p, q) => tahmini(p) - tahmini(q))
    if (zorla || !menzilde(hedef)) await durusaGit(liste, hedef, !zorla)
    // ot/çiçek/kar varsa önce kır
    const simdiki = bot.blockAt(hedef)
    if (simdiki && !havaMi(simdiki) && bosMu(simdiki)) await bot.dig(simdiki)

    // Önce bulunduğu yerden 2 kez dene; olmazsa sıradaki duruş yerlerine geçip oradan dene
    const yedekler = zorla ? [] : liste.slice()
    let sonHata = null
    for (let tur = 0; tur <= yedekler.length; tur++) {
      if (tur > 0) {
        try {
          await durusaGit([yedekler[tur - 1]], hedef, true)
        } catch (e) {
          if (e instanceof Iptal) throw e
          continue
        }
      }
      for (let deneme = 1; deneme <= 2; deneme++) {
        a.kontrol()
        try {
          await bot.equip(esya, 'hand')
          await bot.placeBlock(komsu.ref, komsu.yon)
          return true
        } catch (e) {
          if (e instanceof Iptal) throw e
          await a.bekle(10)
          const sonuc = bot.blockAt(hedef)
          if (sonuc && !havaMi(sonuc)) return true // sunucu geç onayladı ama konmuş
          const uzaklik = goz().distanceTo(merkezi(hedef)).toFixed(1)
          console.log(`[Ev] olmadı: ${hedef.x} ${hedef.y} ${hedef.z} (uzaklık ${uzaklik}, dayanak ${komsu.ref.name}): ${e.message}`)
          sonHata = `${hedef.x} ${hedef.y} ${hedef.z}, uzaklık ${uzaklik}: ${e.message}`
        }
      }
      if (zorla) break
    }
    throw new Error(`blok koyamadım (${sonHata})`)
  }

  // Liste bitene kadar, dayanacak yeri olanları koy (çatı gibi kenardan içe doğru ilerler)
  async function hepsiniKoy(liste, adlar, durus, secenek) {
    let kalan = liste.slice()
    while (kalan.length) {
      const yeni = []
      for (const hedef of kalan) {
        if (!(await koy(hedef, adlar, durus, secenek))) yeni.push(hedef)
      }
      if (yeni.length === kalan.length) throw new Error('bazı blokları koyacak dayanak bulamadım')
      kalan = yeni
    }
  }

  // ------------------------------------------------------------------ !ev
  async function ev(cevap) {
    a.baslat(cevap)
    let m = yarimEvBul()
    if (m) {
      const p = planYap(m)
      const eksikDuvar = p.duvarlar.filter((v) => !katiMi(bot.blockAt(v))).length
      const eksikCati = p.cati.filter((v) => !katiMi(bot.blockAt(v))).length
      const kapiTakili = bot.blockAt(m.offset(0, 0, 2)).name.endsWith('_door')
      const masaVar = (bot.blockAt(m.offset(-1, 0, -1)) || {}).name === 'crafting_table'
      const mesaleVar = ((bot.blockAt(m.offset(0, 1, -1)) || {}).name || '').endsWith('torch')
      evler.ekle(m)
      if (!eksikDuvar && !eksikCati && kapiTakili) {
        cevap(`Burada zaten evim var: ${m.x} ${m.y} ${m.z}. Yeni ev için beni 20 blok kadar uzağa götür.`)
        return m
      }
      cevap(`Yarım kalan evimi buldum (${m.x} ${m.y} ${m.z}), tamamlıyorum.`)
      await malzemeHazirla(cevap, { duvar: eksikDuvar, cati: eksikCati, kapi: !kapiTakili, masa: !masaVar, mesale: !mesaleVar })
    } else {
      cevap('Kendime bir ev yapacağım. Önce malzemeye bakıyorum.')
      await malzemeHazirla(cevap, { duvar: DUVAR_GEREK, cati: CATI_GEREK, kapi: true, masa: true, mesale: true })
      m = yerBul()
      if (!m) throw new Error('yakında düz ve boş 5x5 bir yer bulamadım. Beni düz bir yere götürüp tekrar dene')
      cevap(`Yer buldum: ${m.x} ${m.y} ${m.z}. İnşaata başlıyorum.`)
      evler.ekle(m) // bundan sonra bu alan korunur
    }

    const { duvarlar, cati } = planYap(m)

    const disari = [[0, 3], [0, -3], [3, 0], [-3, 0], [3, 3], [3, -3], [-3, 3], [-3, -3]].map(([dx, dz]) => m.offset(dx, 0, dz))
    const iceri = [m.offset(0, 0, 1), m.offset(0, 0, 0), m.offset(-1, 0, 1)]
    // Çatıyı içeriden, evin ortasında durarak yap: oradan çatının her bloğu ~3,4 blok uzakta
    const catiDurus = [m.offset(0, 0, 0), m.offset(0, 0, 1), m.offset(0, 0, -1), m.offset(1, 0, 0), m.offset(-1, 0, 0)].concat(disari)

    const tahtalar = tahtaAdlari()
    const duvarMalzeme = DUVAR_TASI.concat(tahtalar)
    const catiMalzeme = tahtalar.concat(DUVAR_TASI)

    // İnşaat sırasında yol bulucu blok kırmasın, kule yapmasın (duvarlarımızı kırmasın, taşımızı harcamasın)
    const hareket = new Movements(bot)
    hareket.canDig = false
    hareket.allow1by1towers = false
    hareket.scafoldingBlocks = []
    hareket.canOpenDoors = true
    evler.kapilardanGec(hareket)
    bot.pathfinder.setMovements(hareket)
    try {
      await hepsiniKoy(duvarlar, duvarMalzeme, disari)
      cevap('Duvarlar tamam, çatıyı yapıyorum.')
      await hepsiniKoy(cati, catiMalzeme, catiDurus, { sirala: false })

      // içerisi
      if (a.varMi('crafting_table')) await koy(m.offset(-1, 0, -1), ['crafting_table'], iceri)
      if (a.varMi('torch')) await koy(m.offset(0, 1, -1), ['torch'], iceri)
      if (yatakVar()) {
        const yataklar = reg().itemsArray.map((i) => i.name).filter((n) => n.endsWith('_bed'))
        // ayak ucunun güneyinde durup kuzeye bakarak koy: yatak kuzeye doğru uzanır
        await koy(m.offset(1, 0, 0), yataklar, [m.offset(1, 0, 1)], { zorla: true })
      }

      // dışarı çık, kapıyı tak
      const kapilar = reg().itemsArray.map((i) => i.name).filter((n) => n.endsWith('_door') && n !== 'iron_door')
      if (kapiVar()) await koy(m.offset(0, 0, 2), kapilar, [m.offset(0, 0, 3)], { zorla: true })

      // hâlâ içerideysek (kapı önceden takılıysa) kapıdan dışarı çık
      if (evler.icindekiEv(bot.entity.position)) {
        try {
          await a.git(new goals.GoalBlock(m.x, m.y, m.z + 3), 30000)
        } catch (e) {
          if (e instanceof Iptal) throw e
        }
      }
    } finally {
      bot.pathfinder.setMovements(anaHareket)
    }

    cevap(`Evim hazır! Konum: ${m.x} ${m.y} ${m.z}. Gelmek için: !git ${m.x} ${m.y} ${m.z + 3}`)
    return m
  }

  // koylu.js de aynı blok koyma araçlarını kullanır
  return { ev, yerBul, yerUygunMu, koy, katiMi, bosMu, havaMi, DUVAR_TASI, tahtaHazirla, tahtaListesi, listeYazi }
}

module.exports = { evKur }
