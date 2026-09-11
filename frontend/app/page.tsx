"use client";
import { useState } from "react";
import Link from "next/link";

interface OcrAcceptedResponse {
  status: string;
  document_id: string;
  filename: string;
  message: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OcrAcceptedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(
        "https://ocr-backend-288651941478.asia-northeast1.run.app/upload-report",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`サーバーエラー: ${response.status}`);
      }

      const data: OcrAcceptedResponse = await response.json();
      setResult(data);
      setFile(null); // ファイル選択をリセット
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("アップロードに失敗しました。");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* ヘッダー部分 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              手書きレポート OCR解析
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Gemini 2.5 Flash を使用した高精度レポート解析システム
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/search"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors shadow-sm flex items-center gap-1.5"
            >
              🔍 データベース検索
            </Link>
            <Link
              href="/reports"
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-md transition-colors border border-slate-200"
            >
              保存済み一覧 →
            </Link>
          </div>
        </div>

        {/* ファイル選択フォーム */}
        <form
          onSubmit={handleSubmit}
          className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              解析する PDF または画像ファイルを選択
            </label>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
          </div>
          <button
            type="submit"
            disabled={!file || loading}
            className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-slate-300 transition-colors shadow-sm"
          >
            {loading ? "送信中..." : "ファイルをアップロードして解析開始"}
          </button>
        </form>

        {/* エラー表示 */}
        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-md border border-red-200 font-medium">
            {error}
          </div>
        )}

        {/* 受付完了メッセージ */}
        {result && (
          <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-lg space-y-4 text-emerald-900">
            <div className="flex items-center gap-2 font-bold text-lg text-emerald-800">
              <span>✅</span>
              <span>アップロードを受け付けました</span>
            </div>
            <p className="text-sm">
              ファイル「<strong>{result.filename}</strong>」の解析をバックグラウンドで開始しました。
            </p>
            <div className="pt-2 flex items-center justify-between border-t border-emerald-200">
              <span className="text-xs font-mono text-emerald-700">
                ドキュメントID: {result.document_id}
              </span>
              <Link
                href="/reports"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md transition-colors shadow-sm"
              >
                保存済み一覧で進捗を確認する →
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
