# KaliteDB

Firebase destekli, CSV import tabanli aylik kalite raporlama platformu.

## Mimariler

- `apps/web`: React + Vite + Tailwind dashboard ve sunum modu
- `apps/api`: Next.js route handler tabanli API
- `packages/shared`: domain tipleri, Zod semalari, hesaplama mantigi
- `packages/ui`: tekrar kullanilabilir React UI parcalari

## Gelistirme

1. `pnpm install`
2. `cp apps/web/.env.example apps/web/.env.local`
3. `cp apps/api/.env.example apps/api/.env.local`
4. `pnpm dev`

API artik `APP_DATA_DRIVER=auto` ile calisabilir. Firebase Admin erisimi varsa Firestore'a gecer, yoksa `.data/local-db.json` dosyasina geri duser.

Firestore kullanimi icin iki yol vardir:

1. `FIREBASE_CLIENT_EMAIL` ve `FIREBASE_PRIVATE_KEY` ile servis hesap bilgisi tanimlayin.
2. Ya da Firebase/Google emulator veya `GOOGLE_APPLICATION_CREDENTIALS` kullanin.

Okuma maliyetini dusurmek icin dashboard ve donem detay endpoint'leri artik sadece ihtiyac duyulan dataset koleksiyonlarini ceker.

`APP_ALLOW_FIRST_ADMIN_BOOTSTRAP=true` ise sistemde hic rol kaydi yokken ilk Google kullanicisi otomatik `admin` olarak kaydedilir. Ilk kurulumdan sonra isterseniz bu ayari kapatabilirsiniz.

## Production deployment

Kalici kurulum icin onerilen yapi:

- `apps/web`: GitHub Pages uzerinden statik yayin
- `apps/api`: Google Cloud Run uzerinden surekli calisan API

Repo icindeki [deploy-pages.yml](./.github/workflows/deploy-pages.yml) artik uygun GCP kimlik bilgileri varsa once API'yi Cloud Run'a deploy eder, sonra donen kalici servis URL'i ile Pages build alir. GCP ayarlari eksikse workflow fallback olarak `VITE_API_BASE_URL` degeriyle devam eder.

Gerekli GitHub ayarlari:

- Repo variable `GCP_PROJECT_ID`
- Repo variable `CLOUD_RUN_REGION`
- Repo variable `CLOUD_RUN_SERVICE`
- Tercihen repo variable `GCP_WORKLOAD_IDENTITY_PROVIDER`
- Tercihen repo variable `GCP_SERVICE_ACCOUNT`
- Alternatif olarak repo secret `GCP_SA_KEY`

Cloud Run tarafinda bu uygulama mevcut kodla servis hesabi uzerinden `applicationDefault()` kullanabildigi icin runtime'da ekstra Firebase private key tasimak zorunda degil. Bunun icin Cloud Run runtime servis hesabinin Firestore, Firebase Auth ve Storage islemlerini yapabilecek izinlere sahip olmasi gerekir.

Notlar:

- Firebase App Hosting resmi olarak Blaze plan istiyor. Cloud Run da faturalandirma gerektirir, ancak kullandiginiz kadar odersiniz ve surekli bir free tier bulunur.
- Workflow Cloud Run deploy icin repo kokundeki [Dockerfile](./Dockerfile) dosyasini kullanir.
