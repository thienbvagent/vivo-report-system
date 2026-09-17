'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Lock, Building2, AlertCircle } from 'lucide-react';
import { SERVICE_CENTERS } from '@/lib/centers';

export default function LoginPage() {
  const router = useRouter();
  const [selectedCenter, setSelectedCenter] = useState('R4001003');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: selectedCenter, password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Đăng nhập không thành công.');
        setLoading(false);
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      console.error('[Login network error]:', err);
      setError('Lỗi kết nối mạng: Không thể kết nối tới máy chủ.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="bg-blue-600 px-5 py-6 sm:px-8 sm:py-8 text-center text-white">
          <div className="inline-block bg-white text-blue-600 font-black px-4 py-1.5 rounded-lg text-2xl tracking-wider mb-2 shadow-sm">
            vivo
          </div>
          <h1 className="text-lg sm:text-xl font-bold">Hệ Thống Báo Cáo TTBH</h1>
          <p className="text-blue-100 text-xs mt-1">Trung tâm Chăm Sóc Khách Hàng Vivo Toàn Quốc</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-8 space-y-4 sm:space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-3 rounded-xl text-xs sm:text-sm flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 flex items-center space-x-1.5">
              <Building2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span>Chọn Trung Tâm CSKH Vivo (TTBH)</span>
            </label>
            <select
              value={selectedCenter}
              onChange={e => setSelectedCenter(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white min-h-[44px]"
            >
              {Object.entries(SERVICE_CENTERS).map(([code, name]) => (
                <option key={code} value={code}>
                  {code} - {name}
                </option>
              ))}
            </select>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-1">Username tương ứng với mã TTBH của bạn</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 flex items-center space-x-1.5">
              <Lock className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span>Mật Khẩu Xác Thực</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white min-h-[44px]"
            />
            <p className="text-[11px] sm:text-xs text-slate-400 mt-1">Nhập mật khẩu được quản trị viên cấp cho trung tâm.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-lg shadow-blue-500/30 flex items-center justify-center space-x-2 disabled:opacity-50 min-h-[44px] text-sm"
          >
            {loading ? (
              <span>Đang xác thực...</span>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                <span>Đăng Nhập Vào Hệ Thống</span>
              </>
            )}
          </button>

          <div className="pt-2 text-center text-xs text-slate-400">
            Kết nối an toàn tới VPS n8n: <span className="font-mono text-slate-500">n8n.pdarc.space</span>
          </div>
        </form>
      </div>
    </div>
  );
}
