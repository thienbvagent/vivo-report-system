'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  History,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  ListChecks,
  Trash2,
  RotateCcw
} from 'lucide-react';

interface UploadRecordItem {
  uploadId: string;
  centerCode: string;
  fileName: string;
  fileHash: string;
  uploadTime: string;
  inputRows: number;
  validRows: number;
  warningRows: number;
  status: 'SUCCESS' | 'LOCAL_ONLY' | 'FAILED' | string;
  errorMessage?: string;
}

export default function UploadsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ centerCode: string; centerName: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'portal' | 'history'>('upload');

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'upsert' | 'replace'>('upsert');
  const [result, setResult] = useState<any | null>(null);

  // Portal Jobcard upload state
  const [portalFile, setPortalFile] = useState<File | null>(null);
  const [portalUploading, setPortalUploading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [portalResult, setPortalResult] = useState<{
    totalParsed: number;
    totalSaved: number;
    updatedReportsCount: number;
    matchedTickets: string[];
    message: string;
  } | null>(null);
  const [portalStats, setPortalStats] = useState<{ totalCount: number; matchedCount: number } | null>(null);
  const [portalResetting, setPortalResetting] = useState(false);
  const [portalSuccessMsg, setPortalSuccessMsg] = useState<string | null>(null);

  // Warnings inspection state
  const [showWarningsTable, setShowWarningsTable] = useState(true);
  const [warningFilter, setWarningFilter] = useState<'ALL' | 'PICKUP' | 'PRICE' | 'PART'>('ALL');
  const [warningSearch, setWarningSearch] = useState('');

  // History state
  const [historyList, setHistoryList] = useState<UploadRecordItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);

  const fetchUser = () => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setUser(data.user);
        } else {
          router.push('/login');
        }
      })
      .catch(() => router.push('/login'));
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/uploads');
      const data = await res.json();
      if (data.success && Array.isArray(data.uploads)) {
        setHistoryList(data.uploads);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const handleRetry = async (uploadId?: string) => {
    if (uploadId) setRetryingId(uploadId);
    else setRetryingAll(true);
    setHistoryNotice(null);

    try {
      const res = await fetch('/api/sync-retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setHistoryNotice(`Đã đồng bộ lại thành công ${data.syncedCount || 1} bản ghi sang Google Sheets.`);
        await fetchHistory();
      } else {
        setHistoryNotice(`Lỗi đồng bộ lại: ${data.error || 'Vui lòng kiểm tra lại kết nối n8n/Google Sheets.'}`);
        await fetchHistory();
      }
    } catch (err: any) {
      console.error('[Sync retry network error]:', err);
      setHistoryNotice('Lỗi kết nối khi đồng bộ lại. Vui lòng kiểm tra lại kết nối mạng.');
    } finally {
      setRetryingId(null);
      setRetryingAll(false);
    }
  };

  const fetchPortalStats = async () => {
    try {
      const res = await fetch('/api/uploads/portal');
      const data = await res.json();
      if (data.success && data.stats) {
        setPortalStats(data.stats);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchUser();
    fetchHistory();
    fetchPortalStats();
  }, [router]);

  const handlePortalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPortalFile(e.target.files[0]);
      setPortalError(null);
      setPortalResult(null);
      setPortalSuccessMsg(null);
    }
  };

  const handleResetPortal = async () => {
    if (!portalStats || portalStats.totalCount === 0) return;

    const confirmReset = window.confirm(
      `Bạn có chắc chắn muốn xóa toàn bộ ${portalStats.totalCount} mã Jobcard đã nạp?\n\n` +
      `Thao tác này sẽ xóa sạch dữ liệu Jobcard Portal và làm sạch cột Jobcard trong các phiếu sửa chữa đã khớp (${portalStats.matchedCount} phiếu), để bạn có thể nạp lại file mới.`
    );
    if (!confirmReset) return;

    setPortalResetting(true);
    setPortalError(null);
    setPortalSuccessMsg(null);

    try {
      const res = await fetch('/api/uploads/portal', {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPortalError(data.error || 'Xóa dữ liệu Portal Jobcard thất bại.');
      } else {
        setPortalResult(null);
        setPortalFile(null);
        const fileInput = document.getElementById('portal-file-input') as HTMLInputElement | null;
        if (fileInput) fileInput.value = '';

        setPortalSuccessMsg(data.message || 'Đã làm sạch dữ liệu Jobcard thành công! Bạn có thể nạp lại file mới.');
        setPortalStats(data.stats || { totalCount: 0, matchedCount: 0 });
      }
    } catch (err: any) {
      console.error('[Portal reset network error]:', err);
      setPortalError('Lỗi kết nối khi làm sạch dữ liệu. Vui lòng kiểm tra lại kết nối mạng.');
    } finally {
      setPortalResetting(false);
    }
  };

  const handlePortalUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalFile) return;

    setPortalUploading(true);
    setPortalError(null);
    setPortalResult(null);
    setPortalSuccessMsg(null);

    const formData = new FormData();
    formData.append('file', portalFile);

    try {
      const res = await fetch('/api/uploads/portal', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPortalError(data.error || 'Nạp file Portal Jobcard thất bại.');
      } else {
        setPortalResult({
          totalParsed: data.totalParsed,
          totalSaved: data.totalSaved,
          updatedReportsCount: data.updatedReportsCount,
          matchedTickets: data.matchedTickets || [],
          message: data.message
        });
        fetchPortalStats();
      }
    } catch (err: any) {
      console.error('[Portal upload network error]:', err);
      setPortalError('Lỗi kết nối mạng khi nạp file Portal. Vui lòng kiểm tra lại kết nối internet.');
    } finally {
      setPortalUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setResult(null);
    }
  };

  const getStoredSheetUrl = () => {
    if (typeof window === 'undefined' || !user?.centerCode) return '';
    try {
      localStorage.removeItem('vivo_google_sheet_url');
    } catch {}
    const key = `vivo_google_sheet_url_${user.centerCode}`;
    return (localStorage.getItem(key) || (user as any).googleSheetUrl || '').trim();
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', uploadMode);
    const sheetUrl = getStoredSheetUrl();
    if (sheetUrl) {
      formData.append('sheet_url', sheetUrl);
      formData.append('sheetUrl', sheetUrl);
    }

    try {
      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Xử lý file thất bại.');
        setUploading(false);
        return;
      }

      setResult(data);
      setUploading(false);
      fetchHistory();
    } catch (err: any) {
      console.error('[Upload file network error]:', err);
      setError('Lỗi kết nối mạng khi tải file. Vui lòng kiểm tra lại kết nối internet.');
      setUploading(false);
    }
  };

  if (!user) return null;

  const rawWarnings: string[] = result?.warnings || [];
  const parsedWarnings = rawWarnings.map((w, idx) => {
    let type: 'PICKUP' | 'PRICE' | 'PART' | 'OTHER' = 'OTHER';
    let suggestion = 'Kiểm tra lại dữ liệu trong file gốc.';

    if (w.includes('MISSING_PICKUP_TIME')) {
      type = 'PICKUP';
      suggestion = 'Bổ sung ngày giờ vào cột "Thời gian lấy máy" trong file DMS/CRM.';
    } else if (w.includes('INVALID_PICKUP_TIME')) {
      type = 'PICKUP';
      suggestion = 'Định dạng ngày không hợp lệ. Cần chuẩn định dạng: YYYY-MM-DD HH:mm:ss.';
    } else if (w.includes('MISSING_UNIT_PRICE')) {
      type = 'PRICE';
      suggestion = 'Kiểm tra cột "Giá bán lẻ đề nghị" hoặc "Số tiền phải thu" của phiếu.';
    } else if (w.includes('PART') || w.includes('linh kiện')) {
      type = 'PART';
      suggestion = 'Phiếu không có Mã linh kiện hoặc Tên linh kiện nên bị loại khỏi báo cáo.';
    }

    return { id: idx, text: w, type, suggestion };
  });

  const filteredWarnings = parsedWarnings.filter(item => {
    if (warningFilter !== 'ALL' && item.type !== warningFilter) return false;
    if (warningSearch.trim() && !item.text.toLowerCase().includes(warningSearch.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar user={user} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-2.5 sm:px-6 py-4 sm:py-6">
        {/* Navigation Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-b border-slate-200 mb-4 sm:mb-6 bg-white p-1.5 sm:p-2 rounded-xl shadow-sm">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center justify-center sm:justify-start space-x-2 px-3 sm:px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition min-h-[44px] ${
              activeTab === 'upload'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <UploadCloud className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">Báo Cáo Sửa Chữa (Vivo)</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('portal');
              fetchPortalStats();
            }}
            className={`flex items-center justify-center sm:justify-start space-x-2 px-3 sm:px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition relative min-h-[44px] ${
              activeTab === 'portal'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">Jobcard Portal TGDĐ</span>
            {portalStats && portalStats.totalCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ml-1 ${
                activeTab === 'portal' ? 'bg-indigo-800 text-white' : 'bg-indigo-100 text-indigo-800'
              }`}>
                {portalStats.totalCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('history');
              fetchHistory();
            }}
            className={`flex items-center justify-center sm:justify-start space-x-2 px-3 sm:px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition relative min-h-[44px] ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <History className="w-4 h-4 flex-shrink-0" />
            <span>Lịch Sử Tải Lên</span>
          </button>
        </div>

        {/* TAB 1: UPLOAD & ANALYSIS */}
        {activeTab === 'upload' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-slate-200 bg-slate-50">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 flex items-center space-x-2">
                  <UploadCloud className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
                  <span>Tải Lên Báo Cáo Sửa Chữa Chi Tiết (.xlsx)</span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  File tải lên phải thuộc trung tâm: <strong className="text-slate-800">{user.centerName} ({user.centerCode})</strong>.
                  Hệ thống tự động lọc linh kiện phát sinh, kiểm tra Thời gian lấy máy và tính Doanh thu/Công nợ theo quy định thuế & chiết khấu.
                </p>
              </div>

              <form onSubmit={handleUpload} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 sm:p-4 rounded-xl text-xs sm:text-sm flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Không thể import file</div>
                      <div>{error}</div>
                    </div>
                  </div>
                )}

                {/* Drag and drop zone */}
                <div className="border-2 border-dashed border-slate-300 rounded-2xl p-5 sm:p-8 text-center hover:border-blue-500 transition cursor-pointer bg-slate-50/50">
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-input"
                  />
                  <label htmlFor="file-input" className="cursor-pointer block">
                    <FileSpreadsheet className="w-10 h-10 sm:w-12 sm:h-12 text-blue-500 mx-auto mb-2 sm:mb-3" />
                    <div className="text-xs sm:text-sm font-semibold text-slate-800 break-all sm:break-normal">
                      {file ? file.name : 'Bấm vào đây để chọn file Excel hoặc kéo thả file'}
                    </div>
                    <div className="text-[11px] sm:text-xs text-slate-400 mt-1">
                      Định dạng hỗ trợ: .xlsx, .xls, tối đa 25 MB (báo cáo có chi tiết linh kiện)
                    </div>
                  </label>
                </div>

                {/* Chế độ nạp dữ liệu */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                    Chế độ nạp dữ liệu:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition ${uploadMode === 'upsert' ? 'bg-blue-50/70 border-blue-400 text-blue-900' : 'bg-white border-slate-200 text-slate-700'}`}>
                      <input
                        type="radio"
                        name="mode"
                        value="upsert"
                        checked={uploadMode === 'upsert'}
                        onChange={() => setUploadMode('upsert')}
                        className="mt-1"
                      />
                      <div className="text-xs">
                        <strong className="block text-sm">Cập nhật & Bổ sung (Khuyên dùng)</strong>
                        <span>Cập nhật lại các phiếu đã có và thêm các dòng mới vào báo cáo. Giữ lại các ngày khác đã nạp.</span>
                      </div>
                    </label>

                    <label className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition ${uploadMode === 'replace' ? 'bg-amber-50/70 border-amber-400 text-amber-900' : 'bg-white border-slate-200 text-slate-700'}`}>
                      <input
                        type="radio"
                        name="mode"
                        value="replace"
                        checked={uploadMode === 'replace'}
                        onChange={() => setUploadMode('replace')}
                        className="mt-1"
                      />
                      <div className="text-xs">
                        <strong className="block text-sm">Ghi đè hoàn toàn TTBH</strong>
                        <span>Xóa toàn bộ dữ liệu báo cáo cũ của trung tâm này và chỉ lưu dữ liệu từ file mới tải lên.</span>
                      </div>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!file || uploading}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {uploading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Đang phân tích và nạp dữ liệu...</span>
                    </span>
                  ) : (
                    <>
                      <UploadCloud className="w-5 h-5" />
                      <span>Xử Lý & Nạp Báo Cáo</span>
                    </>
                  )}
                </button>
              </form>

              {/* Success / Warning summary card */}
              {result && (
                <div className={`m-6 p-6 rounded-2xl border ${result.validRows === 0 ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="flex items-center space-x-3 font-black text-lg mb-3">
                    {result.validRows === 0 ? (
                      <>
                        <AlertTriangle className="w-6 h-6 text-amber-600" />
                        <span className="text-amber-800">Đã Đọc File ({result.inputRows} dòng) - Cần Chú Ý!</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                        <span className="text-emerald-800">Nạp Dữ Liệu Thành Công!</span>
                      </>
                    )}
                  </div>

                  {result.zeroNotice && (
                    <div className="mb-4 p-4 bg-white/80 border border-amber-200 rounded-xl text-xs sm:text-sm text-amber-900 leading-relaxed">
                      <p className="font-semibold mb-1.5">{result.zeroNotice}</p>
                      <div className="bg-amber-100/60 p-2.5 rounded-lg mt-2 text-xs text-amber-950">
                        💡 <strong>Cách xử lý:</strong> Khi xuất báo cáo từ hệ thống Vivo (DMS/CRM), quý khách vui lòng chọn xuất <strong>"Chi tiết linh kiện"</strong> để file có đầy đủ các cột <em>Mã linh kiện, Tên linh kiện, Đơn giá</em>. Khi tải file chi tiết đó lên, hệ thống sẽ tự động cập nhật ngay.
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <div className="text-xs text-slate-500 font-semibold">Tổng dòng gốc</div>
                      <div className="text-lg font-bold text-slate-800">{result.inputRows}</div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <div className="text-xs text-slate-500 font-semibold">Dòng linh kiện hợp lệ</div>
                      <div className={`text-lg font-bold ${result.validRows === 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                        {result.validRows}
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <div className="text-xs text-slate-500 font-semibold">TGDĐ (Công nợ)</div>
                      <div className="text-lg font-bold text-amber-700">{result.tgddRows}</div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <div className="text-xs text-slate-500 font-semibold">Khách lẻ (TM)</div>
                      <div className="text-lg font-bold text-blue-700">{result.klRows}</div>
                    </div>
                  </div>

                  {/* BẢNG TỔNG HỢP THEO PHƯƠNG ÁN GIẢI QUYẾT */}
                  {result.solutionStats && result.solutionStats.length > 0 && (
                    <div className="mb-5 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <ListChecks className="w-5 h-5 text-blue-600 flex-shrink-0" />
                          <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                            Tổng Hợp Số Lượng Phiếu Theo Phương Án Giải Quyết
                          </h4>
                        </div>
                        <span className="text-xs text-slate-500 font-medium">
                          Tổng số phiếu trong file: <strong className="text-slate-800 font-bold">{result.solutionStats.reduce((sum: number, s: any) => sum + s.ticketCount, 0)}</strong> phiếu
                        </span>
                      </div>

                      <div className="overflow-x-auto border border-slate-100 rounded-lg">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                            <tr>
                              <th className="py-2.5 px-3">Phương Án Giải Quyết</th>
                              <th className="py-2.5 px-3 w-28 text-center font-bold text-blue-700">Số Phiếu</th>
                              <th className="py-2.5 px-3 w-24 text-center text-slate-500">Số Dòng File</th>
                              <th className="py-2.5 px-3 w-44 text-center">Ghi Chú Nghiệp Vụ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {result.solutionStats.map((stat: any, sIdx: number) => {
                              const isReplacement = stat.solution.toLowerCase().includes('thay thế') || stat.solution.toLowerCase().includes('thay thế');
                              const isCancel = stat.solution.toLowerCase().includes('huỷ') || stat.solution.toLowerCase().includes('hủy');
                              const isSoftware = stat.solution.toLowerCase().includes('phần mềm') || stat.solution.toLowerCase().includes('khôi phục');

                              return (
                                <tr key={sIdx} className="hover:bg-slate-50 transition-colors">
                                  <td className="py-2.5 px-3 font-semibold text-slate-800 flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                      isReplacement ? 'bg-emerald-500' : isCancel ? 'bg-rose-500' : isSoftware ? 'bg-blue-500' : 'bg-slate-400'
                                    }`} />
                                    <span>{stat.solution}</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200">
                                      {stat.ticketCount} phiếu
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center text-slate-600 font-medium">
                                    {stat.rowCount} dòng
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    {stat.validRowCount > 0 ? (
                                      <span className="inline-block text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                        Nạp {stat.validRowCount} dòng LK vào báo cáo
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-slate-400 italic">
                                        Không phát sinh LK
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2">
                    <div className="text-xs text-slate-600">
                      {result.validRows > 0 ? (
                        <span>Đã thêm mới <strong>{result.insertedRows}</strong> dòng, cập nhật <strong>{result.updatedRows}</strong> dòng.</span>
                      ) : (
                        <span className="text-amber-700 font-medium">Báo cáo hiện tại vẫn giữ dữ liệu của lần tải lên trước đó.</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setActiveTab('history');
                          fetchHistory();
                        }}
                        className="px-3.5 py-2 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold transition"
                      >
                        Xem Lịch Sử Upload
                      </button>
                      <button
                        onClick={() => router.push('/dashboard')}
                        className={`flex items-center space-x-1.5 text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm ${result.validRows === 0 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                      >
                        <span>Xem Báo Cáo</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Gợi ý nạp Jobcard Portal */}
                  <div className="mt-4 p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="text-xs text-indigo-900">
                      <strong className="block text-sm font-bold text-indigo-950">💡 Bạn có file danh sách Jobcard từ Portal TGDĐ?</strong>
                      <span>Tải lên file Jobcard để hệ thống tự động khớp mã vận đơn và điền cột Jobcard cho các phiếu sửa chữa.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('portal');
                        fetchPortalStats();
                      }}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shrink-0 transition flex items-center gap-1.5 shadow-sm"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Nạp Jobcard Portal</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* BẢNG PHÂN TÍCH DÒNG BỊ LOẠI & CẢNH BÁO */}
            {result && parsedWarnings.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div
                  onClick={() => setShowWarningsTable(!showWarningsTable)}
                  className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center space-x-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <div>
                      <h3 className="text-base font-black text-slate-900">
                        Bảng Phân Tích Dòng Bị Loại & Cảnh Báo ({parsedWarnings.length} dòng)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Chi tiết từng dòng bị bỏ qua hoặc thiếu thông tin giúp nhân viên trung tâm đối soát và sửa file.
                      </p>
                    </div>
                  </div>
                  <button className="p-1.5 rounded-lg text-slate-500 hover:bg-white transition">
                    {showWarningsTable ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>

                {showWarningsTable && (
                  <div className="p-5 space-y-4">
                    {/* Filter toolbar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
                          <Filter className="w-3.5 h-3.5" /> Lọc:
                        </span>
                        <button
                          onClick={() => setWarningFilter('ALL')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                            warningFilter === 'ALL'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Tất cả ({parsedWarnings.length})
                        </button>
                        <button
                          onClick={() => setWarningFilter('PICKUP')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                            warningFilter === 'PICKUP'
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Thiếu/Lỗi TG Lấy Máy ({parsedWarnings.filter(w => w.type === 'PICKUP').length})
                        </button>
                        <button
                          onClick={() => setWarningFilter('PRICE')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                            warningFilter === 'PRICE'
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Thiếu Đơn Giá ({parsedWarnings.filter(w => w.type === 'PRICE').length})
                        </button>
                      </div>

                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={warningSearch}
                          onChange={(e) => setWarningSearch(e.target.value)}
                          placeholder="Tìm phiếu, nội dung..."
                          className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-56"
                        />
                      </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-96 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100 sticky top-0 z-10 text-slate-700 uppercase font-semibold text-[11px]">
                          <tr>
                            <th className="p-3 border-b border-slate-200 w-16 text-center">STT</th>
                            <th className="p-3 border-b border-slate-200">Chi Tiết Cảnh Báo</th>
                            <th className="p-3 border-b border-slate-200 w-44">Phân Loại</th>
                            <th className="p-3 border-b border-slate-200 w-64">Hướng Dẫn Xử Lý</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredWarnings.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="p-6 text-center text-slate-400">
                                Không có cảnh báo nào phù hợp với bộ lọc.
                              </td>
                            </tr>
                          ) : (
                            filteredWarnings.map((item, idx) => (
                              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                                <td className="p-3 font-mono text-slate-800 break-words">{item.text}</td>
                                <td className="p-3">
                                  {item.type === 'PICKUP' && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                      Thời Gian Lấy Máy
                                    </span>
                                  )}
                                  {item.type === 'PRICE' && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                                      Đơn Giá
                                    </span>
                                  )}
                                  {item.type === 'OTHER' && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                                      Khác
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-slate-600 leading-relaxed">{item.suggestion}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PORTAL JOBCARDS */}
        {activeTab === 'portal' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-200 bg-slate-50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-black text-slate-900 flex items-center space-x-2">
                      <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
                      <span>Tải Lên Danh Sách Jobcard Portal TGDĐ (.xlsx)</span>
                    </h1>
                    <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                      Nạp file danh sách Jobcard từ Portal Thế Giới Di Động. Hệ thống tự động trích xuất mã <strong>MÃ JOBCARD</strong> dựa trên <strong>BILL CHUYỂN ĐI TTBH</strong> và khớp với <strong>Số vận đơn nhanh (nhận)</strong> của báo cáo Vivo để tự động điền cột <strong>Jobcard</strong>.
                    </p>
                  </div>
                  {portalStats && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 text-xs flex-shrink-0 text-indigo-900 space-y-1.5 shadow-sm min-w-[210px]">
                      <div className="flex items-center justify-between gap-4">
                        <span>Jobcard đã lưu:</span>
                        <strong className="text-sm font-mono text-indigo-700">{portalStats.totalCount}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span>Phiếu sửa chữa đã khớp:</span>
                        <strong className="text-sm font-mono text-emerald-700">{portalStats.matchedCount}</strong>
                      </div>
                      {portalStats.totalCount > 0 && (
                        <div className="pt-2 border-t border-indigo-200/60">
                          <button
                            type="button"
                            onClick={handleResetPortal}
                            disabled={portalResetting}
                            className="w-full py-1.5 px-2 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                            title="Xóa toàn bộ mã Jobcard đã lưu để làm sạch hoặc nạp lại file mới"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{portalResetting ? 'Đang xóa...' : 'Reset Dữ Liệu Portal'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={handlePortalUpload} className="p-6 space-y-6">
                {portalSuccessMsg && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-sm flex items-start space-x-3">
                    <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600" />
                    <div>
                      <div className="font-bold">Thao tác thành công</div>
                      <div>{portalSuccessMsg}</div>
                    </div>
                  </div>
                )}

                {portalError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Lỗi nạp file Jobcard</div>
                      <div>{portalError}</div>
                    </div>
                  </div>
                )}

                {/* Drag and drop zone */}
                <div className="border-2 border-dashed border-indigo-200 rounded-2xl p-8 text-center hover:border-indigo-500 transition cursor-pointer bg-indigo-50/20">
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handlePortalFileChange}
                    className="hidden"
                    id="portal-file-input"
                  />
                  <label htmlFor="portal-file-input" className="cursor-pointer block">
                    <FileSpreadsheet className="w-12 h-12 text-indigo-500 mx-auto mb-3" />
                    <div className="text-sm font-semibold text-slate-800">
                      {portalFile ? portalFile.name : 'Bấm vào đây để chọn file Portal Jobcard hoặc kéo thả file'}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Hỗ trợ: .xlsx, .xls (file chứa cột BILL CHUYỂN ĐI TTBH và MÃ JOBCARD)
                    </div>
                  </label>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <button
                    type="submit"
                    disabled={!portalFile || portalUploading}
                    className="flex-1 w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {portalUploading ? (
                      <span className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Đang phân tích và khớp mã Jobcard...
                      </span>
                    ) : (
                      <>
                        <FileSpreadsheet className="w-5 h-5" />
                        <span>Tải Lên & Khớp Mã Jobcard</span>
                      </>
                    )}
                  </button>

                  {portalStats && portalStats.totalCount > 0 && (
                    <button
                      type="button"
                      onClick={handleResetPortal}
                      disabled={portalResetting || portalUploading}
                      className="w-full sm:w-auto px-5 py-3.5 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-300 font-bold rounded-xl shadow-sm transition flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50"
                      title="Xóa toàn bộ mã Jobcard đã lưu để làm sạch hoặc nạp lại file mới"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{portalResetting ? 'Đang xóa...' : 'Reset Dữ Liệu'}</span>
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Portal Result */}
            {portalResult && (
              <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 overflow-hidden p-6 space-y-4">
                <div className="flex items-center gap-3 text-emerald-700 font-bold text-lg">
                  <CheckCircle className="w-6 h-6 flex-shrink-0" />
                  <span>Xử lý file Portal Jobcard thành công!</span>
                </div>

                <p className="text-sm text-slate-600">{portalResult.message}</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500 font-medium">Tổng Jobcard trong file</div>
                    <div className="text-2xl font-black text-slate-800 font-mono mt-1">{portalResult.totalParsed}</div>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                    <div className="text-xs text-indigo-700 font-medium">Jobcard nạp vào hệ thống</div>
                    <div className="text-2xl font-black text-indigo-700 font-mono mt-1">{portalResult.totalSaved}</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="text-xs text-emerald-700 font-medium">Linh kiện được khớp Jobcard</div>
                    <div className="text-2xl font-black text-emerald-700 font-mono mt-1">{portalResult.updatedReportsCount}</div>
                  </div>
                </div>

                {portalResult.matchedTickets && portalResult.matchedTickets.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="text-xs font-bold text-slate-700 mb-2">
                      Danh sách các số phiếu sửa chữa đã khớp mã Jobcard ({portalResult.matchedTickets.length} phiếu):
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                      {portalResult.matchedTickets.map((t, idx) => (
                        <span key={idx} className="px-2.5 py-1 bg-white border border-blue-200 text-blue-700 font-mono font-bold text-xs rounded-lg shadow-sm">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow transition flex items-center gap-2"
                  >
                    <span>Xem Bảng Báo Cáo Sửa Chữa</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: UPLOAD HISTORY & SYNC STATUS */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 flex items-center space-x-2">
                  <History className="w-6 h-6 text-blue-600" />
                  <span>Lịch Sử Các Lần Tải Lên</span>
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Lịch sử các lần nạp báo cáo Excel của trung tâm <strong>{user.centerName}</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {historyList.some(r => r.status === 'LOCAL_ONLY' || r.status === 'FAILED') && (
                  <button
                    onClick={() => handleRetry()}
                    disabled={retryingAll || retryingId !== null}
                    className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                    title="Đồng bộ lại tất cả các bản ghi chưa gửi được sang Google Sheets qua n8n"
                  >
                    {retryingAll ? (
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    <span>Đồng Bộ Lại Tất Cả</span>
                  </button>
                )}
                <button
                  onClick={fetchHistory}
                  disabled={loadingHistory}
                  className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 rounded-xl shadow-sm transition"
                  title="Làm mới lịch sử"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {historyNotice && (
              <div className="m-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs sm:text-sm text-blue-900 flex items-center justify-between">
                <span>{historyNotice}</span>
                <button onClick={() => setHistoryNotice(null)} className="text-blue-500 font-bold hover:text-blue-700 ml-3">
                  ✕
                </button>
              </div>
            )}

            <div className="p-6">
              {loadingHistory && historyList.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <span>Đang tải lịch sử...</span>
                </div>
              ) : historyList.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-600">Chưa có lịch sử tải lên nào.</p>
                  <p className="text-xs text-slate-400 mt-1">Hãy chuyển sang tab "Tải Lên & Phân Tích" để tải file Excel đầu tiên.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[11px] border-b border-slate-200">
                      <tr>
                        <th className="p-3 w-44">Thời Gian Tải</th>
                        <th className="p-3">Tên File</th>
                        <th className="p-3 w-28 text-center">Tổng Dòng Raw</th>
                        <th className="p-3 w-28 text-center">Dòng Hợp Lệ</th>
                        <th className="p-3 w-44 text-center">Trạng Thái</th>
                        <th className="p-3 w-28 text-center">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historyList.map((record) => {
                        const isPending = record.status === 'LOCAL_ONLY' || record.status === 'FAILED';
                        const isThisRetrying = retryingId === record.uploadId || retryingAll;

                        return (
                          <tr key={record.uploadId} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 text-slate-600 font-mono">
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{new Date(record.uploadTime).toLocaleString('vi-VN')}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{record.uploadId}</div>
                            </td>
                            <td className="p-3 font-semibold text-slate-800 break-all">
                              {record.fileName}
                            </td>
                            <td className="p-3 text-center font-bold text-slate-700">{record.inputRows}</td>
                            <td className="p-3 text-center font-bold text-emerald-600">{record.validRows}</td>
                            <td className="p-3 text-center">
                              {record.status === 'SUCCESS' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800" title="Đã lưu vào hệ thống và đồng bộ n8n">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Đã đồng bộ
                                </span>
                              ) : record.status === 'LOCAL_ONLY' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800" title={record.errorMessage || 'Đã lưu cục bộ, chưa gửi được sang n8n'}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  Chỉ lưu nội bộ
                                </span>
                              ) : record.status === 'FAILED' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800" title={record.errorMessage || 'Đồng bộ thất bại'}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                  Lỗi đồng bộ
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
                                  Không có linh kiện
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {isPending && record.validRows > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => handleRetry(record.uploadId)}
                                  disabled={isThisRetrying}
                                  className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[11px] rounded-lg transition inline-flex items-center gap-1 disabled:opacity-50"
                                  title="Đồng bộ lại bản ghi này sang Google Sheets qua n8n"
                                >
                                  {retryingId === record.uploadId ? (
                                    <div className="w-3 h-3 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-3 h-3" />
                                  )}
                                  <span>Gửi lại</span>
                                </button>
                              ) : (
                                <span className="text-slate-400 text-[11px]">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
