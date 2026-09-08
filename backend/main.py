import os
import json
import uuid
from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from google.cloud import firestore

app = FastAPI(
    title="Handwritten Report OCR Service (Gemini Powered)",
    version="2.0.0",
    description="Gemini 2.5 Flashを使用してPDF報告書を解析しFirestoreに保存するAPI",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------------------
# 環境変数の読み込み & GCP/Gemini クライアント初期化
# ------------------------------------------------------------------------------
PROJECT_ID = os.getenv("GCP_PROJECT_ID")
FIRESTORE_COLLECTION = os.getenv("FIRESTORE_COLLECTION", "handwritten_reports")

# Firestore クライアント
db_client = firestore.Client(project=PROJECT_ID) if PROJECT_ID else firestore.Client()

# Gemini API クライアント (環境変数 GEMINI_API_KEY を自動認識)
gemini_client = genai.Client()


# ------------------------------------------------------------------------------
# エンドポイント定義
# ------------------------------------------------------------------------------
@app.get("/healthz")
async def health_check():
    """Cloud Run ヘルスチェック用"""
    return {"status": "ok"}


@app.get("/reports")
async def get_reports():
    """Firestoreから保存済みレポート一覧を取得"""
    try:
        docs = db_client.collection(FIRESTORE_COLLECTION).stream()
        
        reports_list = []
        for doc in docs:
            data = doc.to_dict()
            data["id"] = doc.id
            
            # Timestamp や Datetime 型を JSON 変換可能な ISO 文字列に変換
            for k, v in list(data.items()):
                if hasattr(v, "isoformat"):
                    data[k] = v.isoformat()
                elif hasattr(v, "to_datetime"):
                    data[k] = v.to_datetime().isoformat()
            
            reports_list.append(data)
            
        reports_list.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return {"reports": reports_list}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch reports: {str(e)}"
        )


@app.delete("/reports/{report_id}")
async def delete_report(report_id: str):
    """指定されたIDのレポートをFirestoreから削除"""
    try:
        doc_ref = db_client.collection(FIRESTORE_COLLECTION).document(report_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定されたレポートが見つかりません。"
            )
            
        doc_ref.delete()
        return {"status": "success", "message": f"Report {report_id} deleted."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete report: {str(e)}"
        )


@app.post(
    "/upload-report",
    status_code=status.HTTP_201_CREATED,
)
async def upload_report(file: UploadFile = File(...)):
    """PDF報告書を受け取り、Gemini 2.5 Flashで高度OCR解析後、結果をFirestoreに保存する"""
    # 1. ファイル形式チェック
    if not file.filename.endswith(".pdf") and not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDFまたは画像形式のファイルのみ対応しています。",
        )

    try:
        pdf_content = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"ファイルの読み込みに失敗しました: {str(e)}",
        )

    # 2. Gemini 2.5 Flash API の呼び出し
    try:
        prompt = """
        添付された建設機械の修理報告書/日報から、手書き文字を含めて以下の項目を正確に読み取り、指定のJSONフォーマットで返してください。

        【抽出項目】
        - 日報No (例: A-101160)
        - 得意先 (例: 長嶋工業)
        - 機械名 (例: RX306)
        - 管理番号
        - アワーメーター
        - 修理担当 (例: 重松)
        - 修理内容 (例: 特定自主点検)
        - 請求金額
        - 使用部品 (品名、個数、仕入区分、金額などのリスト)

        【注意事項】
        - 略称や崩し文字（例: 「特自ン」→「特定自主点検」）は、文脈から正しい表記に補正して読み取ってください。
        - 該当する記載がない項目は null または空文字にしてください。
        """

        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(
                    data=pdf_content,
                    mime_type=file.content_type or "application/pdf",
                ),
                prompt,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )

        extracted_data = json.loads(response.text)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Geminiによる解析中にエラーが発生しました: {str(e)}",
        )

    # 3. Firestore 保存用ドキュメントデータの作成
    document_id = str(uuid.uuid4())
    firestore_payload = {
        "document_id": document_id,
        "filename": file.filename,
        "created_at": firestore.SERVER_TIMESTAMP,
        "extracted_data": extracted_data,
    }

    # 4. Firestore への保存
    try:
        doc_ref = db_client.collection(FIRESTORE_COLLECTION).document(document_id)
        doc_ref.set(firestore_payload)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Firestore へのデータ保存に失敗しました: {str(e)}",
        )

    # 5. レスポンス返却
    return {
        "status": "success",
        "document_id": document_id,
        "filename": file.filename,
        "extracted_data": extracted_data,
    }
    