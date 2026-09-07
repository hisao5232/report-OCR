// ~/report-ocr/frontend/app/reports/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ReportItem {
  id: string;
  filename: string;
  created_at?: string;
  extracted_data: Record<string, string>;
}

const BACKEND_URL = "https://ocr-backend-288651941478.asia-northeast1.run.app";

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReports() {
      try {
        const res = await fetch(`${BACKEND_URL}/reports`);
        if (res.ok) {
          const data = await res.json();
          setReports(data.reports || []);
        }
      } catch (err) {
        console.error("データの取得に失敗しました", err);
      } finally {
        setLoading(false);
      }
    }
    fetchReports();
  }, []);

  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">解析済みレポート一覧</h1>
        <Link
          href="/"
          className="text-blue-600 hover:underline flex items-center gap-1"
        >
          ← アップロードページへ戻る
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">データを読み込み中...</p>
      ) : reports.length === 0 ? (
        <p className="text-gray-500">保存されたレポートはありません。</p>
      ) : (
        <div className="space-y-4">
          {reports.map((item) => (
            <div key={item.id} className="border rounded-lg p-4 bg-white shadow-sm">
              <div className="flex justify-between items-center mb-2 pb-2 border-b">
                <span className="font-semibold text-gray-800">{item.filename}</span>
                <span className="text-xs text-gray-500">{item.id}</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {Object.entries(item.extracted_data || {}).map(([key, value]) => (
                  <div key={key} className="bg-gray-50 p-2 rounded">
                    <span className="text-gray-500 block text-xs">{key}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
