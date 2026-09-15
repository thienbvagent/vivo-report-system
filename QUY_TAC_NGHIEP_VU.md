# TÀI LIỆU TOÀN BỘ QUY TẮC & ĐIỀU KIỆN VẬN HÀNH HỆ THỐNG BÁO CÁO TTBH VIVO

Tài liệu này tổng hợp đầy đủ và chính xác tất cả các điều kiện, thuật toán và nghiệp vụ mà hệ thống Web Tool và Workflow n8n đang vận hành để xử lý dữ liệu từ các file Excel báo cáo chi tiết phiếu công tác sửa chữa vivo.

---

## 1. QUY TẮC NHẬN DIỆN VÀ DÒ TÌM TIÊU ĐỀ CỘT (HEADER RESOLUTION)

* **Không hard-code vị trí cột**: Hệ thống tuyệt đối không cố định vị trí cột theo ký hiệu (A, B, C... hay 1, 2, 3...) vì thứ tự cột trong phần mềm vivo có thể thay đổi khi xuất file.
* **Dò tìm theo Tên Header**: Quét tự động danh sách tên cột ở các dòng đầu tiên của sheet.
* **Chuẩn hóa chuỗi (Unicode NFC & Strip BOM)**:
  * Loại bỏ ký tự BOM ẩn (`\uFEFF`) ở đầu chuỗi.
  * Chuẩn hóa Unicode tổ hợp / dựng sẵn về chuẩn chuẩn hóa **NFC**.
  * Cắt khoảng trắng thừa hai đầu (`trim`).
  * So khớp không phân biệt chữ hoa / chữ thường (`toLowerCase`).
* **12 Cột dữ liệu bắt buộc phải có trong file**:
  1. `Mã tổ chức`
  2. `Phiếu công tác sửa chữa`
  3. `Loại hình đem đến sửa`
  4. `Số điện thoại người đem đến sửa`
  5. `Loại hình sửa chữa`
  6. `Phương án giải quyết`
  7. `Loại linh kiện`
  8. `Mã linh kiện`
  9. `Tên linh kiện`
  10. `Số tiền phải thu`
  11. `Số tiền thực thu`
  12. `Thời gian lấy máy`

> [!IMPORTANT]
> Nếu file thiếu bất kỳ cột nào trong số 12 cột trên, hệ thống sẽ từ chối xử lý và báo lỗi rõ tên cột bị thiếu.

---

## 2. QUY TẮC BẢO MẬT & PHÂN QUYỀN TRUNG TÂM BẢO HÀNH (TTBH ISOLATION)

* Hệ thống quản lý độc lập **15 Trung tâm CSKH vivo** (mã từ `R4001001` đến `R4001026`).
* **Kiểm tra tính nhất quán trong file**:
  * Cột `Mã tổ chức` trong toàn bộ file phải thuộc về **duy nhất một trung tâm**.
  * Nếu file chứa dữ liệu từ 2 mã tổ chức khác nhau trở lên $\rightarrow$ Hệ thống lập tức **từ chối (REJECT)** để tránh lẫn lộn dữ liệu giữa các chi nhánh.
* **Phân quyền người dùng**:
  * TTBH đang đăng nhập chỉ được phép tải lên và xem báo cáo của chính mã TTBH đó.
  * Nếu TTBH Cần Thơ (`R4001003`) đăng nhập nhưng tải lên file của Hà Nội (`R4001002`) $\rightarrow$ Báo lỗi `WRONG_SERVICE_CENTER` và chặn xử lý.

---

## 3. QUY TẮC LỌC DÒNG BẢN GHI (ROW FILTERING RULES)

Một dòng dữ liệu trong file Excel chỉ được đưa vào báo cáo nếu thỏa mãn **đồng thời cả 2 điều kiện sau**:

### Điều kiện 3.1: Thời gian lấy máy hợp lệ
* Cột `Thời gian lấy máy` phải có dữ liệu ngày giờ và đúng định dạng bắt đầu bằng `YYYY-MM-DD` (Ví dụ: `2026-08-22 11:17:22`).
* Trích xuất phần ngày `YYYY-MM-DD` để gán vào trường `Ngày báo cáo` (`report_date`).
* Dòng nào không có thời gian lấy máy hoặc định dạng sai sẽ bị bỏ qua và ghi nhận cảnh báo `MISSING_PICKUP_TIME`.

