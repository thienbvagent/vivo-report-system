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
    const activeUrl = localVal !== null ? localVal : serverVal;
    setGoogleSheetUrl(activeUrl);
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
      alert('Lỗi: ' + err.message);
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

    // Chuẩn bị các cột dữ liệu theo đúng chuẩn bảng tính Google Sheet của bạn
    const exportItems = rows.map(r => {
      const isTgdd = r['Khách hàng'] === 'TGDĐ';
      const isBh = r['Xuất Bảo Hành'] === 1 || r['Xuất Bảo Hành'] === '1' ? 1 : '';
      const isSc = r['Xuất Sửa Chữa'] === 1 || r['Xuất Sửa Chữa'] === '1' ? 1 : '';

      const cash = !isTgdd && r['Doanh thu tiền mặt'] !== null && r['Doanh thu tiền mặt'] !== undefined 
        ? Math.round(Number(r['Doanh thu tiền mặt'])) 
        : '';
      const cashBeforeTax = !isTgdd && r['Doanh thu tiền mặt trước thuế'] !== null && r['Doanh thu tiền mặt trước thuế'] !== undefined 
        ? Math.round(Number(r['Doanh thu tiền mặt trước thuế'])) 
        : '';

      const debt = isTgdd 
        ? (r['Công nợ'] !== null && r['Công nợ'] !== undefined ? Math.round(Number(r['Công nợ'])) : 0) 
        : '';
      const debtAfterDiscount = isTgdd 
        ? (r['CN sau chiết khấu'] !== null && r['CN sau chiết khấu'] !== undefined ? Math.round(Number(r['CN sau chiết khấu'])) : 0) 
        : '';
      const debtBeforeTax = isTgdd 
        ? (r['CN trước thuế'] !== null && r['CN trước thuế'] !== undefined ? Math.round(Number(r['CN trước thuế'])) : 0) 
        : '';

      return {
        'Ngày': r['Ngày báo cáo'] || selectedDate || new Date().toISOString().slice(0, 10),
        'Số phiếu sửa chữa': r['Số phiếu sửa chữa'] || '',
        'Mã vật tư linh kiện': r['Mã vật tư linh kiện'] || '',
        'Tên vật tư': r['Tên vật tư'] || '',
        'Xuất Bảo Hành': isBh,
        'Xuất Sửa Chữa': isSc,
        'Đơn giá': (r['Đơn giá'] !== null && r['Đơn giá'] !== undefined) ? Math.round(Number(r['Đơn giá'])) : '',
        'Doanh thu tiền mặt': cash,
        'Doanh thu tiền mặt trước thuế': cashBeforeTax,
        'Công nợ': debt,
        'CN sau chiết khấu': debtAfterDiscount,
        'CN trước thuế': debtBeforeTax,
        'Khách hàng': r['Khách hàng'] || '',
        'Phương thức thanh toán': r['Phương thức thanh toán'] || '',
        'TTBH': user?.centerCode || 'R4001003'
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
      setExportNotice({
        type: 'error',
        message: 'Lỗi mạng khi gọi export: ' + err.message
      });
    } finally {
      setExporting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar user={user} />

      <main className="flex-1 w-full max-w-[99%] xl:max-w-[98%] 2xl:max-w-[97%] mx-auto px-2 sm:px-4 py-5">
        {/* Header toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Bảng Điều Khiển Báo Cáo
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Trung tâm: <strong>{user.centerName}</strong> ({user.centerCode})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filter Date */}
            <div className="flex items-center space-x-2 bg-white px-3 py-2 rounded-xl shadow-sm border border-slate-200 text-sm">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600 font-medium">Ngày báo cáo:</span>
              <select
                value={selectedDate}
                onChange={e => handleDateChange(e.target.value)}
                className="bg-transparent font-semibold text-blue-600 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Tất cả các ngày ({totalAllRows} dòng)</option>
                {availableDates.map(d => (
                  <option key={d} value={d}>
                    {d} ({dateCounts[d] || 0} dòng)
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh */}
            <button
              onClick={() => fetchReportData(selectedDate)}
              className="p-2.5 bg-white text-slate-600 hover:text-blue-600 border border-slate-200 rounded-xl shadow-sm transition"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Clear / Reset Data */}
            <button
              onClick={handleClearData}
              className="flex items-center space-x-1.5 p-2 bg-white text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-xl shadow-sm transition text-xs font-semibold"
              title="Xóa toàn bộ dữ liệu báo cáo cũ của trung tâm này để nạp lại từ đầu"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Làm Sạch Dữ Liệu</span>
            </button>

            {/* Export Google Sheets Button */}
            <button
              onClick={handleExportGoogleSheets}
              disabled={exporting || rows.length === 0 || selectedDate === 'ALL'}
              className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold shadow-md transition text-sm"
              title="Xuất dữ liệu ngày đang chọn sang Google Sheets qua n8n"
            >
              <Download className="w-4 h-4" />
              <span>{exporting ? 'Đang xuất...' : 'Xuất Google Sheets'}</span>
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
              className={`flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold shadow-md transition text-sm ${rows.length === 0 || selectedDate === 'ALL' ? 'opacity-50 pointer-events-none' : ''}`}
              title="Xuất file Báo cáo Công Nợ Tận Tâm chuẩn màu xanh/xanh dương, công thức =SUBTOTAL, =SUM và mã Jobcard"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Báo Cáo Công Nợ Tận Tâm (.xlsx)</span>
            </a>

            {/* Download Full Excel File Button */}
            <a
              href={`/api/export?date=${encodeURIComponent(selectedDate)}&type=full`}
              className={`flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold shadow-md transition text-sm ${rows.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
              title="Tải trực tiếp file Excel (.xlsx) đầy đủ tất cả các cột thông tin hiển thị trên bảng"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Tải Báo Cáo Đầy Đủ (.xlsx)</span>
            </a>
          </div>
        </div>


        {/* Google Sheets Link Bar */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2 w-full md:w-auto flex-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
              <Link2 className="w-4 h-4" />
            </div>
            <div className="flex-1 relative">
              <input
                type="url"
                placeholder="Dán link Google Sheet tại đây (https://docs.google.com/spreadsheets/d/.../edit)..."
                value={googleSheetUrl}
                onChange={e => handleSheetUrlChange(e.target.value)}
                className="w-full text-xs sm:text-sm px-3 py-1.5 pr-8 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-700 placeholder:font-sans"
              />
              {googleSheetUrl.trim() && (
                <button
                  type="button"
                  onClick={handleClearSheetUrl}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-600 p-0.5 rounded transition"
                  title="Xóa link Google Sheet của trung tâm này"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          {googleSheetUrl.trim() && (
            <div className="flex items-center space-x-2 text-xs text-emerald-700 font-medium bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 flex-shrink-0 w-full md:w-auto justify-between md:justify-start">
              <span>Đã kết nối Sheet ID: <strong className="font-mono">{extractSheetId(googleSheetUrl).slice(0, 15)}...</strong></span>
              <a 
                href={googleSheetUrl.startsWith('http') ? googleSheetUrl : `https://${googleSheetUrl}`} 
                target="_blank" 
                rel="noreferrer"
                className="text-emerald-600 hover:text-emerald-800 inline-flex items-center ml-1"
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
