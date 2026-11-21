// ev.js — !ev komutu: bot kendine içi 3x3, dışı 5x5 küçük bir ev yapar.
//   Duvarlar taştan (3 blok yüksek), çatı tahtadan (düz). Güney duvarında kapı,
//   içeride çalışma masası, duvarda meşale; üstünde yatak varsa yatak.
// Malzeme yoksa önce kendisi toplar: ~46 taş, ~37 tahta (yaklaşık 10 kütük).
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

  // ------------------------------------------------------------------ malzeme
  // ihtiyac: { duvar: kaç taş, cati: kaç tahta, kapi: kapı takılacak mı }
  async function malzemeHazirla(cevap, ihtiyac) {
    const DUVAR = ihtiyac.duvar
    const CATI = ihtiyac.cati
    const kapiLazim = ihtiyac.kapi && !kapiVar()
    // 1) taş
    const tas = a.say(DUVAR_TASI)
    if (tas < DUVAR) {
      cevap(`Duvarlar için ${DUVAR - tas} taş eksik, topluyorum.`)
      await komutlar.topla(['tas', String(DUVAR - tas + 2)], cevap)
      a.baslat(cevap)
    }

    // 2) tahta: çatı + (kapı yoksa 6) + (masa yoksa 4) + meşale çubuğu için 2
    const tahtaGerek = CATI + (kapiLazim ? 6 : 0) + (a.varMi('crafting_table') ? 0 : 4) + 2
    const eldeki = a.tahtaSay() + a.kutukSay() * 4
    if (eldeki < tahtaGerek) {
      const kutuk = Math.ceil((tahtaGerek - eldeki) / 4) + 1
      cevap(`Çatı ve kapı için ${kutuk} kütük lazım, topluyorum.`)
      await komutlar.topla(['odun', String(kutuk)], cevap)
      a.baslat(cevap)
    }
    await a.tahtaYap(tahtaGerek)

    // 3) kapı: elde en çok hangi tahta varsa o ağacın kapısı (6 aynı tahta = 3 kapı)
    if (kapiLazim) {
      const sayilar = {}
      for (const it of bot.inventory.items()) {
        if (it.name.endsWith('_planks')) sayilar[it.name] = (sayilar[it.name] || 0) + it.count
      }
      const [tur, adet] = Object.entries(sayilar).sort((x, y) => y[1] - x[1])[0] || []
      if (!tur || adet < 6) throw new Error('kapı için aynı ağaçtan 6 tahta lazım')
      const kapi = tur.replace('_planks', '_door')
      if (!reg().itemsByName[kapi]) throw new Error(`${kapi} diye bir kapı yok`)
      const masa = await a.masaHazirla()
      await a.uret(kapi, 1, masa.blok)
      await a.geriTopla(masa)
    }

    // 4) eve koyacağımız çalışma masası (yakındaki masa kullanıldıysa elimizde olmayabilir)
    if (!a.varMi('crafting_table') && a.tahtaSay() >= CATI + 4) {
      await a.uret('crafting_table', 1)
    }

    // 5) meşale (kömür varsa; yoksa meşalesiz olur)
    if (!a.varMi('torch') && (a.varMi('coal') || a.varMi('charcoal'))) {
      try {
        if (!a.varMi('stick') && a.tahtaSay() >= CATI + 2) await a.uret('stick', 4)
        if (a.varMi('stick')) await a.uret('torch', 1)
      } catch (e) {
        if (e instanceof Iptal) throw e
      }
    }

    if (a.say(DUVAR_TASI) < DUVAR) throw new Error('duvar için yeterli taş toplayamadım')
    if (a.tahtaSay() < CATI) throw new Error('çatı için yeterli tahta yok')
  }

  // ------------------------------------------------------------------ yer seçimi
  // m: evin ortası, zemin hizasında (ayağının bastığı blok m.y - 1)
  function yerUygunMu(m) {
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
  function komsuBul(hedef) {
    for (const yon of YONLER) {
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
  async function koy(hedef, adlar, durus, { zorla = false, sirala = true } = {}) {
    a.kontrol()
    const mevcut = bot.blockAt(hedef)
    if (!mevcut) throw new Error('o bölge yüklenmemiş')
    if (!havaMi(mevcut)) {
      const ayniMi = adlar.some((ad) => mevcut.name === ad || mevcut.name === ad.replace('torch', 'wall_torch'))
      if (katiMi(mevcut) || ayniMi) return true // zaten dolu
      if (!bosMu(mevcut)) throw new Error(`${hedef} dolu (${mevcut.name})`)
    }
    const komsu = komsuBul(hedef)
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
      evler.ekle(m)
      if (!eksikDuvar && !eksikCati && kapiTakili) {
        cevap(`Burada zaten evim var: ${m.x} ${m.y} ${m.z}. Yeni ev için beni 20 blok kadar uzağa götür.`)
        return m
      }
      cevap(`Yarım kalan evimi buldum (${m.x} ${m.y} ${m.z}), tamamlıyorum.`)
      await malzemeHazirla(cevap, { duvar: eksikDuvar, cati: eksikCati, kapi: !kapiTakili })
    } else {
      cevap('Kendime bir ev yapacağım. Önce malzemeye bakıyorum.')
      await malzemeHazirla(cevap, { duvar: DUVAR_GEREK, cati: CATI_GEREK, kapi: true })
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

  return { ev, yerBul, yerUygunMu }
}

module.exports = { evKur }
