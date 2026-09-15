export interface ServiceCenter {
  code: string;
  name: string;
}

export const SERVICE_CENTERS: Record<string, string> = {
  "R4001001": "Trung tâm CSKH vivo HCM Hòa Bình",
  "R4001002": "Trung tâm CSKH vivo Hà Nội",
  "R4001003": "Trung tâm CSKH vivo Cần Thơ",
  "R4001005": "Trung tâm CSKH vivo Hải Phòng",
  "R4001007": "Trung tâm CSKH vivo HCM Phú Lợi",
  "R4001008": "Trung tâm CSKH vivo Đà Nẵng",
  "R4001009": "Trung tâm CSKH vivo Đồng Tháp",
  "R4001010": "Trung tâm CSKH vivo Nghệ An",
  "R4001011": "Trung tâm CSKH vivo Đắk Lắk",
  "R4001012": "Trung tâm CSKH vivo Cà Mau",
  "R4001015": "Trung tâm CSKH vivo Phú Thọ",
  "R4001017": "Trung tâm CSKH vivo HCM Xuân Hòa",
  "R4001021": "Trung tâm CSKH vivo Đồng Nai",
  "R4001023": "Trung tâm CSKH vivo Gia Lai",
  "R4001026": "Trung tâm CSKH vivo HCM An Khánh"
};

export function getCenterName(code: string): string {
  return SERVICE_CENTERS[code] || `TTBH ${code}`;
}

export function isValidCenterCode(code: string): boolean {
  return Boolean(SERVICE_CENTERS[code]);
}

export function getAllCenters(): ServiceCenter[] {
  return Object.entries(SERVICE_CENTERS).map(([code, name]) => ({ code, name }));
}