### Điều kiện 3.2: Lọc theo Linh kiện (Ưu tiên phát sinh linh kiện thực tế)
* **Cứ dòng nào có phát sinh `Mã linh kiện` HOẶC `Tên linh kiện`** $\rightarrow$ **Mặc định luôn luôn được lấy vào báo cáo** (bất kể Phương án giải quyết ghi là thay thế linh kiện, vệ sinh máy hay khôi phục phần mềm PC...).
* Chỉ bỏ qua (SKIP) các dòng mà **cả hai cột `Mã linh kiện` và `Tên linh kiện` đều trống** (ví dụ: các dòng vệ sinh hoặc chạy phần mềm thuần túy không dùng vật tư).

---

## 4. QUY TẮC PHÂN LOẠI KHÁCH HÀNG & PHƯƠNG THỨC THANH TOÁN

Dựa vào cột `Loại hình đem đến sửa` và `Số điện thoại người đem đến sửa`:

| Điều kiện nhận diện | Phân loại Khách hàng | Phương thức thanh toán |
| :--- | :---: | :---: |
| `Loại hình đem đến sửa` là **`Máy demo được gửi đi sửa chữa`** | **TGDĐ** | **CN** *(Công nợ)* |
| `Loại hình đem đến sửa` là **`Kênh chuỗi gửi sửa`** **VÀ** `Số điện thoại người đem đến sửa` thỏa mãn: bắt đầu bằng **`+84 190`** HOẶC **`+84 109`** (gõ nhầm đầu số), HOẶC kết thúc bằng **`464`**, HOẶC kết thúc bằng **`460`** | **TGDĐ** | **CN** *(Công nợ)* |
| Tất cả các trường hợp còn lại | **KL** *(Khách lẻ)* | **TM** *(Tiền mặt)* |

---

## 5. QUY TẮC XÁC ĐỊNH ĐƠN GIÁ & ĐỐI CHIẾU THỰC THU

### Điều kiện 5.1: Xác định Đơn giá (Unit Price) theo Phương án 2
* Cột `Đơn giá` **ƯU TIÊN tham chiếu từ cột `Giá bán lẻ đề nghị`** (nhằm thể hiện chính xác giá trị thực tế của vật tư/linh kiện xuất kho).
* Nếu dòng nào không có `Giá bán lẻ đề nghị` $\rightarrow$ hệ thống tự động fallback lấy từ cột `Số tiền phải thu`.
* **Đối với linh kiện Sửa chữa tính phí**: `Giá bán lẻ đề nghị` và `Số tiền phải thu` trùng khớp nhau 100%.
* **Đối với linh kiện Bảo hành miễn phí**: Cột `Đơn giá` thể hiện giá trị niêm yết của linh kiện xuất bảo hành (ví dụ: bo mạch 4,443,000 VNĐ, màn hình 645,000 VNĐ...), trong khi các cột `Công nợ` và `Doanh thu tiền mặt` vẫn bằng `0` (vì bảo hành không thu tiền khách).

### Điều kiện 5.2: Đối chiếu Phải thu và Thực thu
Hệ thống lấy giá trị thực tế phát sinh từ cột `Số tiền thực thu` để phân bổ vào đúng tài khoản theo phân loại khách hàng:

* **Đối với Khách hàng lẻ (`KL`)**:
  * Ô **`Doanh thu tiền mặt`** = `Số tiền thực thu` (nếu không có số thì mặc định là `0`).
  * Ô **`Công nợ`**: Không tính khách lẻ $\rightarrow$ hiển thị dấu gạch ngang (`-`) trên web và để trống trên Google Sheets.
* **Đối với Khách hàng Thế Giới Di Động (`TGDĐ`)**:
  * Ô **`Công nợ`** = `Số tiền thực thu` (nếu không phát sinh chi phí hoặc bảo hành $\rightarrow$ **bắt buộc điền rõ số `0`**, không để gạch ngang hay trống).
  * Ô **`Doanh thu tiền mặt`**: Không tính TGDĐ $\rightarrow$ hiển thị dấu gạch ngang (`-`) trên web và để trống trên Google Sheets.

