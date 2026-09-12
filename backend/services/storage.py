# services/storage.py
import os
from google.cloud import storage

# 環境変数からバケット名を取得（デフォルトは paper2data-2026-09-ocr-files）
PROJECT_ID = os.getenv("GCP_PROJECT", "paper2data-2026-09")
BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", f"{PROJECT_ID}-ocr-files")

storage_client = storage.Client()

def upload_file_to_gcs(document_id: str, file_bytes: bytes, content_type: str) -> str:
    """ファイルをGCSにアップロードし、GCS上のオブジェクトパスを返す"""
    bucket = storage_client.bucket(BUCKET_NAME)
    blob_path = f"raw_reports/{document_id}"
    blob = bucket.blob(blob_path)
    
    blob.upload_from_string(file_bytes, content_type=content_type)
    return blob_path

def download_file_from_gcs(blob_path: str) -> bytes:
    """GCSからファイルデータをバイト配列としてダウンロードする"""
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(blob_path)
    return blob.download_as_bytes()
