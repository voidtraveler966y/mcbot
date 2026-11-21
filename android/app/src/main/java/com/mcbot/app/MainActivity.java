package com.mcbot.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Ana ekran: üstte Başlat / Durdur, altta botun kontrol paneli (bilgisayardakiyle aynı panel).
 */
public class MainActivity extends Activity {
    private static final String PANEL = "http://127.0.0.1:" + BotServisi.PANEL_PORTU + "/";
    private static final String KAPALI_SAYFA = "<html><body style='font-family:sans-serif;color:#555;"
            + "display:flex;align-items:center;justify-content:center;height:90vh;text-align:center;padding:24px'>"
            + "<div><div style='font-size:42px'>🤖</div><p><b>Bot kapalı.</b></p>"
            + "<p>Çalıştırmak için yukarıdaki <b>Başlat</b>'a basın.<br>Bot, <b>Durdur</b>'a basana kadar arka planda çalışır.</p>"
            + "</div></body></html>";

    private final Handler zamanlayici = new Handler(Looper.getMainLooper());
    private WebView panel;
    private TextView durum;
    private Button baslat;
    private Button durdur;
    private boolean panelAcik = false;
    private boolean bekleniyor = false; // Başlat'a basıldı, bot açılıyor

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle kayit) {
        super.onCreate(kayit);
        float d = getResources().getDisplayMetrics().density;

        LinearLayout kok = new LinearLayout(this);
        kok.setOrientation(LinearLayout.VERTICAL);
        kok.setBackgroundColor(Color.parseColor("#F4F5F2"));

        LinearLayout ust = new LinearLayout(this);
        ust.setOrientation(LinearLayout.HORIZONTAL);
        ust.setGravity(Gravity.CENTER_VERTICAL);
        ust.setPadding((int) (14 * d), (int) (10 * d), (int) (10 * d), (int) (10 * d));
        ust.setBackgroundColor(Color.parseColor("#283240"));

        durum = new TextView(this);
        durum.setTextColor(Color.WHITE);
        durum.setTextSize(15);
        durum.setTypeface(Typeface.DEFAULT_BOLD);
        durum.setText("MCBot");
        ust.addView(durum, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        baslat = new Button(this);
        baslat.setText("Başlat");
        baslat.setOnClickListener(v -> botuBaslat());
        ust.addView(baslat);

        durdur = new Button(this);
        durdur.setText("Durdur");
        durdur.setOnClickListener(v -> botuDurdur());
        ust.addView(durdur);

        panel = new WebView(this);
        WebSettings ayar = panel.getSettings();
        ayar.setJavaScriptEnabled(true);
        ayar.setDomStorageEnabled(true);
        ayar.setSupportMultipleWindows(false); // "yeni sekmede aç" linkleri de aşağıdaki kontrole düşsün
        panel.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest istek) {
                Uri adres = istek.getUrl();
                if ("127.0.0.1".equals(adres.getHost()) || "localhost".equals(adres.getHost())) return false;
                // Microsoft girişi, GitHub indirme sayfası gibi linkler telefonun tarayıcısında açılsın
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, adres));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        kok.addView(ust, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        kok.addView(panel, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(kok);
        kapaliGoster();
    }

    @Override
    protected void onResume() {
        super.onResume();
        zamanlayici.post(denetle);
    }

    @Override
    protected void onPause() {
        super.onPause();
        zamanlayici.removeCallbacks(denetle);
    }

    @Override
    public void onBackPressed() {
        if (panel.canGoBack()) panel.goBack();
        else super.onBackPressed();
    }

    // 2 saniyede bir: bot çalışıyor mu? (panel cevap veriyor mu)
    private final Runnable denetle = new Runnable() {
        @Override
        public void run() {
            new Thread(() -> {
                boolean calisiyor = panelCevapVeriyor();
                runOnUiThread(() -> durumuGoster(calisiyor));
            }).start();
            zamanlayici.postDelayed(this, 2000);
        }
    };

    private boolean panelCevapVeriyor() {
        try {
            HttpURLConnection b = (HttpURLConnection) new URL(PANEL + "api/durum").openConnection();
            b.setConnectTimeout(700);
            b.setReadTimeout(1200);
            int kod = b.getResponseCode();
            b.disconnect();
            return kod == 200;
        } catch (Exception e) {
            return false;
        }
    }

    private void durumuGoster(boolean calisiyor) {
        if (calisiyor) {
            bekleniyor = false;
            durum.setText("● Çalışıyor");
            durum.setTextColor(Color.parseColor("#7FE08A"));
            if (!panelAcik) {
                panelAcik = true;
                panel.loadUrl(PANEL);
            }
        } else {
            durum.setText(bekleniyor ? "Açılıyor…" : "○ Kapalı");
            durum.setTextColor(bekleniyor ? Color.parseColor("#F5D36B") : Color.parseColor("#C9CED6"));
            if (panelAcik && !bekleniyor) kapaliGoster();
        }
        baslat.setEnabled(!calisiyor && !bekleniyor);
        durdur.setEnabled(calisiyor || bekleniyor);
    }

    private void kapaliGoster() {
        panelAcik = false;
        panel.loadDataWithBaseURL(null, KAPALI_SAYFA, "text/html", "utf-8", null);
    }

    private void botuBaslat() {
        // Android 13+: bildirim izni (arka planda çalışma bildirimi için)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
        pilOptimizasyonunuSor();
        Intent niyet = new Intent(this, BotServisi.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(niyet);
        else startService(niyet);
        bekleniyor = true;
        durumuGoster(false);
    }

    private void botuDurdur() {
        startService(new Intent(this, BotServisi.class).setAction(BotServisi.DURDUR));
        bekleniyor = false;
        durumuGoster(false);
        kapaliGoster();
    }

    // Bazı telefonlar pil tasarrufu için arka plandaki uygulamaları kapatır: MCBot'u muaf tutmak için izin iste
    @SuppressLint("BatteryLife")
    private void pilOptimizasyonunuSor() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        PowerManager guc = (PowerManager) getSystemService(POWER_SERVICE);
        if (guc == null || guc.isIgnoringBatteryOptimizations(getPackageName())) return;
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void onDestroy() {
        if (panel != null) {
            panel.setVisibility(View.GONE);
            panel.destroy();
        }
        super.onDestroy();
    }
}