### Điều kiện 5.3: Hậu kiểm và ghi đè Công nợ đối với TGDĐ (Final Pass Safeguard)
Sau khi kết xuất kết quả báo cáo sơ bộ, hệ thống tự động chạy một vòng kiểm tra lại lần thứ 2 trước khi xuất ra bản hoàn chỉnh:
* **Điều kiện kích hoạt**:
  * Khách hàng là **`TGDĐ`**
  * **VÀ** ca làm việc là Bảo hành (hoặc `Loại hình sửa chữa` là `Bảo hành`, hoặc `Loại linh kiện` là `Bảo hành`, hoặc `Số tiền thực thu` = 0)
* **Xử lý ghi đè**: Bắt buộc gán ô **`Công nợ = 0`** (chỉ áp dụng riêng cho khách TGDĐ, tuyệt đối không tính KL).
* **Quy chuẩn hiển thị toàn dự án**:
  * **Cột Công nợ**: Chỉ điền cho khách **`TGDĐ`** (có số tiền hoặc điền số **`0`** nếu bảo hành/miễn phí). Khách **`KL`** luôn để dấu **`-`** hoặc để trống.
  * **Cột Tiền mặt TM**: Chỉ điền cho khách **`KL`** (có số tiền thực thu). Khách **`TGDĐ`** luôn để dấu **`-`** hoặc để trống.

---

## 6. ĐIỀU KIỆN CHO "LOẠI HÌNH SỬA CHỮA" & QUY CHUẨN XUẤT KHO THEO "LOẠI LINH KIỆN"

Quy tắc xuất kho và phân bổ dữ liệu được thiết lập chi tiết theo sự kết hợp giữa **`Loại hình sửa chữa`** và **`Loại linh kiện`**:

### Trường hợp 6.1: Khi `Loại hình sửa chữa` là `Bảo hành + Sửa chữa` (Phiếu kết hợp)
Khi phiếu công tác sửa chữa có tính chất kết hợp cả bảo hành lẫn sửa chữa tính phí:
* **Nếu `Loại linh kiện` là `Sửa chữa`**:
  * Áp dụng đầy đủ toàn bộ ràng buộc của linh kiện sửa chữa:
    $$\textbf{Xuất Sửa Chữa = 1}, \quad \textbf{Xuất Bảo Hành = "" (để trống)}$$
    * `Đơn giá` lấy từ `Số tiền phải thu`.
    * Phân bổ thực thu theo đối tượng: `TGDĐ` $\rightarrow$ `Công nợ`, `KL` $\rightarrow$ `Doanh thu tiền mặt`.
* **Nếu `Loại linh kiện` là `Bảo hành`** (hoặc `Bảo hành`):
  * Áp dụng đầy đủ toàn bộ ràng buộc của linh kiện bảo hành:
    $$\textbf{Xuất Bảo Hành = 1}, \quad \textbf{Xuất Sửa Chữa = "" (để trống)}$$
    * `Đơn giá` lấy từ `Số tiền phải thu` (thường là 0).
    * `Công nợ` = 0, `Doanh thu tiền mặt` = 0.

### Trường hợp 6.2: Các `Loại hình sửa chữa` khác (`Sửa chữa`, `Bảo hành`...)
* Nếu `Loại linh kiện` là **`Sửa chữa`**:
  $$\textbf{Xuất Sửa Chữa = 1}, \quad \textbf{Xuất Bảo Hành = "" (để trống)}$$
* Nếu `Loại linh kiện` là **`Bảo hành`** (hoặc `Bảo hành`):
  $$\textbf{Xuất Bảo Hành = 1}, \quad \textbf{Xuất Sửa Chữa = "" (để trống)}$$
* **Trường hợp còn lại**: Để trống luôn, tuyệt đối **không điền 0**.

---

## 7. CẤU TRÚC 19 CỘT DỮ LIỆU ĐẦU RA (GOOGLE SHEETS & BÁO CÁO)

