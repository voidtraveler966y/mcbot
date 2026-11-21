package com.mcbot.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.system.Os;
import android.util.Log;

import java.io.File;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Botu arka planda çalıştıran servis. "Başlat"la açılır, "Durdur"a basılana kadar çalışır
 * (uygulama kapatılsa bile). Android, arka planda çalışan servislerin sürekli bir bildirim
 * göstermesini zorunlu tutar: "MCBot çalışıyor".
 * Ayrı bir süreçte (":node") çalışır; Durdur'da bu süreç tamamen kapatılır.
 */
public class BotServisi extends Service {
    static final String ETIKET = "MCBot";
    static final String DURDUR = "com.mcbot.app.DURDUR";
    static final int PANEL_PORTU = 38517;
    private static final String KANAL = "mcbot_calisiyor";
    private static final int BILDIRIM_NO = 1;

    private static boolean baslatildi = false; // bu süreçte Node bir kez başlatılabilir
    private PowerManager.WakeLock uyanikKilit;
    private WifiManager.WifiLock wifiKilit;

    @Override
    public int onStartCommand(Intent niyet, int bayraklar, int baslangicNo) {
        if (niyet != null && DURDUR.equals(niyet.getAction())) {
            durdur();
            return START_NOT_STICKY;
        }
        try {
            onePlanaAl();
        } catch (Exception e) {
            // Android bazı durumlarda arka plandan ön plan servisi başlatmaya izin vermez
            Log.e(ETIKET, "Ön plana alınamadı", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!baslatildi) {
            baslatildi = true;
            kilitleriAl();
            Thread is = new Thread(this::nodeCalistir, "mcbot-node");
            is.start();
        }
        // Sistem servisi kapatırsa yeniden başlatsın (Durdur'a basılmadıkça)
        return START_STICKY;
    }

    private void nodeCalistir() {
        try {
            File proje = NodeMotoru.projeyiHazirla(this);
            File veri = new File(getFilesDir(), "veri");
            //noinspection ResultOfMethodCallIgnored
            veri.mkdirs();
            Os.setenv("MCBOT_VERI", veri.getAbsolutePath(), true);
            Os.setenv("MCBOT_PANEL_PORT", String.valueOf(PANEL_PORTU), true);
            Os.setenv("MCBOT_MOBIL", "1", true);
            Os.setenv("HOME", veri.getAbsolutePath(), true);
            Os.setenv("TMPDIR", getCacheDir().getAbsolutePath(), true);
            int sonuc = NodeMotoru.baslat(new String[] {"node", new File(proje, "android.js").getAbsolutePath()});
            Log.i(ETIKET, "Node kapandı: " + sonuc);
        } catch (Throwable t) {
            Log.e(ETIKET, "Bot başlatılamadı", t);
        }
        // Node kendiliğinden kapandıysa servisi de kapat
        durdur();
    }

    private void onePlanaAl() {
        NotificationManager yonetici = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel kanal = new NotificationChannel(KANAL, "Bot çalışıyor", NotificationManager.IMPORTANCE_LOW);
            kanal.setDescription("MCBot arka planda çalışırken görünür");
            kanal.setShowBadge(false);
            yonetici.createNotificationChannel(kanal);
            b = new Notification.Builder(this, KANAL);
        } else {
            //noinspection deprecation
            b = new Notification.Builder(this);
        }
        int bayrak = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent ac = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), bayrak);
        PendingIntent dur = PendingIntent.getService(this, 1, new Intent(this, BotServisi.class).setAction(DURDUR), bayrak);
        b.setSmallIcon(R.drawable.ic_bildirim)
                .setContentTitle("MCBot çalışıyor")
                .setContentText("Bot arka planda çalışıyor. Paneli açmak için dokunun.")
                .setContentIntent(ac)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_bildirim), "Durdur", dur).build());
        Notification bildirim = b.build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(BILDIRIM_NO, bildirim, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(BILDIRIM_NO, bildirim);
        }
    }

    // Ekran kapalıyken de işlemci ve Wi-Fi uyumasın
    private void kilitleriAl() {
        PowerManager guc = (PowerManager) getSystemService(Context.POWER_SERVICE);
        uyanikKilit = guc.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MCBot::bot");
        uyanikKilit.setReferenceCounted(false);
        uyanikKilit.acquire();
        WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifi != null) {
            int mod = Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifiKilit = wifi.createWifiLock(mod, "MCBot::wifi");
            wifiKilit.setReferenceCounted(false);
            wifiKilit.acquire();
        }
    }

    private synchronized void durdur() {
        // Önce botu oyundan düzgünce çıkar (panelin "Durdur"u), sonra süreci kapat
        new Thread(() -> {
            try {
                HttpURLConnection b = (HttpURLConnection) new URL("http://127.0.0.1:" + PANEL_PORTU + "/api/durdur").openConnection();
                b.setRequestMethod("POST");
                b.setConnectTimeout(800);
                b.setReadTimeout(1500);
                b.setDoOutput(true);
                b.setRequestProperty("Content-Type", "application/json");
                try (OutputStream o = b.getOutputStream()) {
                    o.write("{}".getBytes(StandardCharsets.UTF_8));
                }
                b.getResponseCode();
                b.disconnect();
                Thread.sleep(800);
            } catch (Exception e) {
                // bot zaten kapalı olabilir
            }
            try {
                if (uyanikKilit != null && uyanikKilit.isHeld()) uyanikKilit.release();
                if (wifiKilit != null && wifiKilit.isHeld()) wifiKilit.release();
            } catch (Exception ignored) {
            }
            stopForeground(true);
            stopSelf();
            // Node aynı süreçte yeniden başlatılamaz: bu süreci tamamen kapat
            android.os.Process.killProcess(android.os.Process.myPid());
        }, "mcbot-durdur").start();
    }

    @Override
    public IBinder onBind(Intent niyet) {
        return null;
    }
}
