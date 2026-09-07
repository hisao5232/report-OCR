"use client";

import { useState } from "react";

interface OcrResponse {
  status: string;
  document_id: string;
  filename: string;
  fields_count: number;
  extracted_data: Record<string, string>;
  raw_fields: Array<{
    key: string;
    key_confidence: number;
    value: string;
    value_confidence: number;
  }>;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OcrResponse | null>(null);
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
      // Cloud Run のバックエンドURLを指定
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

      const data: OcrResponse = await response.json();
      setResult(data);
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
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">
          手書きレポート OCR 解析
        </h1>

        {/* ファイル選択フォーム */}
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              解析するPDFファイルを選択
            </label>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          <button
            type="submit"
            disabled={!file || loading}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-slate-300 transition-colors"
          >
            {loading ? "解析中 (Document AI)..." : "アップロードして解析"}
          </button>
        </form>

        {/* エラー表示 */}
        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-md border border-red-200">
            {error}
          </div>
        )}

        {/* 抽出結果表示 */}
        {result && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-lg font-semibold text-slate-800">
                解析結果 ({result.fields_count} 件検出)
              </h2>
              <span className="text-xs text-slate-400 font-mono">
                ID: {result.document_id}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(result.extracted_data).map(([key, value]) => (
                <div key={key} className="p-3 bg-slate-50 rounded border border-slate-100">
                  <div className="text-xs font-bold text-slate-500">{key}</div>
                  <div className="text-sm font-medium text-slate-800 mt-1 whitespace-pre-wrap">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
