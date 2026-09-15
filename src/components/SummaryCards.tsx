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
    <div className="space-y-4 mb-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* 1. Tổng dòng */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase">Tổng LK</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">
            {summary.totalRows.toLocaleString('vi-VN')}
          </div>
          <div className="text-xs text-slate-400 mt-1">Linh kiện đã xử lý</div>
        </div>

        {/* 2. Tổng Đơn Giá */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase">Tổng Đơn Giá</span>
            <DollarSign className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-lg font-bold text-indigo-700 truncate" title={formatCurrency(summary.totalUnitPrice)}>
            {formatCurrency(summary.totalUnitPrice)}
          </div>
          <div className="text-xs text-slate-400 mt-1">Doanh thu gộp</div>
        </div>

        {/* 3. Tiền Mặt (TM) */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-emerald-200 bg-emerald-50/20">
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-xs font-semibold uppercase">Tiền Mặt (TM)</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg font-extrabold text-emerald-600 truncate" title={formatCurrency(summary.totalCash)}>
            {formatCurrency(summary.totalCash)}
          </div>
          <div className="text-xs text-emerald-700 mt-1">Khách lẻ ({summary.countKl} dòng)</div>
        </div>

        {/* 4. Công Nợ (CN) */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-amber-200 bg-amber-50/20">
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-xs font-semibold uppercase">Công Nợ (CN)</span>
            <CreditCard className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-lg font-extrabold text-amber-600 truncate" title={formatCurrency(summary.totalDebt)}>
            {formatCurrency(summary.totalDebt)}
          </div>
          <div className="text-xs text-amber-700 mt-1">TGDĐ ({summary.countTgdd} dòng)</div>
        </div>

        {/* 5. Xuất Bảo Hành */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-teal-200 bg-teal-50/20">
          <div className="flex items-center justify-between text-teal-700 mb-1">
            <span className="text-xs font-semibold uppercase">Xuất Bảo Hành</span>
            <ShieldCheck className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-extrabold text-teal-700">
            {(summary.totalWarrantyExport ?? 0).toLocaleString('vi-VN')}
          </div>
          <div className="text-xs text-teal-700 mt-1">Công nợ = 0</div>
        </div>

        {/* 6. Xuất Sửa Chữa */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-purple-200 bg-purple-50/20">
          <div className="flex items-center justify-between text-purple-700 mb-1">
            <span className="text-xs font-semibold uppercase">Xuất Sửa Chữa</span>
            <Wrench className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-extrabold text-purple-700">
            {(summary.totalRepairExport ?? 0).toLocaleString('vi-VN')}
          </div>
          <div className="text-xs text-purple-700 mt-1">Công nợ &gt; 0</div>
        </div>
      </div>
    </div>
  );
}
