import { normalizeKey } from "@kalitedb/shared";

import { toPublicAssetPath } from "./asset-path";

const REPRESENTATIVE_PHOTO_FILES = [
  "/representatives/abdullah-cakir.png",
  "/representatives/abdulkerim-gurer.png",
  "/representatives/afra-sak.png",
  "/representatives/ahmet-onur-yarici.png",
  "/representatives/ahmet-sakarya.png",
  "/representatives/aslihan-gunduz.png",
  "/representatives/ayca-tokkusoglu.png",
  "/representatives/aysel-sebnem-palta.png",
  "/representatives/bartu-akcay.png",
  "/representatives/batuhan-demirci.png",
  "/representatives/baturay.cetinel.png",
  "/representatives/betul-sena-basara.png",
  "/representatives/burak-telli.png",
  "/representatives/burak-yegin.png",
  "/representatives/cagla-bebek.png",
  "/representatives/celal-semi-savci.png",
  "/representatives/cenk-benli.png",
  "/representatives/dilsad-gergin.png",
  "/representatives/ecenaz-geles.png",
  "/representatives/ege-besik.png",
  "/representatives/elif-korkut.png",
  "/representatives/emre-uzunoglu.png",
  "/representatives/eva-tules-karaca.png",
  "/representatives/evren-yavuz.png",
  "/representatives/fatih-aktas.png",
  "/representatives/furkan-er.png",
  "/representatives/gulbadem-durmus.png",
  "/representatives/halil-can-sezgi.png",
  "/representatives/hande-yavuzkanat.png",
  "/representatives/hatice-kurtipek.png",
  "/representatives/hikmet-ertem-ciftlik.png",
  "/representatives/huseyin-gunder.png",
  "/representatives/idil-meral.png",
  "/representatives/izel-atac.png",
  "/representatives/kaan-mete.png",
  "/representatives/manolya-yilmaz.png",
  "/representatives/mehmet-onur-aykut.png",
  "/representatives/mehmet-tugay-kasap.png",
  "/representatives/melike-er.png",
  "/representatives/mert-karaalioglu.png",
  "/representatives/metehan-acikgoz.png",
  "/representatives/muberra-mertturk.png",
  "/representatives/muhammed-coskun.png",
  "/representatives/nimet-ozturk.png",
  "/representatives/ogun-baris-bayraktar.png",
  "/representatives/omer-bekin.png",
  "/representatives/orcun-erol-kasapoglu.png",
  "/representatives/ozan-berk-fettahli.png",
  "/representatives/ozgun-kazan.png",
  "/representatives/rabia-keskin.png",
  "/representatives/rumeysa-ekmen.png",
  "/representatives/samet-doruk.png",
  "/representatives/seda-cerrah.png",
  "/representatives/selen-kilinc.png",
  "/representatives/sercan.ari.png",
  "/representatives/tolga-ozen-kabasakal.png",
  "/representatives/tugba-simsek.png",
  "/representatives/ugurhan-ozkeles.png",
  "/representatives/umut-akbay.png",
  "/representatives/yaren-ece-kocak.png",
  "/representatives/zafer-coban.png",
  "/representatives/isil-arslan.png"
] as const;

const REPRESENTATIVE_PHOTO_MAP: Record<string, string> = Object.fromEntries(
  REPRESENTATIVE_PHOTO_FILES.map((photoPath) => {
    const fileName = photoPath.split("/").pop() ?? photoPath;
    const baseName = fileName.replace(/\.[^.]+$/, "");
    return [normalizeKey(baseName), photoPath];
  })
);

const REPRESENTATIVE_DISPLAY_NAME_MAP: Record<string, string> = {
  [normalizeKey("baturay.cetinel")]: "Baturay Çetinel",
  [normalizeKey("baturay.cetinel@ikas.com")]: "Baturay Çetinel",
  [normalizeKey("sercan.ari")]: "Sercan Arı",
  [normalizeKey("sercan.ari@ikas.com")]: "Sercan Arı",
  [normalizeKey("zafer.coban")]: "Zafer Çoban",
  [normalizeKey("zafer.coban@ikas.com")]: "Zafer Çoban"
};

export function getRepresentativeDisplayName(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return trimmedValue;
  }

  return REPRESENTATIVE_DISPLAY_NAME_MAP[normalizeKey(trimmedValue)] ?? trimmedValue;
}

export function getRepresentativePhotoSrc(name: string) {
  const photoPath = REPRESENTATIVE_PHOTO_MAP[normalizeKey(name)];
  return photoPath ? toPublicAssetPath(photoPath) : null;
}
