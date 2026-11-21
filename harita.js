// harita.js — botun çevresini kuş bakışı renkli karelere çevirir (panelde "Harita" kartı).
// Her sütunda yukarıdan aşağı ilk dolu bloğun rengi alınır.
// Bot gökyüzünü görüyorsa (yer üstü) 20 blok yukarıdan başlar: tepeler, ağaçlar, çatılar görünür.
// Mağaradaysa botun başı hizasından başlar: tavanı değil, botun bulunduğu katı gösterir.
// Kuzey (-Z) yukarıda, doğu (+X) sağda.

const { Vec3 } = require('vec3')

const YARICAP = 32 // 65 x 65 blok
const ASAGI = 24 // botun altına en fazla bu kadar bakılır
const YUKARI = 20 // yer üstündeyken bu kadar yukarıdan başlanır

// Blok adı -> renk (ilk eşleşen kazanır)
const RENKLER = [
  [/^(water|bubble_column|kelp|kelp_plant|seagrass|tall_seagrass)$/, '#3f76e4'],
  [/^lava$/, '#e8641b'],
  [/ice$/, '#9cc3f5'],
  [/^(snow|snow_block|powder_snow)$/, '#f4f8fb'],
  [/^(grass_block|short_grass|tall_grass|fern|large_fern)$/, '#6da34d'],
  [/leaves$/, '#3d7a2c'],
  [/^(moss_block|moss_carpet)$/, '#5b8a2d'],
  [/(dandelion|poppy|orchid|allium|tulip|daisy|cornflower|lily|rose|peony|lilac|sunflower)/, '#7fb35a'],
  [/coal_ore$/, '#34363a'],
  [/iron_ore$/, '#d8af93'],
  [/copper_ore$/, '#c8744d'],
  [/gold_ore$/, '#f2cf3d'],
  [/redstone_ore$/, '#c42121'],
  [/lapis_ore$/, '#2e56b8'],
  [/diamond_ore$/, '#5de3ec'],
  [/emerald_ore$/, '#1fd46b'],
  [/^(red_sand|red_sandstone)/, '#c0682e'],
  [/sand(stone)?$/, '#dccf90'],
  [/^gravel$/, '#8b8582'],
  [/^farmland$/, '#6e4c2c'],
  [/^(dirt|coarse_dirt|rooted_dirt|podzol|mud|dirt_path|mycelium)$/, '#86603f'],
  [/^clay$/, '#a1a7b3'],
  [/_log$|_wood$|_stem$/, '#6b4f2f'],
  [/_planks$|_slab$|_stairs$|_fence|crafting_table|chest|barrel|bookshelf/, '#a8844f'],
  [/door|trapdoor/, '#8d6a3f'],
  [/_bed$/, '#c23b3b'],
  [/torch|lantern|glowstone|shroomlight/, '#ffd24a'],
  [/glass/, '#cfe7ef'],
  [/^deepslate|^cobbled_deepslate|^tuff/, '#4f5055'],
  [/^granite|^polished_granite/, '#9b6c56'],
  [/^diorite|^polished_diorite|^calcite/, '#cfcfcf'],
  [/^bedrock$/, '#2e2e2e'],
  [/^obsidian$/, '#1c152b'],
  [/netherrack|nether_brick/, '#6e2b2b'],
  [/terracotta$|_concrete$|_wool$/, '#b49a82'],
  [/stone|andesite|cobble|furnace|brick/, '#7f7f7f'],
]
const BOS = new Set(['air', 'cave_air', 'void_air', 'light', 'barrier', 'structure_void'])
const onbellek = new Map()

function renkBul(ad) {
  if (onbellek.has(ad)) return onbellek.get(ad)
  const bulunan = RENKLER.find(([kalip]) => kalip.test(ad))
  const renk = bulunan ? bulunan[1] : '#9a9a9a'
  onbellek.set(ad, renk)
  return renk
}

// Yüksekte olan biraz açık, alçakta olan biraz koyu görünsün
function golgele(hex, fark) {
  const k = 1 + Math.max(-12, Math.min(6, fark)) * 0.035
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.max(0, Math.min(255, Math.round(x * k))))
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('')
}

let sonHarita = null
let sonZaman = 0

function haritaAl(bot) {
  if (!bot || !bot.entity) return null
  if (sonHarita && Date.now() - sonZaman < 1500) return sonHarita // en fazla 1,5 sn'de bir hesapla

  const reg = bot.registry
  const p = bot.entity.position.floored()
  const n = YARICAP * 2 + 1
  const renkler = new Array(n * n).fill(null)
  const v = new Vec3(0, 0, 0)
  // Bot yer üstünde mi? (başının üstünde 20 blok boyunca yaprak dışında dolu blok yoksa)
  let yuzeyde = true
  for (let y = p.y + 2; y <= p.y + YUKARI + 4; y++) {
    v.x = p.x; v.y = y; v.z = p.z
    const id = bot.world.getBlockStateId(v)
    const b = id === undefined || id === null ? null : reg.blocksByStateId[id]
    if (b && !BOS.has(b.name) && !b.name.endsWith('leaves')) { yuzeyde = false; break }
  }
  const ust = yuzeyde ? p.y + YUKARI : p.y + 1

  for (let dz = -YARICAP; dz <= YARICAP; dz++) {
    for (let dx = -YARICAP; dx <= YARICAP; dx++) {
      v.x = p.x + dx
      v.z = p.z + dz
      for (let y = ust; y >= p.y - ASAGI; y--) {
        v.y = y
        const id = bot.world.getBlockStateId(v)
        if (id === undefined || id === null) break // yüklenmemiş bölge
        const blok = reg.blocksByStateId[id]
        if (!blok || BOS.has(blok.name)) continue
        renkler[(dz + YARICAP) * n + (dx + YARICAP)] = golgele(renkBul(blok.name), y - p.y)
        break
      }
    }
  }

  const yakinMi = (e) => e && Math.abs(e.position.x - bot.entity.position.x) <= YARICAP &&
    Math.abs(e.position.z - bot.entity.position.z) <= YARICAP
  const goreli = (e) => ({ dx: e.position.x - bot.entity.position.x, dz: e.position.z - bot.entity.position.z })

  const oyuncular = Object.values(bot.players)
    .filter((o) => o.username !== bot.username && yakinMi(o.entity))
    .map((o) => ({ ad: o.username, ...goreli(o.entity) }))
  const dusmanlar = Object.values(bot.entities)
    .filter((e) => e !== bot.entity && (e.type === 'hostile' || e.kind === 'Hostile mobs') && yakinMi(e))
    .slice(0, 40)
    .map((e) => goreli(e))

  sonHarita = {
    r: YARICAP,
    n,
    renkler,
    merkez: [p.x, p.y, p.z],
    yuzeyde,
    yon: bot.entity.yaw, // 0 = kuzey; yön vektörü (-sin, -cos)
    oyuncular,
    dusmanlar,
  }
  sonZaman = Date.now()
  return sonHarita
}

module.exports = { haritaAl, renkBul }
