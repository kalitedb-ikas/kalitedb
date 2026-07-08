/**
 * Admin v2 tasarım sistemi — yönetim panellerinin ortak primitifleri.
 *
 * Renk vurgusu (accent) AdminShell'in kök elemanındaki `adm-accent-*` sınıfından
 * gelen CSS değişkenleriyle çözülür (bkz. styles/index.css "Admin v2" bloğu):
 *   --adm-accent, --adm-accent-strong, --adm-accent-bright,
 *   --adm-accent-soft, --adm-accent-border, --adm-accent-text
 */
import { LoaderCircle, Plus, Trash2, Upload } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ── Form kontrolleri ── */

export const ADMIN_INPUT =
  "h-11 w-full rounded-[12px] border border-slate-200 bg-white px-3.5 text-sm text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 transition focus:border-[var(--adm-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-accent-soft)] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500";

/** Genişlik sınıfı içermeyen input tabanı — `cx(ADMIN_INPUT_BASE, "w-32")` gibi kullanın. */
export const ADMIN_INPUT_BASE =
  "h-11 rounded-[12px] border border-slate-200 bg-white px-3.5 text-sm text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 transition focus:border-[var(--adm-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-accent-soft)] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500";

export const ADMIN_TEXTAREA =
  "w-full resize-y rounded-[12px] border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 transition focus:border-[var(--adm-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-accent-soft)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500";

/* ── Butonlar ── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerSolid";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariantMap: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--adm-accent)] text-white shadow-[0_10px_24px_-10px_var(--adm-accent)] hover:bg-[var(--adm-accent-strong)] disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "border border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700/60",
  ghost:
    "text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
  danger:
    "border border-rose-200 bg-white text-rose-600 hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700/40 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/40",
  dangerSolid:
    "bg-rose-600 text-white shadow-[0_10px_24px_-10px_rgba(225,29,72,0.7)] hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
};

const buttonSizeMap: Record<ButtonSize, string> = {
  sm: "min-h-8 gap-1.5 rounded-[10px] px-3 text-xs font-semibold",
  md: "min-h-10 gap-2 rounded-[12px] px-4 text-sm font-semibold",
  lg: "min-h-11 gap-2 rounded-[12px] px-5 text-sm font-semibold"
};

export function adminButtonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center whitespace-nowrap transition",
    buttonSizeMap[size],
    buttonVariantMap[variant],
    extra
  );
}

export function AdminButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant | undefined;
    size?: ButtonSize | undefined;
    icon?: ReactNode | undefined;
    loading?: boolean | undefined;
  }
) {
  const { variant = "secondary", size = "md", icon, loading, className, children, disabled, type, ...rest } = props;
  return (
    <button
      className={adminButtonClass(variant, size, className)}
      disabled={disabled || loading}
      type={type ?? "button"}
      {...rest}
    >
      {loading ? <LoaderCircle className="animate-spin" size={size === "sm" ? 13 : 15} /> : icon}
      {children}
    </button>
  );
}

/* ── Kart ── */

export function AdminCard(props: {
  title?: string | undefined;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  icon?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
  bodyClassName?: string | undefined;
  /** SurfaceCard API uyumluluğu için kabul edilir, görsel etkisi yoktur. */
  variant?: string | undefined;
}) {
  const hasHeader = Boolean(props.title || props.description || props.actions);
  return (
    <section
      className={cx(
        "overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_-16px_rgba(15,23,42,0.3)] dark:border-slate-700 dark:bg-slate-900",
        props.className
      )}
    >
      {hasHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 bg-slate-50/60 px-5 py-4 dark:border-slate-700/60 dark:bg-slate-800/40 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-start gap-3">
            {props.icon ? (
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--adm-accent-soft)] text-[var(--adm-accent-text)]">
                {props.icon}
              </span>
            ) : null}
            <div className="min-w-0">
              {props.title ? (
                <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-100">
                  {props.title}
                </h2>
              ) : null}
              {props.description ? (
                <p className="mt-1 max-w-2xl text-[13px] leading-6 text-slate-500 dark:text-slate-400">{props.description}</p>
              ) : null}
            </div>
          </div>
          {props.actions ? <div className="flex flex-wrap items-center gap-2">{props.actions}</div> : null}
        </div>
      ) : null}
      <div className={cx("px-5 py-5 sm:px-6 sm:py-6", props.bodyClassName)}>{props.children}</div>
    </section>
  );
}

/* ── Rozet / pill ── */

export function HeaderPill(props: { children: ReactNode; tone?: "neutral" | "accent" | "success" | "warning" | "danger" }) {
  const tone = props.tone ?? "neutral";
  const toneClass =
    tone === "accent"
      ? "border-[var(--adm-accent-border)] bg-[var(--adm-accent-soft)] text-[var(--adm-accent-text)]"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-400"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-400"
          : tone === "danger"
            ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-400"
            : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-400";
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold", toneClass)}>
      {props.children}
    </span>
  );
}

/* ── Form alanı ── */

