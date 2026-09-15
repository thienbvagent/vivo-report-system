# HỆ THỐNG BÁO CÁO BẢO HÀNH TRUNG TÂM CSKH VIVO
**Tích hợp Web Application (Next.js + TypeScript + Tailwind) và n8n Workflow (n8n.pdarc.space)**

---

## 1. TỔNG QUAN DỰ ÁN
Hệ thống xử lý tự động file báo cáo truy vấn chi tiết phiếu công tác sửa chữa của **15 Trung tâm CSKH Vivo trên toàn quốc**, phân loại khách hàng (TGDĐ / Khách lẻ), kiểm tra phương án giải quyết hợp lệ, quản lý theo Thời gian lấy máy và đồng bộ sang Google Sheets (`DATA` và `BaoCao`).

### Cấu trúc dự án
```
vivo-report-system/
├── n8n/
│   ├── vivo-report-import.json    # Workflow n8n: Nhận file, lọc, ghi vào tab DATA
│   ├── vivo-report-query.json     # Workflow n8n: Truy vấn dữ liệu theo ngày cho Dashboard
│   └── vivo-report-export.json    # Workflow n8n: Xuất 8 cột chuẩn sang tab BaoCao
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/              # Login, Logout, Me API
│   │   │   ├── uploads/           # Upload Excel, check SHA-256 hash, forward n8n
│   │   │   ├── reports/           # Query báo cáo theo ngày
│   │   │   └── export/            # Export sang tab BaoCao
│   │   ├── login/                 # Giao diện Đăng nhập TTBH
│   │   ├── dashboard/             # Giao diện Dashboard lọc ngày & xuất báo cáo
│   │   └── uploads/               # Giao diện Tải lên file Excel
│   ├── components/                # Navbar, SummaryCards, DataTable
│   └── lib/                       # business-rules, auth, centers, file-hash, n8n-client
├── tests/
│   └── business-rules.test.ts     # 11 Unit & Integration Tests (Pass 100%)
├── .env.example
├── .env.local
└── README.md
```

---

## 2. HƯỚNG DẪN IMPORT 3 WORKFLOW VÀO N8N (https://n8n.pdarc.space/)

### Bước 1: Mở n8n và Import file
1. Đăng nhập vào n8n của bạn tại: `https://n8n.pdarc.space/`
2. Vào mục **Workflows** $ightarrow$ bấm **Import from File...**
3. Import lần lượt 3 file trong thư mục `n8n/`:
   * `n8n/vivo-report-import.json` (Tên: *Vivo Report - Import Excel*)
   * `n8n/vivo-report-query.json` (Tên: *Vivo Report - Query DATA*)
   * `n8n/vivo-report-export.json` (Tên: *Vivo Report - Export BaoCao*)

### Bước 2: Cấu hình Credential & Spreadsheet trên n8n
1. Trong mỗi workflow, mở các node **Google Sheets**:
   * Chọn **Credential**: Sử dụng tài khoản Google Sheets Credential đã có sẵn trên n8n của bạn.
   * Nhập **Spreadsheet ID**: ID bảng tính Google Sheet của bạn (lấy từ URL Google Sheet).
2. Kiểm tra tên Range của các sheet:
   * Tab `DATA`: Range `DATA!A:P`
   * Tab `BaoCao`: Range `BaoCao!A:H`
3. Bật công tắc **Active** (gạt sang Active) cho cả 3 workflow để kích hoạt Production Webhook.

---

## 3. CẤU TRÚC GOOGLE SHEETS CẦN TẠO

Trên Google Spreadsheet của bạn, tạo sẵn 3 Tab sau:

### Tab 1: `DATA` (Lưu toàn bộ lịch sử)
Đặt tiêu đề ở dòng 1 gồm 16 cột:
```
Mã TTBH | Tên TTBH | Ngày báo cáo | Thời gian lấy máy | Số phiếu sửa chữa | Mã vật tư linh kiện | Tên vật tư | Đơn giá | Doanh thu tiền mặt | Công nợ | Khách hàng | Phương thức thanh toán | Phương án giải quyết | Upload ID | Thời gian import | Source Row Number
```

