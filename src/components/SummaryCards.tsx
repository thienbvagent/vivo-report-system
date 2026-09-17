import React from 'react';
import { Layers, DollarSign, Wallet, CreditCard, ShieldCheck, Wrench } from 'lucide-react';

export interface SummaryData {
  totalRows: number;
  totalUnitPrice: number;
  totalCash: number;
  totalDebt: number;
  countKl: number;
  countTgdd: number;
  totalWarrantyExport?: number;
  totalRepairExport?: number;
}

interface SummaryCardsProps {
  summary: SummaryData;
  reportDate?: string;
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  return (
    <div className="space-y-4 mb-4 sm:mb-6">
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3.5">
        {/* 1. Tổng dòng */}
        <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-tight">Tổng LK</span>
            <div className="p-1 rounded-md bg-blue-50 text-blue-500 flex-shrink-0">
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 my-0.5">
            {summary.totalRows.toLocaleString('vi-VN')}
          </div>
          <div className="text-[11px] text-slate-400">Linh kiện đã xử lý</div>
        </div>

        {/* 2. Tổng Đơn Giá */}
        <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-tight">Tổng Đơn Giá</span>
            <div className="p-1 rounded-md bg-indigo-50 text-indigo-500 flex-shrink-0">
              <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-sm sm:text-base xl:text-lg font-black text-indigo-700 truncate my-0.5" title={formatCurrency(summary.totalUnitPrice)}>
            {formatCurrency(summary.totalUnitPrice)}
          </div>
          <div className="text-[11px] text-slate-400">Doanh thu gộp</div>
        </div>

        {/* 3. Tiền Mặt (TM) */}
        <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-emerald-200 bg-emerald-50/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-tight">Tiền Mặt (TM)</span>
            <div className="p-1 rounded-md bg-emerald-100 text-emerald-600 flex-shrink-0">
              <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-sm sm:text-base xl:text-lg font-black text-emerald-600 truncate my-0.5" title={formatCurrency(summary.totalCash)}>
            {formatCurrency(summary.totalCash)}
          </div>
          <div className="text-[11px] text-emerald-700">Khách lẻ ({summary.countKl} dòng)</div>
        </div>

        {/* 4. Công Nợ (CN) */}
        <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-amber-200 bg-amber-50/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-tight">Công Nợ (CN)</span>
            <div className="p-1 rounded-md bg-amber-100 text-amber-600 flex-shrink-0">
              <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-sm sm:text-base xl:text-lg font-black text-amber-600 truncate my-0.5" title={formatCurrency(summary.totalDebt)}>
            {formatCurrency(summary.totalDebt)}
          </div>
          <div className="text-[11px] text-amber-700">TGDĐ ({summary.countTgdd} dòng)</div>
        </div>

        {/* 5. Xuất Bảo Hành */}
        <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-teal-200 bg-teal-50/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-teal-700 mb-1">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-tight">Xuất BH</span>
            <div className="p-1 rounded-md bg-teal-100 text-teal-600 flex-shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-teal-700 my-0.5">
            {(summary.totalWarrantyExport ?? 0).toLocaleString('vi-VN')}
          </div>
          <div className="text-[11px] text-teal-700">Công nợ = 0</div>
        </div>

        {/* 6. Xuất Sửa Chữa */}
        <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-purple-200 bg-purple-50/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-purple-700 mb-1">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-tight">Xuất SC</span>
            <div className="p-1 rounded-md bg-purple-100 text-purple-600 flex-shrink-0">
              <Wrench className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-700 my-0.5">
            {(summary.totalRepairExport ?? 0).toLocaleString('vi-VN')}
          </div>
          <div className="text-[11px] text-purple-700">Công nợ &gt; 0</div>
        </div>
      </div>
    </div>
  );
}
