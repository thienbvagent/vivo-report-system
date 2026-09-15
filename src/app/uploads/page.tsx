'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { UploadCloud, FileSpreadsheet, CheckCircle, AlertTriangle, AlertCircle, ArrowRight } from 'lucide-react';

export default function UploadsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ centerCode: string; centerName: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'upsert' | 'replace'>('upsert');
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
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
    } catch (err: any) {
      setError('Lỗi kết nối: ' + err.message);
      setUploading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar user={user} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50">
            <h1 className="text-xl font-black text-slate-900 flex items-center space-x-2">
              <UploadCloud className="w-6 h-6 text-blue-600" />
              <span>Tải Lên Báo Cáo Sửa Chữa Chi Tiết (.xlsx)</span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              File tải lên phải thuộc trung tâm: <strong>{user.centerName} ({user.centerCode})</strong>.
              Hệ thống sẽ tự động lọc các dòng phát sinh linh kiện, kiểm tra Thời gian lấy máy và tính toán Doanh thu / Công nợ theo quy định thuế & chiết khấu.
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
                  Định dạng hỗ trợ: .xlsx, .xls (Báo cáo truy vấn chi tiết phiếu công tác sửa chữa có chi tiết linh kiện)
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
                <span>Đang phân tích và nạp dữ liệu...</span>
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

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2">
                <div className="text-xs text-slate-600">
                  {result.validRows > 0 ? (
                    <span>Đã thêm mới <strong>{result.insertedRows}</strong> dòng, cập nhật <strong>{result.updatedRows}</strong> dòng.</span>
                  ) : (
                    <span className="text-amber-700 font-medium">Báo cáo hiện tại vẫn giữ dữ liệu của lần tải lên trước đó.</span>
                  )}
                </div>
                <button
                  onClick={() => router.push('/dashboard')}
                  className={`flex items-center space-x-1.5 text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm ${result.validRows === 0 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  <span>Xem Báo Cáo Hiện Tại</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
