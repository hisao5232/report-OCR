import os
import uuid
from typing import Any
from fastapi import FastAPI, File, HTTPException, UploadFile, status
from google.cloud import documentai_v1 as documentai
from google.cloud import firestore
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Handwritten Report OCR Service",
    version="1.0.0",
    description="Document AI Form Parserを使用してPDF報告書を解析しFirestoreに保存するAPI",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 開発時はすべてのオリジンからのアクセスを許可
    allow_credentials=True,
    allow_methods=["*"],  # POST, GET, OPTIONS などすべて許可
    allow_headers=["*"],  # すべてのヘッダーを許可
)

# ------------------------------------------------------------------------------
# 環境変数の読み込み & 定数定義
# ------------------------------------------------------------------------------
PROJECT_ID = os.getenv("GCP_PROJECT_ID")
# Document AI の Form Parser は通常 'us' または 'eu' のリージョンエンドポイントを使用します
LOCATION = os.getenv("GCP_LOCATION", "us")
PROCESSOR_ID = os.getenv("DOCUMENT_AI_PROCESSOR_ID")
FIRESTORE_COLLECTION = os.getenv(
    "FIRESTORE_COLLECTION", "handwritten_reports"
)

# 起動時の必須環境変数チェック
if not PROJECT_ID or not PROCESSOR_ID:
    raise RuntimeError(
        "必須の環境変数（GCP_PROJECT_ID, DOCUMENT_AI_PROCESSOR_ID）が設定されていません。"
    )

# ------------------------------------------------------------------------------
# GCP クライアント初期化
# ------------------------------------------------------------------------------
# Document AI クライアント（Locationに応じたエンドポイントを設定）
doc_ai_client_options = {
    "api_endpoint": f"{LOCATION}-documentai.googleapis.com"
}
doc_ai_client = documentai.DocumentProcessorServiceClient(
    client_options=doc_ai_client_options
)

# Firestore クライアント
db_client = firestore.Client(project=PROJECT_ID)


# ------------------------------------------------------------------------------
# レスポンス用 Pydantic モデル定義
# ------------------------------------------------------------------------------
class KeyValuePair(BaseModel):
    key: str
    key_confidence: float
    value: str
    value_confidence: float


class ProcessReportResponse(BaseModel):
    status: str
    document_id: str
    filename: str
    fields_count: int
    extracted_data: dict[str, str] = Field(
        ..., description="Key-Valueのマップ（簡易検索用）"
    )
    raw_fields: list[KeyValuePair] = Field(
        ..., description="信頼度付きの詳細なKey-Valueリスト"
    )


# ------------------------------------------------------------------------------
# ヘルパー関数: Document AI TextAnchor パース
# ------------------------------------------------------------------------------
def get_text_anchor_string(element: Any, full_text: str) -> str:
    """Document AIのTextAnchor（文字列インデックス範囲）から対応する文字列を復元する"""
    if (
        not element
        or not element.text_anchor
        or not element.text_anchor.text_segments
    ):
        return ""

    text_segments = element.text_anchor.text_segments
    extracted_string = ""

    for segment in text_segments:
        start_index = int(segment.start_index) if segment.start_index else 0
        end_index = int(segment.end_index)
        extracted_string += full_text[start_index:end_index]

    return extracted_string.strip()


def parse_form_fields(
    document: documentai.Document,
) -> list[KeyValuePair]:
    """Document AI のレスポンスから Form Fields (Key-Value) を抽出・整理する"""
    full_text = document.text
    parsed_fields: list[KeyValuePair] = []

    for page in document.pages:
        for field in page.form_fields:
            # Key の抽出
            key_text = get_text_anchor_string(field.field_name, full_text)
            key_confidence = field.field_name.confidence

            # Value の抽出
            value_text = get_text_anchor_string(field.field_value, full_text)
            value_confidence = field.field_value.confidence

            # キーが存在する場合のみリストに追加
            if key_text:
                parsed_fields.append(
                    KeyValuePair(
                        key=key_text,
                        key_confidence=round(key_confidence, 2),
                        value=value_text,
                        value_confidence=round(value_confidence, 2),
                    )
                )

    return parsed_fields


# ------------------------------------------------------------------------------
# エンドポイント定義
# ------------------------------------------------------------------------------
@app.get("/healthz")
async def health_check():
    """Cloud Run ヘルスチェック用"""
    return {"status": "ok"}


@app.post(
    "/upload-report",
    response_model=ProcessReportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_report(file: UploadFile = File(...)):
    """PDF報告書を受け取り、Document AIでOCR解析後、結果をFirestoreに保存する"""
    # 1. ファイル形式チェック
    if not file.filename.endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDF形式のファイルのみ対応しています。",
        )

    try:
        pdf_content = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"ファイルの読み込みに失敗しました: {str(e)}",
        )

    # 2. Document AI API の呼び出し
    try:
        processor_path = doc_ai_client.processor_path(
            PROJECT_ID, LOCATION, PROCESSOR_ID
        )
        raw_document = documentai.RawDocument(
            content=pdf_content, mime_type="application/pdf"
        )
        request = documentai.ProcessRequest(
            name=processor_path, raw_document=raw_document
        )

        result = doc_ai_client.process_document(request=request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Document AI による解析中にエラーが発生しました: {str(e)}",
        )

    # 3. Key-Value データの抽出・整形
    raw_fields = parse_form_fields(result.document)

    # アプリ側で使いやすいフラットな Key-Value 辞書（Map）も作成
    extracted_map: dict[str, str] = {
        item.key: item.value for item in raw_fields
    }

    # 4. Firestore 保存用ドキュメントデータの作成
    document_id = str(uuid.uuid4())
    firestore_payload = {
        "document_id": document_id,
        "filename": file.filename,
        "created_at": firestore.SERVER_TIMESTAMP,
        "extracted_data": extracted_map,
        "raw_fields": [field.model_dump() for field in raw_fields],
        "full_text": result.document.text,  # 全文OCR結果も検索用に保持
    }

    # 5. Firestore への非同期/同期保存
    try:
        doc_ref = db_client.collection(FIRESTORE_COLLECTION).document(
            document_id
        )
        doc_ref.set(firestore_payload)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Firestore へのデータ保存に失敗しました: {str(e)}",
        )

    # 6. レスポンス返却
    return ProcessReportResponse(
        status="success",
        document_id=document_id,
        filename=file.filename,
        fields_count=len(raw_fields),
        extracted_data=extracted_map,
        raw_fields=raw_fields,
    )

