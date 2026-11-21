// android.js — telefonda Node.js buradan başlar.
// Botun kendisi bilgisayar sürümüyle aynı dosyalardır (bot.js, panel.js, ...);
// bu dosya sadece telefona özgü küçük ayarları yapıp botu başlatır.
// Ortam değişkenleri (ayar klasörü, panel portu) Android tarafında (BotServisi.java) verilir.

process.env.MCBOT_MOBIL = '1'

// Telefonda bir hata yüzünden bütün uygulama kapanmasın: yakala ve kayda yaz
process.on('uncaughtException', (e) => console.log('Beklenmeyen hata:', (e && e.stack) || e))
process.on('unhandledRejection', (e) => console.log('Yakalanmamış hata:', (e && e.stack) || e))

require('./bot')
