package com.mcbot.app;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.util.Log;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Telefondaki Node.js motoru.
 * Botun JavaScript dosyaları uygulamanın içinde "nodejs-project.zip" olarak gelir;
 * ilk açılışta (ve her güncellemeden sonra) telefonun hafızasına açılır, Node oradan çalıştırır.
 * Node bir süreçte yalnızca bir kez başlatılabildiği için BotServisi ayrı bir süreçte çalışır
 * ve "Durdur"da o süreç tamamen kapatılır.
 */
final class NodeMotoru {
    private static final String ETIKET = "MCBot";

    static {
        System.loadLibrary("mcbot-motor"); // libnode.so ve libc++_shared.so da onunla birlikte yüklenir
    }

    private NodeMotoru() {}

    /** Node.js'i başlatır; Node kapanana kadar geri dönmez. */
    static native int baslat(String[] argumanlar);

    /** Bot dosyalarının açıldığı klasör (gerekirse zip'ten açar). */
    static File projeyiHazirla(Context baglam) throws IOException {
        File hedef = new File(baglam.getFilesDir(), "nodejs-project");
        File isaret = new File(baglam.getFilesDir(), "nodejs-project.surum");

        String surum;
        try {
            PackageInfo bilgi = baglam.getPackageManager().getPackageInfo(baglam.getPackageName(), 0);
            surum = bilgi.lastUpdateTime + "";
        } catch (Exception e) {
            surum = "?";
        }
        if (hedef.isDirectory() && isaret.exists()) {
            String eski = oku(isaret).trim();
            if (eski.equals(surum)) return hedef; // zaten güncel
        }

        Log.i(ETIKET, "Bot dosyaları açılıyor...");
        sil(hedef);
        if (!hedef.mkdirs() && !hedef.isDirectory()) throw new IOException("Klasör oluşturulamadı: " + hedef);
        String kok = hedef.getCanonicalPath() + File.separator;
        byte[] tampon = new byte[64 * 1024];
        try (InputStream giris = baglam.getAssets().open("nodejs-project.zip");
             ZipInputStream zip = new ZipInputStream(giris)) {
            ZipEntry kayit;
            while ((kayit = zip.getNextEntry()) != null) {
                File dosya = new File(hedef, kayit.getName());
                if (!dosya.getCanonicalPath().startsWith(kok)) throw new IOException("Geçersiz dosya yolu: " + kayit.getName());
                if (kayit.isDirectory()) {
                    dosya.mkdirs();
                    continue;
                }
                File ust = dosya.getParentFile();
                if (ust != null) ust.mkdirs();
                try (OutputStream cikis = new BufferedOutputStream(new FileOutputStream(dosya))) {
                    int n;
                    while ((n = zip.read(tampon)) > 0) cikis.write(tampon, 0, n);
                }
            }
        }
        try (OutputStream cikis = new FileOutputStream(isaret)) {
            cikis.write(surum.getBytes(StandardCharsets.UTF_8));
        }
        Log.i(ETIKET, "Bot dosyaları hazır: " + hedef);
        return hedef;
    }

    private static String oku(File f) throws IOException {
        try (InputStream giris = new FileInputStream(f); ByteArrayOutputStream b = new ByteArrayOutputStream()) {
            byte[] t = new byte[1024];
            int n;
            while ((n = giris.read(t)) > 0) b.write(t, 0, n);
            return new String(b.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static void sil(File f) {
        if (f.isDirectory()) {
            File[] icindekiler = f.listFiles();
            if (icindekiler != null) for (File c : icindekiler) sil(c);
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
