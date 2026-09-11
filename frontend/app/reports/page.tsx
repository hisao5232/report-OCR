"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface ReportItem {
  id: string;
  filename?: string;
  status?: "processing" | "completed" | "failed";
  created_at?: string;
  extracted_data?: Record<string, unknown>;
  error_message?: string;
  raw_text?: string;
  [key: string]: unknown;
}

const BACKEND_URL = "https://ocr-backend-288651941478.asia-northeast1.run.app";

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // モーダル・編集状態用
  const [editingReport, setEditingReport] = useState<ReportItem | null>(null);
  const [jsonInput, setJsonInput] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchReports = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
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
        setErrorDetail("データの取得中に不明なエラーが発生しました。");
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // processing 状態のアイテムがある場合は5秒ごとにポーリング
  useEffect(() => {
    const hasProcessing = reports.some((r) => r.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchReports(true); // バックグラウンドで静かに再取得
    }, 5000);

    return () => clearInterval(interval);
  }, [reports, fetchReports]);

  // 削除処理
  async function handleDelete(id: string, filename?: string) {
    const confirmMessage = filename
      ? `「${filename}」を削除してもよろしいですか？`
      : "このデータを削除してもよろしいですか？";

    if (!window.confirm(confirmMessage)) return;

    setDeletingId(id);
    try {
      const res = await fetch(`${BACKEND_URL}/reports/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.detail || `削除に失敗しました (ステータス: ${res.status})`
        );
      }

      setReports((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "削除中にエラーが発生しました。");
    } finally {
      setDeletingId(null);
    }
  }

  // 編集モーダルを開く
  function openEditModal(report: ReportItem) {
    setEditingReport(report);
    const initialData = report.extracted_data || {};
    setJsonInput(JSON.stringify(initialData, null, 2));
    setJsonError(null);
  }

  // 編集モーダルを閉じる
  function closeEditModal() {
    setEditingReport(null);
    setJsonInput("");
    setJsonError(null);
  }

  // 更新処理
  async function handleUpdate() {
    if (!editingReport) return;
    setJsonError(null);

    let parsedData: Record<string, unknown>;
    try {
      parsedData = JSON.parse(jsonInput);
      if (typeof parsedData !== "object" || parsedData === null || Array.isArray(parsedData)) {
        throw new Error("JSONオブジェクト形式で入力してください。");
      }
    } catch (err) {
      setJsonError(
        err instanceof Error ? `JSON形式が無効です: ${err.message}` : "JSON形式が無効です。"
      );
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/reports/${editingReport.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extracted_data: parsedData,
          raw_text: editingReport.raw_text ?? null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.detail || `更新に失敗しました (ステータス: ${res.status})`
        );
      }

      setReports((prev) =>
        prev.map((item) =>
          item.id === editingReport.id
            ? { ...item, extracted_data: parsedData }
            : item
        )
      );

      closeEditModal();
    } catch (err) {
      setJsonError(
        err instanceof Error ? err.message : "更新中にエラーが発生しました。"
      );
    } finally {
      setIsSaving(false);
    }
  }

  // ステータス表示バッジの描画
  const renderStatusBadge = (status?: string) => {
    switch (status) {
      case "processing":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 animate-pulse">
            🟡 解析中...
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
            🔴 解析失敗
          </span>
        );
      case "completed":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            🟢 解析完了
          </span>
        );
    }
  };

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
            <div key={item.id} className="border rounded-lg p-4 bg-white shadow-sm space-y-3">
              <div className="flex justify-between items-center border-b pb-2">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-800 text-lg">
                    {item.filename || "名称未設定"}
                  </span>
                  {renderStatusBadge(item.status)}
                  <span className="text-xs font-mono text-slate-400">ID: {item.id}</span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => openEditModal(item)}
                    disabled={item.status === "processing"}
                    className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 text-xs font-medium rounded transition-colors disabled:opacity-50"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDelete(item.id, item.filename)}
                    disabled={deletingId === item.id}
                    className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-medium rounded transition-colors disabled:opacity-50"
                  >
                    {deletingId === item.id ? "削除中..." : "削除"}
                  </button>
                </div>
              </div>

              {/* ステータスに応じた本文表示 */}
              {item.status === "processing" && (
                <div className="p-4 bg-amber-50 text-amber-800 rounded text-sm flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-amber-600" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Geminiで解析処理を実行中です。完了するまで自動で更新を監視します...</span>
                </div>
              )}

              {item.status === "failed" && (
                <div className="p-4 bg-red-50 text-red-800 rounded text-sm space-y-1">
                  <p className="font-bold">解析中にエラーが発生しました。</p>
                  {item.error_message && (
                    <p className="font-mono text-xs text-red-600">{item.error_message}</p>
                  )}
                </div>
              )}

              {(item.status === "completed" || !item.status) && (
                <pre className="bg-slate-50 p-3 rounded text-xs font-mono text-slate-700 overflow-x-auto max-h-60">
                  {JSON.stringify(item, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 編集モーダル */}
      {editingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">
                JSONデータの編集 ({editingReport.filename || editingReport.id})
              </h2>
              <button
                onClick={closeEditModal}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <p className="text-xs text-slate-500">
                抽出データ（<code className="font-mono">extracted_data</code>）のキーと値をJSON形式で編集してください。
              </p>

              {jsonError && (
                <div className="p-3 bg-red-50 text-red-700 rounded text-xs border border-red-200">
                  {jsonError}
                </div>
              )}

              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                rows={12}
                className="w-full font-mono text-xs p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-900 text-slate-100"
                spellCheck={false}
              />
            </div>

            <div className="px-6 py-4 border-t bg-slate-50 flex justify-end space-x-3">
              <button
                onClick={closeEditModal}
                disabled={isSaving}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleUpdate}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {isSaving ? "保存中..." : "保存する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
