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
  FileText
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
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'upsert' | 'replace'>('upsert');
  const [result, setResult] = useState<any | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);

  // Warnings inspection state
  const [showWarningsTable, setShowWarningsTable] = useState(true);
  const [warningFilter, setWarningFilter] = useState<'ALL' | 'PICKUP' | 'PRICE' | 'PART'>('ALL');
  const [warningSearch, setWarningSearch] = useState('');

  // History state
  const [historyList, setHistoryList] = useState<UploadRecordItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
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

  useEffect(() => {
    fetchUser();
    fetchHistory();
  }, [router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setResult(null);
    }
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
      setError('Lỗi kết nối: ' + err.message);
      setUploading(false);
    }
  };

  const handleRetrySync = async (uploadId?: string) => {
    const targetId = uploadId || result?.uploadId;
    if (!targetId) return;

    setRetrying(true);
    setRetryNotice(null);
    try {
      const res = await fetch('/api/sync-retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: targetId })
      });
      const data = await res.json();
      if (data.success) {
        setRetryNotice(data.message || 'Đã đồng bộ thành công sang n8n/Google Sheets!');
        if (result) {
          setResult({ ...result, n8nStatus: 'SYNCED_N8N' });
        }
        fetchHistory();
      } else {
        setRetryNotice('Đồng bộ thất bại: ' + (data.error || 'Lỗi không xác định'));
      }
    } catch (err: any) {
      setRetryNotice('Lỗi: ' + err.message);
    } finally {
      setRetrying(false);
    }
  };

  const handleRetryHistoryItem = async (uploadId: string) => {
    setRetryingId(uploadId);
    setHistoryNotice(null);
    try {
      const res = await fetch('/api/sync-retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId })
      });
      const data = await res.json();
      if (data.success) {
        setHistoryNotice(`Đã đồng bộ thành công cho bản ghi ${uploadId}!`);
        fetchHistory();
      } else {
        setHistoryNotice(`Đồng bộ thất bại: ${data.error || 'Lỗi không xác định'}`);
      }
    } catch (err: any) {
      setHistoryNotice('Lỗi: ' + err.message);
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryAllHistory = async () => {
    setRetryingAll(true);
    setHistoryNotice(null);
    try {
      const res = await fetch('/api/sync-retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retryAll: true })
      });
      const data = await res.json();
      if (data.success) {
        setHistoryNotice(data.message || 'Đã đồng bộ thành công toàn bộ các bản ghi tồn đọng!');
        fetchHistory();
      } else {
        setHistoryNotice(`Đồng bộ thất bại: ${data.error || 'Lỗi không xác định'}`);
      }
    } catch (err: any) {
      setHistoryNotice('Lỗi: ' + err.message);
    } finally {
      setRetryingAll(false);
    }
  };

  if (!user) return null;

  const pendingCount = historyList.filter(u => u.status === 'LOCAL_ONLY' || u.status === 'FAILED').length;

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

      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-6">
        {/* Navigation Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-200 mb-6 bg-white px-4 py-2 rounded-xl shadow-sm">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition ${
              activeTab === 'upload'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>Tải Lên & Phân Tích</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('history');
              fetchHistory();
            }}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition relative ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Lịch Sử & Đồng Bộ</span>
            {pendingCount > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-extrabold ${
                activeTab === 'history' ? 'bg-amber-400 text-amber-950' : 'bg-amber-500 text-white'
              }`}>
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: UPLOAD & ANALYSIS */}
        {activeTab === 'upload' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-200 bg-slate-50">
                <h1 className="text-xl font-black text-slate-900 flex items-center space-x-2">
                  <UploadCloud className="w-6 h-6 text-blue-600" />
                  <span>Tải Lên Báo Cáo Sửa Chữa Chi Tiết (.xlsx)</span>
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  File tải lên phải thuộc trung tâm: <strong>{user.centerName} ({user.centerCode})</strong>.
                  Hệ thống tự động lọc linh kiện phát sinh, kiểm tra Thời gian lấy máy và tính Doanh thu/Công nợ theo quy định thuế & chiết khấu.
                </p>
              </div>

              <form onSubmit={handleUpload} className="p-6 space-y-6">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Không thể import file</div>
                      <div>{error}</div>
                    </div>
                  </div>
                )}

                {/* Drag and drop zone */}
                <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-blue-500 transition cursor-pointer bg-slate-50/50">
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-input"
                  />
                  <label htmlFor="file-input" className="cursor-pointer block">
                    <FileSpreadsheet className="w-12 h-12 text-blue-500 mx-auto mb-3" />
                    <div className="text-sm font-semibold text-slate-800">
                      {file ? file.name : 'Bấm vào đây để chọn file Excel hoặc kéo thả file'}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
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

                  {result.n8nStatus === 'FAILED_N8N' && (
                    <div className="mb-4 p-4 bg-amber-100 border border-amber-300 rounded-xl text-xs sm:text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1">
                        <strong>Dữ liệu đã được lưu an toàn trên hệ thống web nhưng chưa đồng bộ sang n8n/Google Sheets.</strong>
                        <div className="mt-1 break-words text-xs text-amber-900">{result.n8nError || 'Không nhận được xác nhận từ n8n.'}</div>
                        {retryNotice && <div className="mt-2 font-bold text-xs text-blue-800">{retryNotice}</div>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRetrySync()}
                        disabled={retrying}
                        className="flex-shrink-0 px-3.5 py-2 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center space-x-1.5 self-start sm:self-center"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                        <span>{retrying ? 'Đang thử lại...' : 'Đồng Bộ Lại Sang n8n'}</span>
                      </button>
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

        {/* TAB 2: UPLOAD HISTORY & SYNC STATUS */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 flex items-center space-x-2">
                  <History className="w-6 h-6 text-blue-600" />
                  <span>Lịch Sử Các Lần Tải Lên & Trạng Thái Đồng Bộ</span>
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Theo dõi trạng thái lưu trữ trên Web và đồng bộ sang n8n / Google Sheets của trung tâm <strong>{user.centerName}</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchHistory}
                  disabled={loadingHistory}
                  className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 rounded-xl shadow-sm transition"
                  title="Làm mới lịch sử"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
                </button>

                {pendingCount > 0 && (
                  <button
                    onClick={handleRetryAllHistory}
                    disabled={retryingAll}
                    className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 transition flex items-center space-x-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${retryingAll ? 'animate-spin' : ''}`} />
                    <span>Đồng Bộ Tất Cả ({pendingCount})</span>
                  </button>
                )}
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
                        <th className="p-3 w-40">Thời Gian</th>
                        <th className="p-3">Tên File</th>
                        <th className="p-3 w-24 text-center">Tổng Dòng</th>
                        <th className="p-3 w-24 text-center">Hợp Lệ</th>
                        <th className="p-3 w-24 text-center">Cảnh Báo</th>
                        <th className="p-3 w-48">Trạng Thái Đồng Bộ</th>
                        <th className="p-3 w-32 text-center">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historyList.map((record) => {
                        const isSuccess = record.status === 'SUCCESS';
                        const isLocalOnly = record.status === 'LOCAL_ONLY';
                        const isFailed = record.status === 'FAILED';

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
                            <td className="p-3 text-center font-bold text-amber-600">{record.warningRows}</td>
                            <td className="p-3">
                              {isSuccess && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Đã đồng bộ Sheets
                                </span>
                              )}
                              {isLocalOnly && (
                                <div>
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                    Lưu cục bộ (Chờ sync)
                                  </span>
                                </div>
                              )}
                              {isFailed && (
                                <div>
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                    Lỗi đồng bộ n8n
                                  </span>
                                  {record.errorMessage && (
                                    <div className="text-[10px] text-rose-600 mt-1 max-w-xs break-words line-clamp-2" title={record.errorMessage}>
                                      {record.errorMessage}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {!isSuccess ? (
                                <button
                                  onClick={() => handleRetryHistoryItem(record.uploadId)}
                                  disabled={retryingId === record.uploadId}
                                  className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-sm inline-flex items-center gap-1"
                                >
                                  <RefreshCw className={`w-3 h-3 ${retryingId === record.uploadId ? 'animate-spin' : ''}`} />
                                  <span>Đồng bộ lại</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-emerald-600 font-semibold">Hoàn tất</span>
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
