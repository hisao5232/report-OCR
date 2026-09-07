# Report OCR Backend

手書きレポート・帳票のPDFから手書き文字およびフォーム構造を自動抽出し、Firestoreへ構造化データとして保存するサーバーレスバックエンドAPI。

## 構成

- **API Framework**: FastAPI (Python 3.11)
- **Deployment**: Google Cloud Run
- **OCR Engine**: Google Cloud Document AI (Form Parser)
- **Database**: Google Cloud Firestore (Native mode)
- **Container Registry**: Artifact Registry (with automatic cleanup policy)

## API エンドポイント

### `POST /upload-report`
PDFファイルをアップロードしてOCR処理を実行し、結果をFirestoreに保存します。

**Request:**
- `Content-Type`: `multipart/form-data`
- `file`: PDFファイル

**Response:**
```json
{
  "status": "success",
  "document_id": "8031f909-950d-44c6-8758-2a831c75fa00",
  "filename": "report.pdf",
  "fields_count": 10,
  "extracted_data": { ... },
  "raw_fields": [ ... ]
}
```
## ローカル開発 setup
```bash
# 仮想環境作成と依存関係インストール
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# ローカル起動
uvicorn main:app --reload
```
---
