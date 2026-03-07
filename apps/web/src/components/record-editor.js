import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { SectionCard } from "@kalitedb/ui";
const READONLY_KEYS = new Set(["id", "period", "agentKey", "specialistKey"]);
export function RecordEditor(props) {
    const [draft, setDraft] = useState({});
    useEffect(() => {
        if (!props.record) {
            setDraft({});
            return;
        }
        const nextDraft = Object.entries(props.record).reduce((accumulator, [key, value]) => {
            if (!READONLY_KEYS.has(key)) {
                accumulator[key] = value === null || value === undefined ? "" : String(value);
            }
            return accumulator;
        }, {});
        setDraft(nextDraft);
    }, [props.record]);
    if (!props.record) {
        return (_jsx(SectionCard, { title: props.title, description: "Duzenleme icin tablodan bir kayit secin.", children: _jsx("p", { className: "text-sm text-slate-500", children: "Kayit secilmedi." }) }));
    }
    return (_jsx(SectionCard, { title: props.title, description: "Sayisal alanlar otomatik hesaplanan degerlerle yeniden dogrulanir.", children: _jsxs("form", { className: "grid gap-4 md:grid-cols-2", onSubmit: (event) => {
                event.preventDefault();
                const updates = Object.entries(draft).reduce((accumulator, [key, value]) => {
                    const originalValue = props.record?.[key];
                    if (typeof originalValue === "number" || originalValue === null) {
                        accumulator[key] = value.trim() === "" ? null : Number(value);
                    }
                    else {
                        accumulator[key] = value;
                    }
                    return accumulator;
                }, {});
                void props.onSave(updates);
            }, children: [Object.entries(draft).map(([key, value]) => (_jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-slate-700", children: [key, _jsx("input", { className: "rounded-2xl border border-slate-200 px-3 py-2", onChange: (event) => {
                                setDraft((current) => ({
                                    ...current,
                                    [key]: event.target.value
                                }));
                            }, value: value })] }, key))), _jsx("div", { className: "md:col-span-2", children: _jsx("button", { className: "rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white", type: "submit", children: "Kaydi guncelle" }) })] }) }));
}
