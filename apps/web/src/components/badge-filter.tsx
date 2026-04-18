import { Filter } from "lucide-react";
import { useMemo } from "react";

import { FancySelect } from "./fancy-select";
import { BADGE_DEFINITIONS } from "./representative-detail-modal";

export function BadgeFilter(props: {
  value: string;
  onChange: (value: string) => void;
  availableKeys?: Set<string>;
}) {
  const options = useMemo(() => {
    const defs = props.availableKeys
      ? BADGE_DEFINITIONS.filter((b) => props.availableKeys!.has(b.key))
      : BADGE_DEFINITIONS;
    return defs.map((b) => ({ value: b.key, label: b.label }));
  }, [props.availableKeys]);

  return (
    <div className="inline-flex items-center gap-2">
      <Filter size={14} className="text-slate-400" />
      <FancySelect
        ariaLabel="Etiket filtresi"
        clearable
        clearLabel="Tüm etiketler"
        onChange={props.onChange}
        options={options}
        panelWidthClass="w-56"
        placeholder="Etiketle filtrele"
        size="sm"
        value={props.value}
      />
    </div>
  );
}