export function InputField(props: { label: string; hint?: string | undefined; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{props.label}</span>
      {props.children}
      {props.hint ? <span className="text-xs text-slate-400 dark:text-slate-500">{props.hint}</span> : null}
    </label>
  );
}

export function MiniInput(props: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  // type="number" virgüllü ondalık değerleri (7,5) kabul etmez, text+inputMode kullan
  const isNumeric = props.type === "number";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{props.label}</span>
      <input
        className={cx(ADMIN_INPUT_BASE, "h-10 px-3")}
        inputMode={isNumeric ? "decimal" : undefined}
        onChange={(e) => props.onChange(e.target.value)}
        type={isNumeric ? "text" : (props.type ?? "text")}
        value={props.value}
      />
    </div>
  );
}

/* ── Bildirim bantları ── */

export function Banner(props: { tone: "danger" | "success" | "warning" | "info"; children: ReactNode }) {
  const toneClass =
    props.tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-400"
      : props.tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-400"
        : props.tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-400"
          : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-700/40 dark:bg-sky-900/30 dark:text-sky-400";
  return (
    <div className={cx("rounded-[12px] border px-4 py-3 text-sm leading-6", toneClass)}>{props.children}</div>
  );
}

export function ErrorBanner(props: { message: string; prefix?: string }) {
  return (
    <Banner tone="danger">
      {props.prefix ? `${props.prefix}: ` : ""}
      {props.message}
    </Banner>
  );
}

export function SuccessBanner(props: { message: string }) {
  return <Banner tone="success">{props.message}</Banner>;
}

export function EmptyBlock(props: { message: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-400">
      {props.message}
    </div>
  );
}

/* ── CSV bırakma alanı ── */

export function AdminDropzone(props: {
  onFile: (file: File) => void;
  accept?: string | undefined;
  busy?: boolean | undefined;
  title?: string | undefined;
  hint?: ReactNode | undefined;
  compact?: boolean | undefined;
}) {
  return (
    <label
      className={cx(
        "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed text-center transition",
        props.compact ? "min-h-24 px-4 py-4" : "min-h-32 px-6 py-8",
        props.busy
          ? "cursor-wait border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60"
          : "border-slate-200 bg-slate-50/60 hover:border-[var(--adm-accent)] hover:bg-[var(--adm-accent-soft)] dark:border-slate-600 dark:bg-slate-800/40"
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-[0_1px_3px_rgba(15,23,42,0.1)] transition group-hover:text-[var(--adm-accent-text)] dark:bg-slate-700 dark:text-slate-400">
        {props.busy ? <LoaderCircle className="animate-spin" size={18} /> : <Upload size={18} />}
      </span>
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {props.busy ? "Yükleniyor..." : (props.title ?? "CSV dosyası seçin veya sürükleyin")}
      </span>
      {props.hint ? <span className="text-xs text-slate-400 dark:text-slate-500">{props.hint}</span> : null}
      <input
        accept={props.accept ?? ".csv"}
        className="hidden"
        disabled={props.busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            props.onFile(file);
            e.target.value = "";
          }
        }}
        type="file"
      />
    </label>
  );
}

/* ── Tehlikeli işlem bölgesi ── */

export function AdminDangerZone(props: {
  title: string;
  description: string;
  actionLabel: string;
  busyLabel?: string | undefined;
  busy?: boolean | undefined;
  disabled?: boolean | undefined;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[16px] border border-rose-200/80 bg-rose-50/60 px-5 py-4 dark:border-rose-700/40 dark:bg-rose-900/20">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold text-rose-900 dark:text-rose-300">{props.title}</p>
        <p className="text-[13px] leading-6 text-rose-700/90 dark:text-rose-400/90">{props.description}</p>
      </div>
      <AdminButton
        icon={<Trash2 size={14} />}
        variant="danger"
        size="lg"
        disabled={props.disabled}
        loading={props.busy}
        onClick={props.onAction}
      >
        {props.busy ? (props.busyLabel ?? "İşleniyor...") : props.actionLabel}
      </AdminButton>
    </div>
  );
}

/* ── Satır ekleme / silme (manuel giriş tabloları) ── */

export function AddRowButton(props: { onClick: () => void }) {
  return (
    <AdminButton icon={<Plus size={14} />} onClick={props.onClick} size="lg" variant="secondary">
      Satır ekle
    </AdminButton>
  );
}

export function DeleteRowButton(props: { onClick: () => void }) {
  return (
    <button
      className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 dark:border-slate-600 dark:text-slate-500 dark:hover:border-rose-700/40 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
      onClick={props.onClick}
      title="Satırı sil"
      type="button"
    >
      <Trash2 size={13} />
    </button>
  );
}

/* ── Manuel giriş tabloları için ortak sınıflar ── */

export const ADMIN_TABLE_WRAP = "overflow-x-auto rounded-[14px] border border-slate-200 dark:border-slate-700";
export const ADMIN_TABLE_HEAD_ROW = "border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70";
export const ADMIN_TABLE_TH =
  "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400";