1. `Mã TTBH`: Mã trung tâm (ví dụ: `R4001003`).
2. `Tên TTBH`: Tên chi nhánh (ví dụ: `Trung tâm CSKH vivo Cần Thơ`).
3. `Ngày báo cáo`: Ngày lấy máy chuẩn `YYYY-MM-DD`.
4. `Thời gian lấy máy`: Chuỗi nguyên gốc ngày giờ lấy máy.
5. `Số phiếu sửa chữa`: Lấy từ cột `Phiếu công tác sửa chữa`.
6. `Mã vật tư linh kiện`: Lấy từ cột `Mã linh kiện`.
7. `Tên vật tư`: Lấy từ cột `Tên linh kiện`.
8. `Đơn giá`: Tham chiếu từ `Số tiền phải thu`.
9. `Doanh thu tiền mặt`: Thực thu của Khách lẻ (KL).
10. `Công nợ`: Thực thu của Khách TGDĐ.
11. `Khách hàng`: `TGDĐ` hoặc `KL`.
12. `Phương thức thanh toán`: `CN` hoặc `TM`.
13. `Xuất Bảo Hành`: `1` hoặc để trống `""`.
14. `Xuất Sửa Chữa`: `1` hoặc để trống `""`.
15. `Loại hình đem đến sửa`: Chuỗi gốc từ file.
16. `Loại hình sửa chữa`: Chuỗi gốc từ file (`Bảo hành` / `Sửa chữa` / `Bảo hành + Sửa chữa`).
17. `Loại linh kiện`: Chuỗi gốc từ file (`Sửa chữa` / `Bảo hành`).
18. `Phương án giải quyết`: Chuỗi gốc từ file.
19. `Upload ID`: Mã phiên tải lên để truy vết và tránh trùng lặp.

---

## 8. BẢNG MINH CHỨNG ĐỐI SOÁT TRÊN FILE MẪU THỰC TẾ

*(Áp dụng trực tiếp trên file mẫu `D:\VN0000182_Bảng báo cáo truy vấn chi tiết phiếu công tác sửa chữa_2026-09-13 11_51_10 (1).xlsx`)*

| Quy tắc kiểm tra | Kết quả thực tế | Diễn giải |
| :--- | :---: | :--- |
| **Tổng số dòng đọc từ file raw** | **994** dòng | Dữ liệu đầu vào Sheet1 |
| **Dòng có Thời gian lấy máy hợp lệ** | **972** dòng | Đã ghi nhận cảnh báo 22 dòng chưa lấy máy |
| **Dòng có phát sinh Mã LK hoặc Tên LK** | **487** dòng | Giữ toàn bộ 487 dòng có linh kiện |
| **Dòng không có linh kiện bị bỏ qua** | **485** dòng | Các dòng chạy phần mềm, huỷ sửa, tư vấn thuần tuý |
| **Số dòng TGDĐ** | **326** dòng | Máy demo hoặc Chuỗi `+84 190*` / `+84 109*` / đuôi `464` / `460` |
| **Số dòng Khách lẻ (KL)** | **161** dòng | Khách hàng vãng lai |
| **Tổng Đơn giá (`Giá bán lẻ đề nghị`)** | **427,466,000 VNĐ** | Tham chiếu chuẩn 100% (+82,054,000 trị giá linh kiện BH) |
| **Tổng Tiền mặt KL (`Số tiền thực thu`)** | **112,330,400 VNĐ** | Tiền mặt thực thu của KL |
| **Tổng Công nợ TGDĐ (`Số tiền thực thu`)**| **194,912,100 VNĐ** | Công nợ thực thu của TGDĐ |
| **Tổng thực thu (Tiền mặt + Công nợ)** | **307,242,500 VNĐ** | Doanh số thu được thực tế |
| **Tổng Xuất Bảo Hành** | **73** | Cột `Loại linh kiện` = `Bảo hành` (điền 1, SC để trống) |
| **Tổng Xuất Sửa Chữa** | **414** | Cột `Loại linh kiện` = `Sửa chữa` (điền 1, BH để trống) |

---

## 9. CÁC TÌNH HUỐNG MINH HỌA ĐIỂN HÌNH (CASE STUDIES)

