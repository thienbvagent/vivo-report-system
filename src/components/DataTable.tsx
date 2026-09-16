'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter } from 'lucide-react';
import { ProcessedReportItem } from '@/lib/business-rules';

interface DataTableProps {
  rows: ProcessedReportItem[];
}

export default function DataTable({ rows }: DataTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCustomer, setFilterCustomer] = useState<'ALL' | 'KL' | 'TGDĐ' | 'INSURANCE'>('ALL');
  const [filterPayment, setFilterPayment] = useState<'ALL' | 'TM' | 'CN'>('ALL');
  const [filterExportType, setFilterExportType] = useState<'ALL' | 'BH' | 'PK' | 'SC'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      // Search
      const search = searchTerm.toLowerCase();
      const matchPhieu = r['Số phiếu sửa chữa'].toLowerCase().includes(search);
      const matchMaLk = r['Mã vật tư linh kiện'].toLowerCase().includes(search);
      const matchTenLk = r['Tên vật tư'].toLowerCase().includes(search);
      const matchLoaiHinh = (r['Loại hình đem đến sửa'] || '').toLowerCase().includes(search);
      if (search && !matchPhieu && !matchMaLk && !matchTenLk && !matchLoaiHinh) return false;

      // Customer filter
      if (filterCustomer === 'INSURANCE') {
        const isIns = (r['Loại hình đem đến sửa'] || '').toLowerCase().includes('bảo hiểm');
        if (!isIns) return false;
      } else if (filterCustomer !== 'ALL' && r['Khách hàng'] !== filterCustomer) {
        return false;
      }

      // Payment filter
      if (filterPayment !== 'ALL' && r['Phương thức thanh toán'] !== filterPayment) return false;

      // Export type filter
      if (filterExportType === 'BH' && r['Xuất Bảo Hành'] !== 1 && r['Xuất Bảo Hành'] !== '1') return false;
      if (filterExportType === 'PK' && r['Xuất phụ kiện'] !== 1 && r['Xuất phụ kiện'] !== '1') return false;
      if (filterExportType === 'SC' && r['Xuất Sửa Chữa'] !== 1 && r['Xuất Sửa Chữa'] !== '1') return false;

      return true;
    });
  }, [rows, searchTerm, filterCustomer, filterPayment, filterExportType]);

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage]);

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Math.round(val));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
      {/* Search & Filter Toolbar */}
      <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Tìm theo số phiếu, mã hoặc tên LK..."
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Customer Filter */}
          <select
            value={filterCustomer}
            onChange={e => {
              setFilterCustomer(e.target.value as any);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Tất cả Khách Hàng</option>
            <option value="KL">Khách Lẻ (KL)</option>
            <option value="TGDĐ">Thế Giới Di Động (TGDĐ)</option>
            <option value="INSURANCE">Công ty bảo hiểm ngoài</option>
          </select>

          {/* Payment Filter */}
          <select
            value={filterPayment}
            onChange={e => {
              setFilterPayment(e.target.value as any);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Tất cả PTTT</option>
            <option value="TM">Tiền Mặt (TM)</option>
            <option value="CN">Công Nợ (CN)</option>
          </select>

          {/* Export classification Filter */}
          <select
            value={filterExportType}
            onChange={e => {
              setFilterExportType(e.target.value as any);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Tất cả Loại Xuất</option>
            <option value="BH">Xuất Bảo Hành (=1)</option>
            <option value="PK">Xuất Phụ Kiện (=1)</option>
            <option value="SC">Xuất Sửa Chữa (=1)</option>
          </select>

          <span className="text-xs text-slate-500 ml-2">
            Hiển thị <strong>{filteredRows.length}</strong> / {rows.length} dòng
          </span>
        </div>
      </div>

      {/* Chú thích phía trên bảng */}
      <div className="px-4 py-2 bg-amber-50/80 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
        <div className="flex items-center gap-2">
          <span className="w-5 h-3 rounded bg-amber-200 border border-amber-400 flex-shrink-0 inline-block shadow-sm"></span>
          <span>
            <strong>Chú thích:</strong> Dòng được bôi vàng là máy của <strong>Công ty bảo hiểm bên ngoài đem đến sửa</strong>.
          </span>
        </div>
        {rows.some(r => (r['Loại hình đem đến sửa'] || '').toLowerCase().includes('bảo hiểm')) && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-200 text-amber-900 border border-amber-300">
            {rows.filter(r => (r['Loại hình đem đến sửa'] || '').toLowerCase().includes('bảo hiểm')).length} dòng bảo hiểm ngoài
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
              <th className="py-2.5 px-1.5 text-center w-8">STT</th>
              <th className="py-2.5 px-2 whitespace-nowrap">Số Phiếu Sửa Chữa</th>
              <th className="py-2.5 px-1.5 whitespace-nowrap">Mã LK</th>
              <th className="py-2.5 px-2 whitespace-nowrap">Tên Vật Tư LK</th>
              <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Xuất BH</th>
              <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Xuất PK</th>
              <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Xuất SC</th>
              <th className="py-2.5 px-2 text-right whitespace-nowrap">Đơn Giá</th>
              <th className="py-2.5 px-2 text-right whitespace-nowrap">Tiền Mặt</th>
              <th className="py-2.5 px-2 text-right whitespace-nowrap">TM Trước Thuế</th>
              <th className="py-2.5 px-2 text-right whitespace-nowrap">Công Nợ</th>
              <th className="py-2.5 px-2 text-right whitespace-nowrap">CN Sau CK</th>
              <th className="py-2.5 px-2 text-right whitespace-nowrap">CN Trước Thuế</th>
              <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Khách</th>
              <th className="py-2.5 px-1.5 text-center whitespace-nowrap">PTTT</th>
              <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Jobcard</th>
              <th className="py-2.5 px-2 whitespace-nowrap">Thời Gian Lấy Máy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={17} className="py-8 text-center text-slate-400">
                  Không tìm thấy dữ liệu phù hợp với bộ lọc.
                </td>
              </tr>
            ) : (
              paginatedRows.map((r, i) => {
                const isInsurance = String(r['Loại hình đem đến sửa'] || '').trim().toLowerCase().includes('bảo hiểm');
                return (
                  <tr 
                    key={i} 
                    className={`transition ${
                      isInsurance 
                        ? 'bg-amber-100/90 hover:bg-amber-200/80 border-b border-amber-300/80 text-slate-900 font-medium' 
                        : 'hover:bg-blue-50/40'
                    }`}
                  >
                    <td className="py-2 px-1 text-center text-slate-400 font-mono text-xs">
                      {(currentPage - 1) * pageSize + i + 1}
                    </td>
                    <td 
                      className={`py-2 px-2 font-mono whitespace-nowrap text-xs ${
                        isInsurance 
                          ? 'font-bold text-amber-950' 
                          : 'font-medium text-blue-700'
                      }`}
                      title={isInsurance ? 'Máy của Công ty bảo hiểm bên ngoài đem đến sửa' : undefined}
                    >
                      {r['Số phiếu sửa chữa']}
                    </td>
                    <td className="py-2 px-1.5 font-mono font-medium text-slate-800 whitespace-nowrap text-xs">
                      {r['Mã vật tư linh kiện'] || '-'}
                    </td>
                    <td className="py-2 px-2 text-slate-700 max-w-[130px] xl:max-w-[180px] 2xl:max-w-[240px] truncate text-xs" title={r['Tên vật tư']}>
                      {r['Tên vật tư'] || '-'}
                    </td>
                    <td className="py-2 px-1.5 text-center font-bold whitespace-nowrap">
                      {r['Xuất Bảo Hành'] === 1 || r['Xuất Bảo Hành'] === '1' ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-teal-100 text-teal-800">1</span>
                      ) : null}
                    </td>
                    <td className="py-2 px-1.5 text-center font-bold whitespace-nowrap">
                      {r['Xuất phụ kiện'] === 1 || r['Xuất phụ kiện'] === '1' ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-indigo-100 text-indigo-800">1</span>
                      ) : null}
                    </td>
                    <td className="py-2 px-1.5 text-center font-bold whitespace-nowrap">
                      {r['Xuất Sửa Chữa'] === 1 || r['Xuất Sửa Chữa'] === '1' ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-purple-100 text-purple-800">1</span>
                      ) : null}
                    </td>
                    <td className="py-2 px-2 text-right font-medium text-slate-900 whitespace-nowrap text-xs">
                      {formatCurrency(r['Đơn giá'])}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold text-emerald-600 whitespace-nowrap text-xs">
                      {r['Khách hàng'] === 'KL'
                        ? (r['Doanh thu tiền mặt'] !== null && r['Doanh thu tiền mặt'] !== undefined ? formatCurrency(r['Doanh thu tiền mặt']) : '0')
                        : '-'}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-emerald-700/90 whitespace-nowrap text-xs">
                      {r['Khách hàng'] === 'KL'
                        ? (r['Doanh thu tiền mặt trước thuế'] !== null && r['Doanh thu tiền mặt trước thuế'] !== undefined ? formatCurrency(r['Doanh thu tiền mặt trước thuế']) : '0')
                        : '-'}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold text-amber-600 whitespace-nowrap text-xs">
                      {r['Khách hàng'] === 'TGDĐ'
                        ? (r['Công nợ'] !== null && r['Công nợ'] !== undefined ? formatCurrency(r['Công nợ']) : '0')
                        : '-'}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-amber-700/90 whitespace-nowrap text-xs">
                      {r['Khách hàng'] === 'TGDĐ'
                        ? (r['CN sau chiết khấu'] !== null && r['CN sau chiết khấu'] !== undefined ? formatCurrency(r['CN sau chiết khấu']) : '0')
                        : '-'}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-amber-700/90 whitespace-nowrap text-xs">
                      {r['Khách hàng'] === 'TGDĐ'
                        ? (r['CN trước thuế'] !== null && r['CN trước thuế'] !== undefined ? formatCurrency(r['CN trước thuế']) : '0')
                        : '-'}
                    </td>
                    <td className="py-2 px-1.5 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                          r['Khách hàng'] === 'TGDĐ'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-blue-100 text-blue-800 border border-blue-300'
                        }`}
                      >
                        {r['Khách hàng']}
                      </span>
                    </td>
                    <td className="py-2 px-1.5 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${
                          r['Phương thức thanh toán'] === 'CN'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {r['Phương thức thanh toán']}
                      </span>
                    </td>
                    <td className="py-2 px-1.5 text-center font-mono text-xs whitespace-nowrap">
                      {r['Jobcard'] ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-sm" title={`Mã Jobcard: ${r['Jobcard']}`}>
                          {r['Jobcard']}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-slate-500 font-mono text-xs whitespace-nowrap">
                      {r['Thời gian lấy máy']}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs sm:text-sm">
        <div className="text-slate-500">
          Trang <strong>{currentPage}</strong> / {totalPages}
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Trước
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Sau
          </button>
        </div>
      </div>
    </div>
  );
}