### Tab 2: `BaoCao` (Xuất báo cáo theo ngày đã chọn)
Đặt tiêu đề ở dòng 1 gồm đúng 8 cột:
```
Số phiếu sửa chữa | Mã vật tư linh kiện | Tên vật tư | Đơn giá | Doanh thu tiền mặt | Công nợ | Khách hàng | Phương thức thanh toán
```

### Tab 3: `UPLOADS` (Chống trùng file)
```
Upload ID | Mã TTBH | Tên file | File Hash (SHA-256) | Thời gian upload | Input Rows | Valid Rows | Warning Rows | Status
```

---

## 4. CẤU HÌNH BIẾN MÔI TRƯỜNG (.env.local)
Sao chép `.env.example` thành `.env.local`:
```env
N8N_BASE_URL=https://n8n.pdarc.space
N8N_IMPORT_WEBHOOK_URL=https://n8n.pdarc.space/webhook/vivo-report-import
N8N_QUERY_WEBHOOK_URL=https://n8n.pdarc.space/webhook/vivo-report-query
N8N_EXPORT_WEBHOOK_URL=https://n8n.pdarc.space/webhook/vivo-report-export
N8N_WEBHOOK_SECRET=VivoSecretKey@2026

SESSION_SECRET=vivo_cs_kh_jwt_session_secret_2026_super_secure_key_12345
NEXT_PUBLIC_APP_NAME="Hệ Thống Báo Cáo TTBH Vivo"
```

---

## 5. HƯỚNG DẪN CHẠY LOCAL & TEST

### Cài đặt và kiểm tra Unit Test:
```bash
# 1. Chạy 11 unit test & test file thật D:\...
npm test
```
*Kết quả test:* 11/11 tests Passed, khớp chính xác 490 dòng hợp lệ trên file mẫu `D:\VN0000182_...xlsx`.

### Chạy Web App ở môi trường phát triển:
```bash
npm run dev
```
Mở trình duyệt truy cập: `http://localhost:3000`

---

## 6. HƯỚNG DẪN ĐĂNG NHẬP & TEST FILE MẪU
1. Truy cập `http://localhost:3000/login`
2. Chọn Trung tâm CSKH: **R4001003 - Trung tâm CSKH vivo Cần Thơ**
3. Nhập Mật khẩu mặc định: `Vivo@2026`
4. Vào trang **Tải Lên Excel**, chọn file:
   `D:\VN0000182_Bảng báo cáo truy vấn chi tiết phiếu công tác sửa chữa_2026-09-13 11_51_10 (1).xlsx`
5. Bấm **Xử Lý & Đồng Bộ Dữ Liệu**:
   * Hệ thống sẽ tự động tính SHA-256 chống upload trùng.
   * Lọc 506 dòng theo `Phương án giải quyết` hợp lệ.
   * Lọc bỏ 16 dòng thiếu `Thời gian lấy máy`.
   * Ghi nhận chính xác 490 linh kiện (327 TGDĐ, 163 Khách lẻ).
6. Bấm **Xem Báo Cáo**:
   * Dashboard hiển thị tổng số dòng, tiền mặt, công nợ.
   * Dropdown lọc theo ngày: chọn ngày cụ thể (ví dụ `2026-08-13`) hoặc `Tất cả các ngày`.
   * Bấm **Xuất Google Sheets (BaoCao)**: Dữ liệu 8 cột của ngày đó sẽ tự động được làm sạch và ghi vào tab `BaoCao`.

---

## 7. HƯỚNG DẪN DEPLOY LÊN VPS
Trên VPS (nơi đang chạy n8n hoặc server web riêng):
```bash
# 1. Clone hoặc copy source code lên VPS
cd /var/www/vivo-report-system

# 2. Cài đặt dependencies và build
npm install
npm run build

# 3. Chạy với PM2 để chạy nền vĩnh viễn
pm2 start npm --name "vivo-report-web" -- start -- -p 3000
pm2 save
pm2 startup
```
Cấu hình Nginx reverse proxy trỏ domain (ví dụ `report.pdarc.space`) về port 3000.
