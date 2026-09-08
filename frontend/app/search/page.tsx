"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

interface ReportItem {
  id: string;
  filename?: string;
  created_at?: string;
  extracted_data?: {
    日報No?: string;
    得意先?: string;
    機械名?: string;
    管理番号?: string;
    アワーメーター?: string;
    修理担当?: string;
    修理内容?: string;
    請求金額?: string;
    使用部品?: Array<Record<string, unknown>> | string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const BACKEND_URL = "https://ocr-backend-288651941478.asia-northeast1.run.app";

export default function SearchPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // データ取得
  async function fetchReports() {
    setLoading(true);
    setErrorDetail(null);
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
        setErrorDetail("データの取得中にエラーが発生しました。");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReports();
  }, []);

  // 検索フィルター処理（キーワードが含まれるものを抽出）
  const filteredReports = useMemo(() => {
    if (!searchQuery.trim()) return reports;

    const query = searchQuery.toLowerCase();
    return reports.filter((item) => {
      const jsonString = JSON.stringify(item).toLowerCase();
      return jsonString.includes(query);
    });
  }, [reports, searchQuery]);

  return (
    <main className="max-w-5xl mx-auto p-6 min-h-screen bg-slate-50">
      {/* ヘッダーエリア */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">レポート検索・データベース</h1>
          <p className="text-sm text-slate-500">保存された手書き日報・修理報告書を検索できます</p>
        </div>
        <Link
          href="/"
          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium rounded-md transition-colors"
        >
          ← トップページへ戻る
        </Link>
      </div>

      {/* 検索ボックス */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="得意先、機械名、修理担当、日報No、部品名などで検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full p-3 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
        />
        {searchQuery && (
          <p className="mt-2 text-xs text-slate-500">
            「{searchQuery}」の検索結果: {filteredReports.length} 件
          </p>
        )}
      </div>

      {/* ローディング / エラー表示 */}
      {loading && (
        <div className="p-8 text-center text-slate-500 bg-white rounded-lg border">
          データを読み込み中...
        </div>
      )}

      {errorDetail && (
        <div className="p-4 bg-red-50 text-red-700 rounded-md border border-red-200">
          <p className="font-bold">エラーが発生しました:</p>
          <p className="font-mono text-sm bg-red-100 p-2 rounded mt-1">{errorDetail}</p>
        </div>
      )}

      {/* 検索結果一覧 */}
      {!loading && !errorDetail && filteredReports.length === 0 && (
        <div className="p-8 text-center text-slate-500 bg-white rounded-lg border">
          該当するレポートが見つかりませんでした。
        </div>
      )}

      {!loading && !errorDetail && filteredReports.length > 0 && (
        <div className="space-y-4">
          {filteredReports.map((item) => {
            const data = item.extracted_data || {};
            return (
              <div
                key={item.id}
                className="p-5 bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow transition-shadow space-y-3"
              >
                <div className="flex justify-between items-start border-b pb-3">
                  <div>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 mr-2">
                      {data.日報No ? `No. ${data.日報No}` : "日報Noなし"}
                    </span>
                    <span className="text-lg font-bold text-slate-800">
                      {data.得意先 || "得意先未設定"}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {item.created_at ? new Date(item.created_at).toLocaleString("ja-JP") : ""}
                  </span>
                </div>

                {/* 主な項目のカード表示 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-slate-50 p-3 rounded-md">
                  <div>
                    <span className="text-xs text-slate-400 block">機械名</span>
                    <span className="font-medium text-slate-700">{data.機械名 || "-"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">管理番号</span>
                    <span className="font-medium text-slate-700">{data.管理番号 || "-"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">修理担当</span>
                    <span className="font-medium text-slate-700">{data.修理担当 || "-"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">請求金額</span>
                    <span className="font-medium text-slate-700">{data.請求金額 || "-"}</span>
                  </div>
                </div>

                {data.修理内容 && (
                  <div className="text-sm">
                    <span className="text-xs text-slate-400 block">修理内容</span>
                    <p className="text-slate-800 font-medium">{data.修理内容}</p>
                  </div>
                )}

                {/* 生データ確認用の折りたたみ */}
                <details className="text-xs text-slate-500 pt-2 border-t">
                  <summary className="cursor-pointer hover:text-slate-700 font-medium">
                    詳細JSONデータを表示
                  </summary>
                  <pre className="mt-2 bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto font-mono">
                    {JSON.stringify(item, null, 2)}
                  </pre>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
