// guncelleme.js — GitHub'da yeni sürüm var mı diye bakar (açılışta ve 6 saatte bir).
// Depo adresi package.json'daki "repository" alanından okunur; o alan yoksa hiçbir şey yapmaz.
// Yeni sürüm varsa panelin üstünde "Yeni sürüm var" kutusu çıkar. Kutudaki link MCBot'un web sitesinin
// indirme bölümüne gider (package.json'daki "homepage"); o alan yoksa GitHub'daki sürüm sayfasına.

const paket = require('./package.json')

let yeniSurum = null // { surum, adres }

// Güncelleme bulununca açılacak sayfa: web sitesinin "İndir" bölümü
function siteAdresi() {
  const h = String(paket.homepage || '').trim()
  if (!/^https:\/\//i.test(h)) return null
  return h.replace(/#.*$/, '').replace(/\/?$/, '/') + '#indir'
}

// "github:ad/mcbot", "ad/mcbot" ya da "https://github.com/ad/mcbot(.git)" yazılabilir
function depoBul() {
  const r = paket.repository
  const metin = typeof r === 'string' ? r : r && r.url
  if (!metin) return null
  const m = metin.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/) ||
    metin.match(/^(?:github:)?([^/\s:]+)\/([^/\s]+?)(?:\.git)?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

// "1.10.0" > "1.9.2" gibi sayısal karşılaştırma: a > b ise pozitif
function surumKarsilastir(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0)
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const fark = (pa[i] || 0) - (pb[i] || 0)
    if (fark) return fark
  }
  return 0
}

async function kontrolEt() {
  const depo = depoBul()
  if (!depo) return
  try {
    const yanit = await fetch(`https://api.github.com/repos/${depo}/releases/latest`, {
      headers: { 'User-Agent': 'MCBot', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!yanit.ok) return // henüz release yok ya da GitHub'a ulaşılamadı: sessizce geç
    const veri = await yanit.json()
    const son = String(veri.tag_name || '').replace(/^v/i, '')
    if (son && surumKarsilastir(son, paket.version) > 0) {
      if (!yeniSurum || yeniSurum.surum !== son) console.log(`Yeni sürüm var: ${son} (sizdeki ${paket.version})`)
      yeniSurum = { surum: son, adres: siteAdresi() || veri.html_url || `https://github.com/${depo}/releases/latest` }
    } else {
      yeniSurum = null
    }
  } catch (e) {
    // internet yoksa önemli değil, sonra tekrar denenir
  }
}

function baslat() {
  kontrolEt()
  setInterval(kontrolEt, 6 * 60 * 60 * 1000).unref()
}

module.exports = {
  baslat,
  kontrolEt,
  surumKarsilastir,
  depoBul,
  siteAdresi,
  bilgi: () => yeniSurum,
  surum: paket.version,
}
