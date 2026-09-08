"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ReportItem {
  id: string;
  filename?: string;
  created_at?: string;
  extracted_data?: Record<string, string>;
  [key: string]: unknown;
}

const BACKEND_URL = "https://ocr-backend-288651941478.asia-northeast1.run.app";

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReports() {
      try {
        const res = await fetch(`${BACKEND_URL}/reports`);
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.detail || `サーバーエラー (ステータス: ${res.status})`
          );
        }

        const data = await res.json();
        setReports(data.reports || []);
      } catch (err) {
        if (err instanceof Error) {
          setErrorDetail(err.message);
        } else {
          setErrorDetail("データの取得中に不明なエラーが発生しました。");
        }
      } finally {
        setLoading(false);
      }
    }
    fetchReports();
  }, []);

  return (
    <main className="max-w-4xl mx-auto p-8 min-h-screen bg-slate-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">解析済みレポート一覧</h1>
        <Link
          href="/"
          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium rounded-md transition-colors"
        >
          ← アップロードページへ戻る
        </Link>
      </div>

      {loading && (
        <div className="p-4 bg-white rounded border border-slate-200 text-slate-500">
          データを読み込み中...
        </div>
      )}

      {errorDetail && (
        <div className="p-4 bg-red-50 text-red-700 rounded-md border border-red-200 space-y-2">
          <p className="font-bold">エラーが発生しました:</p>
          <p className="font-mono text-sm bg-red-100 p-2 rounded">{errorDetail}</p>
        </div>
      )}

      {!loading && !errorDetail && reports.length === 0 && (
        <div className="p-4 bg-white rounded border border-slate-200 text-slate-500">
          保存されたレポートはありません。
        </div>
      )}

      {!loading && !errorDetail && reports.length > 0 && (
        <div className="space-y-4">
          {reports.map((item) => (
            <div key={item.id} className="border rounded-lg p-4 bg-white shadow-sm space-y-2">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-semibold text-slate-800">
                  {item.filename || "名称未設定"}
                </span>
                <span className="text-xs font-mono text-slate-400">ID: {item.id}</span>
              </div>
              
              <pre className="bg-slate-50 p-3 rounded text-xs font-mono text-slate-700 overflow-x-auto">
                {JSON.stringify(item, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