### 1. Phiếu kết hợp `Bảo hành + Sửa chữa` (`MWR4001003260729000007`):
Phiếu này có 2 dòng linh kiện xuất hiện trong file:
* **Dòng 193** (`Loại linh kiện = 'Bảo hành'`):
  * `Tên linh kiện`: PCB bán thành phẩm V60 Lite 5G Bo mạch...
  * `Giá bán lẻ đề nghị`: 4,443,000 VNĐ $\rightarrow$ `Đơn giá` = **4,443,000 VNĐ** *(theo Phương án 2)*.
  * `Số tiền thực thu`: 0 $\rightarrow$ `Công nợ` = **0 VNĐ**, `Doanh thu tiền mặt` = **0 VNĐ**.
  * Xuất kho: **`Xuất Bảo Hành = 1`, `Xuất Sửa Chữa = ""` (để trống)**.
* **Dòng 196** (`Loại linh kiện = 'Sửa chữa'`):
  * `Tên linh kiện`: Màn hình lắp ráp V60 Lite 5G...
  * `Giá bán lẻ đề nghị`: 1,789,000 VNĐ $\rightarrow$ `Đơn giá` = **1,789,000 VNĐ**.
  * `Số tiền thực thu`: 1,789,000 VNĐ $\rightarrow$ `Công nợ` = **1,789,000 VNĐ**, `Doanh thu tiền mặt` = **0 VNĐ**.
  * Xuất kho: **`Xuất Sửa Chữa = 1`, `Xuất Bảo Hành = ""` (để trống)**.

### 2. Phiếu bảo hành bo mạch (`MWR4001003260826000004`):
* `Loại linh kiện`: **`Bảo hành`** $\rightarrow$ **`Xuất Bảo Hành = 1`, `Xuất Sửa Chữa = ""` (để trống)**.
* `Tên linh kiện`: PCB bán thành phẩm V60 Lite 5G...
* `Giá bán lẻ đề nghị`: 4,443,000 VNĐ $\rightarrow$ **`Đơn giá = 4,443,000 VNĐ`**.
* `Số tiền thực thu`: 0 $\rightarrow$ `Công nợ` = **0 VNĐ**, `Doanh thu tiền mặt` = **0 VNĐ**.

### 3. Phiếu Kênh chuỗi gõ nhầm đầu số (`MWR4001003260829000011`):
* `Số điện thoại người đem đến sửa`: `+84 109*****464` (nhân viên gõ nhầm `109` thay vì `190`, có đuôi `464`).
* Phân loại: **`TGDĐ`** và **`CN`** *(theo Phương án B)*.
* **Dòng linh kiện sửa chữa** (`Loại linh kiện = 'Sửa chữa'`, Khung Y04):
  * `Giá bán lẻ đề nghị`: 173,000 VNĐ $\rightarrow$ `Đơn giá` = **173,000 VNĐ**.
  * `Số tiền thực thu`: 173,000 VNĐ $\rightarrow$ `Công nợ` = **173,000 VNĐ**, `Doanh thu tiền mặt` = **0 VNĐ**.
  * Xuất kho: **`Xuất Sửa Chữa = 1`, `Xuất Bảo Hành = ""` (để trống)**.
* **Dòng linh kiện bảo hành** (`Loại linh kiện = 'Bảo hành'`, Màn hình Y04):
  * `Giá bán lẻ đề nghị`: 645,000 VNĐ $\rightarrow$ `Đơn giá` = **645,000 VNĐ** *(theo Phương án 2)*.
  * `Số tiền thực thu`: 0 $\rightarrow$ `Công nợ` = **0 VNĐ**, `Doanh thu tiền mặt` = **0 VNĐ**.
  * Xuất kho: **`Xuất Bảo Hành = 1`, `Xuất Sửa Chữa = ""` (để trống)**.

### 4. Phiếu bảo hành bo mạch Y04 (`MWR4001003260829000016`):
* `Loại linh kiện`: **`Bảo hành`** $\rightarrow$ **`Xuất Bảo Hành = 1`, `Xuất Sửa Chữa = ""` (để trống)**.
* `Tên linh kiện`: Bảng bán sản phẩm PCB Y04 M PD2442DF...
* `Giá bán lẻ đề nghị`: 1,401,000 VNĐ $\rightarrow$ **`Đơn giá = 1,401,000 VNĐ`** *(theo Phương án 2)*.
* `Số tiền thực thu`: 0 $\rightarrow$ `Công nợ` = **0 VNĐ**, `Doanh thu tiền mặt` = **0 VNĐ**.

