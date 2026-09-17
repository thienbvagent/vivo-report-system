'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import SummaryCards, { SummaryData } from '@/components/SummaryCards';
import DataTable from '@/components/DataTable';
import { Calendar, Download, RefreshCw, AlertCircle, CheckCircle2, Link2, ExternalLink, Trash2, FileSpreadsheet, X } from 'lucide-react';
import { ProcessedReportItem } from '@/lib/business-rules';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ centerCode: string; centerName: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [dateCounts, setDateCounts] = useState<Record<string, number>>({});
  const [totalAllRows, setTotalAllRows] = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState<string>('ALL');
  const [rows, setRows] = useState<ProcessedReportItem[]>([]);
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [summary, setSummary] = useState<SummaryData>({
    totalRows: 0,
    totalUnitPrice: 0,
    totalCash: 0,
    totalDebt: 0,
    countKl: 0,
    countTgdd: 0,
    totalWarrantyExport: 0,
    totalRepairExport: 0
  });

  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Lưu và tải Link Google Sheet riêng cho từng TTBH
  useEffect(() => {
    if (!user?.centerCode) return;
    try {
      // Dọn dẹp key dùng chung cũ nếu có
      localStorage.removeItem('vivo_google_sheet_url');
    } catch {}

    const key = `vivo_google_sheet_url_${user.centerCode}`;
    const localVal = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    const serverVal = (user as any).googleSheetUrl || '';
    const activeUrl = serverVal || localVal || '';
    setGoogleSheetUrl(activeUrl);

    // Nếu localStorage có nhưng server DB chưa lưu -> lập tức đồng bộ lên server
    if (localVal && !serverVal) {
      fetch('/api/settings/sheet-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl: localVal })
      }).catch(() => {});
    }
  }, [user]);

  const handleSheetUrlChange = (val: string) => {
    setGoogleSheetUrl(val);
    if (user?.centerCode) {
      const key = `vivo_google_sheet_url_${user.centerCode}`;
      localStorage.setItem(key, val);
      fetch('/api/settings/sheet-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl: val })
      }).catch(() => {});
    }
  };

  const handleClearSheetUrl = () => {
    setGoogleSheetUrl('');
    if (user?.centerCode) {
      const key = `vivo_google_sheet_url_${user.centerCode}`;
      localStorage.removeItem(key);
      fetch('/api/settings/sheet-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl: '' })
      }).catch(() => {});
    }
  };

  const extractSheetId = (url: string) => {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : url.trim();
  };

  // 1. Kiểm tra session
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        if (!res.ok) throw new Error('Not logged in');
        return res.json();
      })
      .then(data => {
        if (data.authenticated) {
          setUser(data.user);
        } else {
          router.push('/login');
        }
      })
      .catch(() => router.push('/login'));
  }, [router]);

  // 2. Tải dữ liệu báo cáo
  const fetchReportData = (date: string) => {
    setLoading(true);
    fetch(`/api/reports?date=${encodeURIComponent(date)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setAvailableDates(data.availableDates || []);
          setDateCounts(data.dateCounts || {});
          setTotalAllRows(data.totalAllRows || 0);
          setSelectedDate(data.selectedDate || 'ALL');
          setRows(data.rows || []);
          setSummary(data.summary || {
            totalRows: 0,
            totalUnitPrice: 0,
            totalCash: 0,
            totalDebt: 0,
            countKl: 0,
            countTgdd: 0,
            totalWarrantyExport: 0,
            totalRepairExport: 0
          });
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user) {
      fetchReportData(selectedDate);
    }
  }, [user]);

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    fetchReportData(newDate);
  };

  const handleClearData = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa toàn bộ dữ liệu báo cáo cũ của trung tâm ${user?.centerName}? Thao tác này giúp bạn làm sạch dữ liệu để tải lên file mới từ đầu.`)) {
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/reports', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Đã làm mới dữ liệu thành công.');
        fetchReportData('ALL');
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (err: any) {
      console.error('[Reset center data error]:', err);
      alert('Lỗi kết nối mạng khi làm mới dữ liệu. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportGoogleSheets = async () => {
    if (selectedDate === 'ALL') {
      alert('Vui lòng chọn một ngày cụ thể (ví dụ: 2026-09-14) để xuất sang Google Sheets!');
      return;
    }

    if (!googleSheetUrl.trim()) {
      alert('Vui lòng dán Link Google Sheet vào ô nhập bên dưới trước khi bấm xuất!');
      return;
    }

    setExporting(true);
    setExportNotice(null);

    // Luôn đảm bảo server đã lưu cấu hình Google Sheet mới nhất của TTBH
    try {
      await fetch('/api/settings/sheet-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl: googleSheetUrl.trim() })
      });
    } catch {}

    // Hàm định dạng số tiền có dấu phẩy ngăn cách hàng nghìn (ví dụ: 1,342,000)
    const formatMoneyComma = (val: any): string => {
      if (val === null || val === undefined || val === '') return '';
      const num = typeof val === 'number' ? Math.round(val) : Math.round(Number(String(val).replace(/,/g, '')));
      return isNaN(num) ? '' : new Intl.NumberFormat('en-US').format(num);
    };

    // Chuẩn bị các cột dữ liệu theo đúng chuẩn bảng tính Google Sheet của bạn
    const exportItems = rows.map(r => {
      const isTgdd = r['Khách hàng'] === 'TGDĐ';
      const isBh = r['Xuất Bảo Hành'] === 1 || r['Xuất Bảo Hành'] === '1' ? 1 : '';
      const isSc = r['Xuất Sửa Chữa'] === 1 || r['Xuất Sửa Chữa'] === '1' ? 1 : '';

      const cash = !isTgdd && r['Doanh thu tiền mặt'] !== null && r['Doanh thu tiền mặt'] !== undefined 
        ? formatMoneyComma(r['Doanh thu tiền mặt']) 
        : (isTgdd ? '0' : '');
      const cashBeforeTax = !isTgdd && r['Doanh thu tiền mặt trước thuế'] !== null && r['Doanh thu tiền mặt trước thuế'] !== undefined 
        ? formatMoneyComma(r['Doanh thu tiền mặt trước thuế']) 
        : (isTgdd ? '0' : '');

      const debt = isTgdd 
        ? formatMoneyComma(r['Công nợ'] ?? 0) 
        : '0';
      const debtAfterDiscount = isTgdd 
        ? formatMoneyComma(r['CN sau chiết khấu'] ?? 0) 
        : '-';
      const debtBeforeTax = isTgdd 
        ? formatMoneyComma(r['CN trước thuế'] ?? 0) 
        : '-';

      return {
        'Ngày': r['Ngày báo cáo'] || selectedDate || new Date().toISOString().slice(0, 10),
        'Số phiếu sửa chữa': r['Số phiếu sửa chữa'] || '',
        'Mã vật tư linh kiện': r['Mã vật tư linh kiện'] || '',
        'Tên vật tư': r['Tên vật tư'] || '',
        'Xuất Bảo Hành': isBh,
        'Xuất Sửa Chữa': isSc,
        'Đơn giá': (r['Đơn giá'] !== null && r['Đơn giá'] !== undefined) ? formatMoneyComma(r['Đơn giá']) : '',
        'Doanh thu tiền mặt': cash,
        'Doanh thu tiền mặt trước thuế': cashBeforeTax,
        'Công nợ': debt,
        'CN sau chiết khấu': debtAfterDiscount,
        'CN trước thuế': debtBeforeTax,
        'Khách hàng': r['Khách hàng'] || '',
        'Phương thức thanh toán': r['Phương thức thanh toán'] || '',
        'Jobcard': r['Jobcard'] || '',
        'TTBH': user?.centerName || user?.centerCode || 'Trung tâm CSKH vivo Cần Thơ'
      };
    });

    // Tự động xác định tên tab theo Tháng-Năm (Ví dụ: "09-2026", qua tháng sau tự động là "10-2026")
    const dateParts = (selectedDate && selectedDate !== 'ALL') ? selectedDate.split('-') : [];
    const targetMonthYear = dateParts.length >= 2 
      ? `${dateParts[1]}-${dateParts[0]}`
      : `${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date().getFullYear()}`;

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          report_date: selectedDate,
          sheet_url: googleSheetUrl.trim(),
          spreadsheet_id: extractSheetId(googleSheetUrl),
          target_sheet: targetMonthYear,
          targetSheet: targetMonthYear,
          items: exportItems
        })
      });

      const data = await res.json();
      if (data.success) {
        setExportNotice({
          type: 'success',
          message: data.message || `Đã gửi thành công ${exportItems.length} dòng sang Google Sheets (Tab: ${targetMonthYear})!`
        });
      } else {
        setExportNotice({
          type: 'error',
          message: data.error || 'Xuất thất bại. Vui lòng kiểm tra quyền chia sẻ bảng tính trên Google Sheets.'
        });
      }
    } catch (err: any) {
      console.error('[Export Google Sheets network error]:', err);
      setExportNotice({
        type: 'error',
        message: 'Lỗi kết nối mạng khi xuất sang Google Sheets. Vui lòng thử lại sau.'
      });
    } finally {
      setExporting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar user={user} />

      <main className="flex-1 w-full max-w-[99%] xl:max-w-[98%] 2xl:max-w-[97%] mx-auto px-2.5 sm:px-4 md:px-5 py-4 sm:py-6">
        {/* Header Title & Center Info */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Bảng Điều Khiển Báo Cáo
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Trung tâm: <strong className="text-slate-800">{user.centerName}</strong> ({user.centerCode})
            </p>
          </div>
        </div>

        {/* Control Card Tier 1: Filter Date & Utilities */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm mb-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Filter Date */}
          <div className="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-xs sm:text-sm w-full sm:w-auto">
            <Calendar className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <span className="text-slate-600 font-medium whitespace-nowrap">Ngày báo cáo:</span>
            <select
              value={selectedDate}
              onChange={e => handleDateChange(e.target.value)}
              className="bg-transparent font-bold text-blue-600 focus:outline-none cursor-pointer w-full sm:w-auto truncate"
            >
              <option value="ALL">Tất cả các ngày ({totalAllRows} dòng)</option>
              {availableDates.map(d => (
                <option key={d} value={d}>
                  {d} ({dateCounts[d] || 0} dòng)
                </option>
              ))}
            </select>
          </div>

          {/* Refresh & Reset Buttons */}
          <div className="flex items-center space-x-2 justify-end">
            <button
              onClick={() => fetchReportData(selectedDate)}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-blue-600 border border-slate-200 rounded-lg shadow-sm transition min-h-[40px] flex items-center justify-center"
              title="Làm mới dữ liệu"
              aria-label="Làm mới dữ liệu"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleClearData}
              className="flex items-center space-x-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg shadow-sm transition text-xs font-semibold min-h-[40px]"
              title="Xóa toàn bộ dữ liệu báo cáo cũ của trung tâm này để nạp lại từ đầu"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Làm Sạch Dữ Liệu</span>
            </button>
          </div>
        </div>

        {/* Control Card Tier 2: Responsive Export Action Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-4">
          {/* Export Google Sheets Button */}
          <button
            onClick={handleExportGoogleSheets}
            disabled={exporting || rows.length === 0 || selectedDate === 'ALL'}
            className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold shadow-sm transition text-xs sm:text-sm min-h-[44px]"
            title="Xuất dữ liệu ngày đang chọn sang Google Sheets qua n8n"
          >
            <Download className="w-4 h-4 flex-shrink-0" />
            <span>{exporting ? 'Đang xuất sang Sheets...' : 'Xuất Google Sheets'}</span>
          </button>

          {/* Download Tan Tam Debt Report Button */}
          <a
            href={selectedDate !== 'ALL' ? `/api/export?date=${encodeURIComponent(selectedDate)}&type=tantam` : '#'}
            onClick={e => {
              if (selectedDate === 'ALL') {
                e.preventDefault();
                alert('Vui lòng chọn một ngày cụ thể (ví dụ: 2026-09-15) trên ô Ngày báo cáo để xuất Báo cáo Công Nợ Tận Tâm!');
              }
            }}
            className={`flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold shadow-sm transition text-xs sm:text-sm min-h-[44px] ${rows.length === 0 || selectedDate === 'ALL' ? 'opacity-50 pointer-events-none' : ''}`}
            title="Xuất file Báo cáo Công Nợ Tận Tâm chuẩn màu xanh/xanh dương, công thức =SUBTOTAL, =SUM và mã Jobcard"
          >
            <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">Báo Cáo Công Nợ Tận Tâm (.xlsx)</span>
          </a>

          {/* Download Full Excel File Button */}
          <a
            href={`/api/export?date=${encodeURIComponent(selectedDate)}&type=full`}
            className={`flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold shadow-sm transition text-xs sm:text-sm min-h-[44px] sm:col-span-2 lg:col-span-1 ${rows.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
            title="Tải trực tiếp file Excel (.xlsx) đầy đủ tất cả các cột thông tin hiển thị trên bảng"
          >
            <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
            <span>Tải Báo Cáo Đầy Đủ (.xlsx)</span>
          </a>
        </div>


        {/* Google Sheets Link Bar */}
        <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-sm mb-4 sm:mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2 w-full flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
              <Link2 className="w-4 h-4" />
            </div>
            <div className="flex-1 relative min-w-0">
              <input
                type="url"
                placeholder="Dán link Google Sheet tại đây (https://docs.google.com/spreadsheets/d/.../edit)..."
                value={googleSheetUrl}
                onChange={e => handleSheetUrlChange(e.target.value)}
                className="w-full text-xs sm:text-sm px-3 py-2 sm:py-1.5 pr-8 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-700 placeholder:font-sans min-h-[38px]"
              />
              {googleSheetUrl.trim() && (
                <button
                  type="button"
                  onClick={handleClearSheetUrl}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-600 p-1 rounded transition"
                  title="Xóa link Google Sheet của trung tâm này"
                  aria-label="Xóa link Google Sheet"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          {googleSheetUrl.trim() && (
            <div className="flex items-center space-x-2 text-xs text-emerald-700 font-medium bg-emerald-50 px-3 py-2 sm:py-1.5 rounded-lg border border-emerald-200 flex-shrink-0 justify-between sm:justify-start">
              <span>Đã kết nối Sheet ID: <strong className="font-mono">{extractSheetId(googleSheetUrl).slice(0, 15)}...</strong></span>
              <a 
                href={googleSheetUrl.startsWith('http') ? googleSheetUrl : `https://${googleSheetUrl}`} 
                target="_blank" 
                rel="noreferrer"
                className="text-emerald-600 hover:text-emerald-800 p-1 inline-flex items-center"
                title="Mở Google Sheet"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* Export Notification */}
        {exportNotice && (
          <div
            className={`p-4 mb-6 rounded-xl border flex items-center space-x-3 text-sm ${
              exportNotice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {exportNotice.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
            )}
            <span>{exportNotice.message}</span>
          </div>
        )}

        {/* Summary Cards */}
        <SummaryCards summary={summary} reportDate={selectedDate} />

        {/* Data Table */}
        <DataTable rows={rows} />
      </main>
    </div>
  );
}
