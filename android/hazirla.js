// android/hazirla.js — Android uygulamasını derlemeden önce çalıştırılır:
//   1) Bilgisayar sürümüyle ORTAK bot dosyalarını (package.json'daki "build.files" listesi)
//      android/app/build/nodejs-project klasörüne kopyalar. Böylece her güncelleme iki sürüme de gider.
//   2) Telefon için Node 18 uyumlu kütüphaneleri (android/nodejs-project/node_modules) ekler,
//      gereksiz Minecraft verilerini (Bedrock, eski sürümler) siler: uygulama ~500 MB yerine küçük kalır.
//   3) Telefonda çalışan Node.js motorunu (nodejs-mobile, libnode.so) indirir: android/app/libnode
//
// Kullanım (önce kütüphaneler kurulmalı):
//   cd android/nodejs-project && npm ci --omit=dev && cd ../.. && node android/hazirla.js

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const KOK = path.resolve(__dirname, '..')
const ANDROID = __dirname
const HEDEF = path.join(ANDROID, 'app', 'build', 'nodejs-project')
const KUTUPHANE = path.join(ANDROID, 'nodejs-project')
const LIBNODE = path.join(ANDROID, 'app', 'libnode')
const NODEJS_MOBILE_SURUM = '18.20.4'
// Telefonda desteklenen Minecraft Java sürümleri (Node 18 uyumlu mineflayer 4.25 bunları destekler)
const TUTULACAK_SURUM = /^1\.(20|21)(\.|$)/

function sil(yol) {
  fs.rmSync(yol, { recursive: true, force: true })
}
function boyut(yol) {
  let t = 0
  for (const g of fs.readdirSync(yol, { withFileTypes: true })) {
    const p = path.join(yol, g.name)
    t += g.isDirectory() ? boyut(p) : fs.statSync(p).size
  }
  return t
}
const mb = (b) => (b / 1024 / 1024).toFixed(1) + ' MB'

// ---------------------------------------------------------------- 1) ortak bot dosyaları
const kokPaket = JSON.parse(fs.readFileSync(path.join(KOK, 'package.json'), 'utf8'))
const ortak = kokPaket.build.files.filter((f) => f.endsWith('.js') && f !== 'main.js')
sil(HEDEF)
fs.mkdirSync(HEDEF, { recursive: true })
for (const f of ortak) fs.copyFileSync(path.join(KOK, f), path.join(HEDEF, f))
fs.copyFileSync(path.join(KUTUPHANE, 'android.js'), path.join(HEDEF, 'android.js'))

// Güncelleme kontrolü için sürüm ve depo bilgisi (GitHub'da derlenirken depo adı otomatik gelir)
let depo = kokPaket.repository
if (!depo && process.env.GITHUB_REPOSITORY) depo = `github:${process.env.GITHUB_REPOSITORY}`
const paket = { name: 'mcbot', private: true, version: kokPaket.version, main: 'android.js' }
if (depo) paket.repository = depo
if (kokPaket.homepage) paket.homepage = kokPaket.homepage // güncelleme bulununca açılacak web sitesi
fs.writeFileSync(path.join(HEDEF, 'package.json'), JSON.stringify(paket, null, 2) + '\n')
console.log(`Ortak dosyalar kopyalandı (${ortak.length} dosya), sürüm ${kokPaket.version}${depo ? ', depo ' + (depo.url || depo) : ''}`)

// ---------------------------------------------------------------- 2) kütüphaneler
const kaynakModul = path.join(KUTUPHANE, 'node_modules')
if (!fs.existsSync(kaynakModul)) {
  console.error('HATA: android/nodejs-project/node_modules yok. Önce: cd android/nodejs-project && npm ci --omit=dev')
  process.exit(1)
}
const hedefModul = path.join(HEDEF, 'node_modules')
fs.cpSync(kaynakModul, hedefModul, { recursive: true, dereference: true })

// minecraft-data: sadece telefonda desteklenen Java sürümlerinin verisi kalsın
const veri = path.join(hedefModul, 'minecraft-data', 'minecraft-data', 'data')
const yollar = JSON.parse(fs.readFileSync(path.join(veri, 'dataPaths.json'), 'utf8'))
const gerekli = new Set(['pc/common'])
for (const [surum, bolumler] of Object.entries(yollar.pc)) {
  if (!TUTULACAK_SURUM.test(surum)) continue
  for (const klasor of Object.values(bolumler)) gerekli.add(klasor)
}
const once = boyut(path.join(hedefModul, 'minecraft-data'))
// Bedrock verisini sil ama "common" kalsın: minecraft-data açılırken oradaki birkaç küçük dosyayı okur
for (const k of fs.readdirSync(path.join(veri, 'bedrock'))) {
  if (k !== 'common') sil(path.join(veri, 'bedrock', k))
}
for (const k of fs.readdirSync(path.join(veri, 'pc'))) {
  if (!gerekli.has(`pc/${k}`)) sil(path.join(veri, 'pc', k))
}
// Telefonda işe yaramayan belge/örnek/test klasörleri
const gereksizKlasor = new Set(['test', 'tests', 'example', 'examples', 'docs', 'doc', '.github', 'benchmark', 'benchmarks'])
const gereksizDosya = /\.(md|markdown|d\.ts|map|ts)$/i
function temizle(yol) {
  for (const g of fs.readdirSync(yol, { withFileTypes: true })) {
    const p = path.join(yol, g.name)
    if (g.isDirectory()) {
      if (gereksizKlasor.has(g.name.toLowerCase())) sil(p)
      else temizle(p)
    } else if (gereksizDosya.test(g.name) && !/^license/i.test(g.name)) {
      fs.rmSync(p, { force: true })
    }
  }
}
temizle(hedefModul)
console.log(`Kütüphaneler hazır: minecraft-data ${mb(once)} -> ${mb(boyut(path.join(hedefModul, 'minecraft-data')))}, toplam ${mb(boyut(HEDEF))}`)

// ---------------------------------------------------------------- 3) Node.js motoru (libnode.so)
if (fs.existsSync(path.join(LIBNODE, 'bin', 'arm64-v8a', 'libnode.so'))) {
  console.log('Node.js motoru zaten var:', LIBNODE)
} else {
  const gecici = path.join(ANDROID, 'app', 'build', 'libnode-indir')
  sil(gecici)
  fs.mkdirSync(gecici, { recursive: true })
  console.log(`Node.js motoru indiriliyor (nodejs-mobile ${NODEJS_MOBILE_SURUM}, ~100 MB)...`)
  execSync(`npm pack nodejs-mobile-react-native@${NODEJS_MOBILE_SURUM} --silent`, { cwd: gecici, stdio: 'inherit' })
  const tgz = fs.readdirSync(gecici).find((f) => f.endsWith('.tgz'))
  execSync(`tar -xzf "${tgz}" package/android/libnode`, { cwd: gecici, stdio: 'inherit' })
  sil(LIBNODE)
  fs.cpSync(path.join(gecici, 'package', 'android', 'libnode'), LIBNODE, { recursive: true })
  sil(gecici)
  console.log('Node.js motoru hazır:', LIBNODE)
}
