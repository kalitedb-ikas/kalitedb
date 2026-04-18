import type { Representative } from "@kalitedb/shared";

export function RepNameCell(props: {
  name: string;
  rep?: Representative | undefined;
}) {
  const isDeparted = props.rep?.status === "departed";
  return (
    <span className="inline-flex flex-col leading-tight">
      <span>{props.name}</span>
      {isDeparted ? (
        <span className="mt-0.5 inline-flex w-fit items-center rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-300">
          Ayrıldı
        </span>
      ) : null}
    </span>
  );
}
