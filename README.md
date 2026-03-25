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
