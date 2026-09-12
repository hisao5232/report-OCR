# services/cloud_tasks.py
import json
import os
from google.cloud import tasks_v2

PROJECT_ID = os.getenv("GCP_PROJECT", "paper2data-2026-09")
LOCATION = os.getenv("GCP_LOCATION", "asia-northeast1")
QUEUE_NAME = "ocr-queue"
# Cloud Run 自体のURL
CLOUD_RUN_URL = os.getenv("CLOUD_RUN_SERVICE_URL", "https://ocr-backend-672089477024.asia-northeast1.run.app")
# 先ほど作成したサービスアカウント
SERVICE_ACCOUNT_EMAIL = f"ocr-task-invoker@{PROJECT_ID}.iam.gserviceaccount.com"

tasks_client = tasks_v2.CloudTasksClient()

def enqueue_ocr_task(document_id: str, blob_path: str, filename: str, content_type: str):
    """Cloud Tasks に OCR 処理タスクを追加する"""
    parent = tasks_client.queue_path(PROJECT_ID, LOCATION, QUEUE_NAME)
    
    # 呼び出し先のエンドポイント
    target_url = f"{CLOUD_RUN_URL.rstrip('/')}/tasks/process-ocr"
    
    payload = {
        "document_id": document_id,
        "blob_path": blob_path,
        "filename": filename,
        "content_type": content_type
    }
    
    task = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": target_url,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(payload).encode("utf-8"),
            # Cloud Run 起動用の OIDC トークン設定
            "oidc_token": {
                "service_account_email": SERVICE_ACCOUNT_EMAIL,
            },
        }
    }
    
    response = tasks_client.create_task(request={"parent": parent, "task": task})
    print(f"[CloudTasks] Created task: {response.name}")
    return response.name
