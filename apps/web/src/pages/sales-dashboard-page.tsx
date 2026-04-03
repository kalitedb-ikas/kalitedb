import { PageHeader, SurfaceCard } from "@kalitedb/ui";
import { BarChart3 } from "lucide-react";

export function SalesDashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Satış Genel Bakış" />
      <SurfaceCard title="Yakında" variant="default">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-[18px] border border-slate-200 bg-slate-50 text-slate-400">
            <BarChart3 size={24} strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-semibold text-slate-900">Satış genel bakış paneli geliştiriliyor</p>
            <p className="mt-1 text-sm text-slate-500">
              Satış metriklerini görüntülemek için sol menüden Audit sayfasını kullanabilirsiniz.
            </p>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}
