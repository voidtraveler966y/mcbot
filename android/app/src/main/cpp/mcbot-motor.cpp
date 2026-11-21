// mcbot-motor.cpp — Android'den Node.js'i başlatan küçük köprü.
// Java tarafı (NodeMotoru.java) bunu bir kez çağırır; Node kapanana kadar geri dönmez.
// Node'un konsol çıktısı Android kayıtlarına (logcat, etiket "MCBot") yönlendirilir.
// nodejs-mobile örneklerindeki standart yöntemden uyarlanmıştır.

#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <pthread.h>
#include <unistd.h>
#include <android/log.h>
#include "node.h"

static const char *ETIKET = "MCBot";
static int boru_cikti[2];
static int boru_hata[2];

static void *okuyucu(void *arg) {
    const int *boru = static_cast<const int *>(arg);
    const int oncelik = (boru == boru_hata) ? ANDROID_LOG_ERROR : ANDROID_LOG_INFO;
    char tampon[2048];
    ssize_t n;
    while ((n = read(boru[0], tampon, sizeof tampon - 1)) > 0) {
        if (tampon[n - 1] == '\n') --n;
        tampon[n] = 0;
        __android_log_write(oncelik, ETIKET, tampon);
    }
    return nullptr;
}

static void ciktilariYonlendir() {
    setvbuf(stdout, nullptr, _IONBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    if (pipe(boru_cikti) == 0) dup2(boru_cikti[1], STDOUT_FILENO);
    if (pipe(boru_hata) == 0) dup2(boru_hata[1], STDERR_FILENO);
    pthread_t t1, t2;
    if (pthread_create(&t1, nullptr, okuyucu, boru_cikti) == 0) pthread_detach(t1);
    if (pthread_create(&t2, nullptr, okuyucu, boru_hata) == 0) pthread_detach(t2);
}

extern "C" JNIEXPORT jint JNICALL
Java_com_mcbot_app_NodeMotoru_baslat(JNIEnv *env, jclass /* sinif */, jobjectArray argumanlar) {
    const jsize adet = env->GetArrayLength(argumanlar);

    // Node, tüm argümanların bitişik bellekte olmasını ister
    size_t toplam = 0;
    for (jsize i = 0; i < adet; i++) {
        auto s = static_cast<jstring>(env->GetObjectArrayElement(argumanlar, i));
        const char *c = env->GetStringUTFChars(s, nullptr);
        toplam += strlen(c) + 1;
        env->ReleaseStringUTFChars(s, c);
        env->DeleteLocalRef(s);
    }
    char *tampon = static_cast<char *>(calloc(toplam, 1));
    char **argv = static_cast<char **>(calloc(adet + 1, sizeof(char *)));
    char *yer = tampon;
    for (jsize i = 0; i < adet; i++) {
        auto s = static_cast<jstring>(env->GetObjectArrayElement(argumanlar, i));
        const char *c = env->GetStringUTFChars(s, nullptr);
        const size_t uzunluk = strlen(c);
        memcpy(yer, c, uzunluk + 1);
        argv[i] = yer;
        yer += uzunluk + 1;
        env->ReleaseStringUTFChars(s, c);
        env->DeleteLocalRef(s);
    }

    ciktilariYonlendir();
    __android_log_write(ANDROID_LOG_INFO, ETIKET, "Node.js başlatılıyor");
    const int sonuc = node::Start(static_cast<int>(adet), argv);
    __android_log_print(ANDROID_LOG_INFO, ETIKET, "Node.js kapandı, çıkış kodu %d", sonuc);
    return static_cast<jint>(sonuc);
}
