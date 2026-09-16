export interface N8nImportResponse {
  success: boolean;
  error?: string;
  center?: {
    code: string;
    name: string;
  };
  inputRows?: number;
  filteredBySolution?: number;
  validRows?: number;
  warningRows?: number;
  tgddRows?: number;
  klRows?: number;
  availableReportDates?: string[];
  latestReportDate?: string;
}

function getRequiredEnv(key: string): string {
  const val = process.env[key];
  if (!val || !val.trim()) {
    throw new Error(`Cấu hình hệ thống thiếu biến môi trường bắt buộc: ${key}. Vui lòng kiểm tra file .env.local hoặc biến môi trường VPS.`);
  }
  return val.trim();
}

export async function forwardImportToN8n(
  fileBuffer: Buffer,
  fileName: string,
  centerCode: string,
  centerName: string,
  uploadId: string,
  mode: 'upsert' | 'replace' = 'upsert',
  items?: any[]
): Promise<N8nImportResponse> {
  const webhookUrl = getRequiredEnv('N8N_IMPORT_WEBHOOK_URL');
  const secret = getRequiredEnv('N8N_WEBHOOK_SECRET');

  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(fileBuffer)]), fileName);
  formData.append('center_code', centerCode);
  formData.append('center_name', centerName);
  formData.append('upload_id', uploadId);
  formData.append('mode', mode);
  if (items && items.length > 0) {
    formData.append('items_json', JSON.stringify(items));
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'X-Workflow-Secret': secret
      },
      body: formData
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        success: false,
        error: `n8n webhook error (${res.status}): ${errorText.substring(0, 300)}`
      };
    }

    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: `Không thể kết nối tới n8n VPS (${webhookUrl}): ${err.message}`
    };
  }
}

export async function queryDataFromN8n(centerCode: string, reportDate: string) {
  const webhookUrl = getRequiredEnv('N8N_QUERY_WEBHOOK_URL');
  const secret = getRequiredEnv('N8N_WEBHOOK_SECRET');

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workflow-Secret': secret
    },
    body: JSON.stringify({ center_code: centerCode, report_date: reportDate })
  });

  if (!res.ok) {
    throw new Error(`n8n query failed: ${await res.text()}`);
  }

  return res.json();
}

export async function exportBaoCaoToN8n(
  centerCode: string, 
  reportDate: string,
  sheetUrl?: string,
  spreadsheetId?: string,
  items?: any[],
  targetSheet?: string
) {
  const webhookUrl = getRequiredEnv('N8N_EXPORT_WEBHOOK_URL');
  const secret = getRequiredEnv('N8N_WEBHOOK_SECRET');

  const defaultMonthYear = (() => {
    const d = reportDate && reportDate !== 'ALL' ? reportDate.split('-') : [];
    if (d.length >= 2) return `${d[1]}-${d[0]}`;
    return `${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date().getFullYear()}`;
  })();

  const sheetName = targetSheet || defaultMonthYear;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workflow-Secret': secret
    },
    body: JSON.stringify({ 
      center_code: centerCode, 
      report_date: reportDate,
      sheet_url: sheetUrl || '',
      sheetUrl: sheetUrl || '',
      spreadsheet_id: spreadsheetId || '',
      spreadsheetId: spreadsheetId || '',
      targetSheet: sheetName,
      target_sheet: sheetName,
      items: items || []
    })
  });

  if (!res.ok) {
    throw new Error(`n8n export failed: ${await res.text()}`);
  }

  return res.json();
}