### 5. Phiếu TGDĐ bảo hành màn hình và bo mạch (`MWR4001003260819000002` & `MWR4001003260819000005`):
* **Phiếu `MWR4001003260819000002`** (Lắp ráp hiển thị Y19s Pro):
  * Khách hàng: **`TGDĐ`** | PTTT: **`CN`**.
  * Ghi chú sửa chữa: `K.TRA MÁY SỌC MH > MÁY CÒN GIA HẠN BH 2026-12-15 > BHMH` (Bảo hành màn hình).
  * `Giá bán lẻ đề nghị`: 788,000 VNĐ $\rightarrow$ `Đơn giá` = **788,000 VNĐ**.
  * `Số tiền thực thu`: 0 $\rightarrow$ Cột `Công nợ`: **Bắt buộc điền rõ số `0`** (không để dấu gạch ngang hay trống). Cột `Tiền mặt TM`: để dấu **`-`**.
* **Phiếu `MWR4001003260819000005`** (PCB bán thành phẩm V60 Lite 5G):
  * Khách hàng: **`TGDĐ`** | PTTT: **`CN`** | `Loại linh kiện`: **`Bảo hành`**.
  * `Giá bán lẻ đề nghị`: 4,443,000 VNĐ $\rightarrow$ `Đơn giá` = **4,443,000 VNĐ**.
  * `Số tiền thực thu`: 0 $\rightarrow$ Cột `Công nợ`: **Bắt buộc điền rõ số `0`** (không để dấu gạch ngang hay trống). Cột `Tiền mặt TM`: để dấu **`-`**.

---

## 10. QUY TẮC NHẬN DIỆN & BÔI VÀNG NGUYÊN DÒNG CHO MÁY BẢO HIỂM NGOÀI

Nhằm giúp TTBH dễ dàng phân biệt các trường hợp máy của đối tác bảo hiểm bên ngoài với khách lẻ thông thường:

* **Điều kiện nhận diện**:
  * Cột `Loại hình đem đến sửa` chứa cụm từ: **`Công ty bảo hiểm bên ngoài đem đến sửa`**.
* **Quy chuẩn trực quan trên Bảng Báo Cáo (UI)**:
  1. **Bôi vàng toàn bộ nguyên dòng (Full Row Highlight)**:
     * Toàn bộ hàng dữ liệu được bôi màu vàng cảnh báo (`bg-amber-100/90 hover:bg-amber-200/80 border-b border-amber-300/80`), giúp người dùng nhận diện ngay lập tức mà không làm rối mắt.
     * Cột `Số Phiếu Sửa Chữa` in đậm màu hổ phách (`font-bold text-amber-950`) kèm tooltip khi rê chuột.
  2. **Dòng chú thích (Legend Banner) ở trên cùng**:
     * Đặt ngay phía trên bảng:
       > ⚠️ **Chú thích:** Dòng được bôi vàng là máy của **Công ty bảo hiểm bên ngoài đem đến sửa**.
     * Kèm badge đếm tổng số dòng máy bảo hiểm ngoài có trong đợt báo cáo.
  3. **Không chèn thêm chữ ở ô Khách Hàng**:
     * Ô *Khách Hàng* vẫn giữ nguyên badge **`KL`** gọn gàng, không để thêm chữ `BH` hay nhãn phụ gây chật chội ô.
  4. **Bộ lọc nhanh (Quick Filter)**:
     * Bộ lọc Khách Hàng tích hợp thêm tùy chọn: `Công ty bảo hiểm ngoài`.
     * Thanh tìm kiếm hỗ trợ tra cứu ngay bằng từ khóa `"bảo hiểm"`.
  5. **Quy tắc phân loại tài chính**:
     * Vì đây không phải máy demo hay kênh chuỗi Thế Giới Di Động, các máy bảo hiểm ngoài được xếp vào nhóm `Khách hàng: KL` và `Phương thức thanh toán: TM`.

