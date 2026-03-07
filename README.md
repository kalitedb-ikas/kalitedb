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

Varsayilan olarak API `file` driver ile `.data/local-db.json` altina yazar. Firebase kullanmak icin `APP_DATA_DRIVER=firebase` ve ilgili servis hesap degiskenlerini tanimlayin.

