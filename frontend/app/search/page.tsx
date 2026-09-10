"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

interface ReportItem {
  id: string;
  filename?: string;
  created_at?: string;
  extracted_data?: Record<string, unknown>;
  [key: string]: unknown;
}

const BACKEND_URL = "https://ocr-backend-288651941478.asia-northeast1.run.app";

// 日付文字列を YYYY-MM-DD 形式に正規化するヘルパー関数
function parseToDateString(val: unknown): string | null {
  if (!val || typeof val !== "string") return null;
  
  // 「2026年03月01日」などの日本語表記をハイフン区切りに置換
  const normalized = val
    .trim()
    .replace(/[年/]/g, "-")
    .replace(/[月]/g, "-")
    .replace(/[日]/g, "");

  const dateMatch = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!dateMatch) return null;

  const year = dateMatch[1];
  const month = dateMatch[2].padStart(2, "0");
  const day = dateMatch[3].padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function SearchPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  // 検索条件ステート
  const [matchMode, setMatchMode] = useState<"AND" | "OR">("AND");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reportNo, setReportNo] = useState("");
  const [customer, setCustomer] = useState("");
  const [machineName, setMachineName] = useState("");
  const [managementNo, setManagementNo] = useState("");
  const [staff, setStaff] = useState("");
  const [content, setContent] = useState("");
  const [partName, setPartName] = useState("");

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

  // 検索リセット処理
  function handleReset() {
    setStartDate("");
    setEndDate("");
    setReportNo("");
    setCustomer("");
    setMachineName("");
    setManagementNo("");
    setStaff("");
    setContent("");
    setPartName("");
    setMatchMode("AND");
  }

  // 高度なフィルター処理
  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      const data = item.extracted_data || {};

      // 1. 日付期間フィルターの判定
      let passDateFilter = true;
      if (startDate || endDate) {
        // extracted_data内の日付関連フィールドを探す（日付, 発行日, 受付日など）
        const rawDateVal =
          data["日付"] ||
          data["発行日"] ||
          data["受付日"] ||
          data["作業日"] ||
          item.created_at;

        const formattedDate = parseToDateString(rawDateVal);

        if (!formattedDate) {
          passDateFilter = false;
        } else {
          if (startDate && formattedDate < startDate) passDateFilter = false;
          if (endDate && formattedDate > endDate) passDateFilter = false;
        }
      }

      // 2. 各テキスト検索項目の判定リストを作成
      const conditions: { query: string; value: string }[] = [
        {
          query: reportNo,
          value: String(data["日報No"] || data["修理受品書No"] || data["伝票番号"] || ""),
        },
        {
          query: customer,
          value: String(data["得意先"] || data["顧客名"] || ""),
        },
        {
          query: machineName,
          value: String(data["機械名"] || data["型式"] || ""),
        },
        {
          query: managementNo,
          value: String(data["管理番号"] || data["機番"] || data["シリアルNo"] || ""),
        },
        {
          query: staff,
          value: String(data["修理担当"] || data["担当者"] || ""),
        },
        {
          query: content,
          value: String(data["修理内容"] || data["作業概要"] || data["不具合内容"] || ""),
        },
        {
          query: partName,
          value: JSON.stringify(data["使用部品"] || data["部品名"] || ""),
        },
      ];

      // 入力がある検索条件のみ抽出
      const activeConditions = conditions.filter((c) => c.query.trim() !== "");

      // テキスト検索条件が何も入力されていない場合、日付条件だけで判定
      if (activeConditions.length === 0) {
        return passDateFilter;
      }

      // AND / OR の論理判定
      const textMatches = activeConditions.map((c) =>
        c.value.toLowerCase().includes(c.query.trim().toLowerCase())
      );

      if (matchMode === "AND") {
        return passDateFilter && textMatches.every(Boolean);
      } else {
        // OR 検索の場合：日付条件を満たしつつ、どれか一つでもテキスト条件が合致すればOK
        return passDateFilter && textMatches.some(Boolean);
      }
    });
  }, [
    reports,
    startDate,
    endDate,
    reportNo,
    customer,
    machineName,
    managementNo,
    staff,
    content,
    partName,
    matchMode,
  ]);

  return (
    <main className="max-w-5xl mx-auto p-6 min-h-screen bg-slate-50">
      {/* ヘッダーエリア */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">レポート検索・データベース</h1>
          <p className="text-sm text-slate-500">条件を指定して手書き日報・修理報告書を検索できます</p>
        </div>
        <Link
          href="/"
          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium rounded-md transition-colors"
        >
          ← トップページへ戻る
        </Link>
      </div>

      {/* 検索パネル */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm mb-6 space-y-4">
        <div className="flex flex-wrap justify-between items-center border-b pb-3 gap-2">
          <span className="font-bold text-slate-700">検索条件の指定</span>
          
          {/* AND / OR 切り替え */}
          <div className="flex items-center space-x-4">
            <span className="text-xs font-medium text-slate-500">条件の組み合わせ:</span>
            <label className="inline-flex items-center cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="radio"
                name="matchMode"
                value="AND"
                checked={matchMode === "AND"}
                onChange={() => setMatchMode("AND")}
                className="mr-1 text-blue-600 focus:ring-blue-500"
              />
              AND 検索 (全て一致)
            </label>
            <label className="inline-flex items-center cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="radio"
                name="matchMode"
                value="OR"
                checked={matchMode === "OR"}
                onChange={() => setMatchMode("OR")}
                className="mr-1 text-blue-600 focus:ring-blue-500"
              />
              OR 検索 (いずれか一致)
            </label>
          </div>
        </div>

        {/* 日付（期間指定） */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            対象日付 (期間指定)
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="p-2 border rounded-md text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <span className="text-slate-400">〜</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="p-2 border rounded-md text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        {/* テキスト入力項目グリッド */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              修理受品書No. / 日報No.
            </label>
            <input
              type="text"
              placeholder="例: 12345"
              value={reportNo}
              onChange={(e) => setReportNo(e.target.value)}
              className="w-full p-2 border rounded-md text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              得意先名
            </label>
            <input
              type="text"
              placeholder="例: ○○建設"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="w-full p-2 border rounded-md text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              機械名
            </label>
            <input
              type="text"
              placeholder="例: 油圧ショベル"
              value={machineName}
              onChange={(e) => setMachineName(e.target.value)}
              className="w-full p-2 border rounded-md text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              管理番号
            </label>
            <input
              type="text"
              placeholder="例: A-101"
              value={managementNo}
              onChange={(e) => setManagementNo(e.target.value)}
              className="w-full p-2 border rounded-md text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              修理担当者
            </label>
            <input
              type="text"
              placeholder="例: 山田"
              value={staff}
              onChange={(e) => setStaff(e.target.value)}
              className="w-full p-2 border rounded-md text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              品名・部品名
            </label>
            <input
              type="text"
              placeholder="例: オイルエレメント"
              value={partName}
              onChange={(e) => setPartName(e.target.value)}
              className="w-full p-2 border rounded-md text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        {/* 修理内容・作業概要 (幅広) */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            修理内容・作業概要
          </label>
          <input
            type="text"
            placeholder="例: オイル漏れ修理・ホース交換"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full p-2 border rounded-md text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* リセットボタンと結果件数 */}
        <div className="flex justify-between items-center pt-2 border-t">
          <button
            onClick={handleReset}
            className="text-xs text-slate-500 hover:text-slate-800 underline transition-colors"
          >
            検索条件をクリア
          </button>
          <span className="text-sm font-semibold text-blue-600">
            検索結果: {filteredReports.length} 件
          </span>
        </div>
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
            const data = (item.extracted_data || {}) as Record<string, unknown>;
            return (
              <div
                key={item.id}
                className="p-5 bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow transition-shadow space-y-3"
              >
                <div className="flex justify-between items-start border-b pb-3">
                  <div>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 mr-2">
                      {String(data["日報No"] || data["修理受品書No"] || "No.なし")}
                    </span>
                    <span className="text-lg font-bold text-slate-800">
                      {String(data["得意先"] || "得意先未設定")}
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
                    <span className="font-medium text-slate-700">
                      {String(data["機械名"] || "-")}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">管理番号</span>
                    <span className="font-medium text-slate-700">
                      {String(data["管理番号"] || "-")}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">修理担当</span>
                    <span className="font-medium text-slate-700">
                      {String(data["修理担当"] || "-")}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">請求金額</span>
                    <span className="font-medium text-slate-700">
                      {String(data["請求金額"] || "-")}
                    </span>
                  </div>
                </div>

                {Boolean(data["修理内容"]) && (
                  <div className="text-sm">
                    <span className="text-xs text-slate-400 block">修理内容</span>
                    <p className="text-slate-800 font-medium">{String(data["修理内容"])}</p>
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
