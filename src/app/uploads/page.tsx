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
              Hệ thống sẽ tự động lọc theo Phương án giải quyết, kiểm tra Thời gian lấy máy và phân loại TGDĐ/KL.
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
                  Định dạng hỗ trợ: .xlsx, .xls (báo cáo truy vấn chi tiết phiếu công tác sửa chữa)
                </div>
              </label>
            </div>

            <button
              type="submit"
              disabled={!file || uploading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {uploading ? (
                <span>Đang phân tích và đồng bộ sang n8n...</span>
              ) : (
                <>
                  <UploadCloud className="w-5 h-5" />
                  <span>Xử Lý & Đồng Bộ Dữ Liệu</span>
                </>
              )}
            </button>
          </form>

          {/* Success summary card */}
          {result && (
            <div className="m-6 p-6 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <div className="flex items-center space-x-3 text-emerald-800 font-black text-lg mb-4">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
                <span>Xử Lý Thành Công!</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
                <div className="bg-white p-3 rounded-lg border border-emerald-200">
                  <div className="text-xs text-slate-500 font-semibold">Tổng dòng gốc</div>
                  <div className="text-lg font-bold text-slate-800">{result.inputRows}</div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-emerald-200">
                  <div className="text-xs text-slate-500 font-semibold">Dòng hợp lệ</div>
                  <div className="text-lg font-bold text-emerald-700">{result.validRows}</div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-emerald-200">
                  <div className="text-xs text-slate-500 font-semibold">TGDĐ (Công nợ)</div>
                  <div className="text-lg font-bold text-amber-700">{result.tgddRows}</div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-emerald-200">
                  <div className="text-xs text-slate-500 font-semibold">Khách lẻ (TM)</div>
                  <div className="text-lg font-bold text-blue-700">{result.klRows}</div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <div className="text-xs text-emerald-700">
                  Đã ghi nhận dữ liệu cho các ngày:{' '}
                  <strong>{result.availableReportDates?.slice(-5).join(', ')}</strong>
                </div>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition"
                >
                  <span>Xem Báo Cáo</span>
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
