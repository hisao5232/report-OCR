import uuid
import traceback
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from schemas import ReportUpdateRequest
from services.firestore import (
    fetch_all_reports,
    delete_report_by_id,
    save_report,
    update_report_by_id,
)
from services.gemini import analyze_report_image
from services.storage import upload_file_to_gcs, download_file_from_gcs
from services.cloud_tasks import enqueue_ocr_task

router = APIRouter()


class TaskPayload(BaseModel):
    document_id: str
    blob_path: str
    filename: str
    content_type: str


@router.get("/reports")
async def get_reports():
    try:
        reports = fetch_all_reports()
        return {"reports": reports}
    except Exception as e:
        print(f"Fetch Reports Error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch reports: {str(e)}"
        )


@router.delete("/reports/{document_id}")
async def delete_report(document_id: str):
    try:
        success = delete_report_by_id(document_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定されたレポートが見つかりません。"
            )
        return {"status": "success", "message": f"Report {document_id} deleted."}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Delete Report Error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete report: {str(e)}"
        )


@router.put("/reports/{document_id}")
async def update_report(document_id: str, payload: ReportUpdateRequest):
    try:
        success = update_report_by_id(document_id, payload.extracted_data, payload.raw_text)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定されたレポートが見つかりません。"
            )
        return {"status": "success", "message": f"Report {document_id} updated."}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Update Report Error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update report: {str(e)}"
        )


@router.post("/upload-report", status_code=status.HTTP_202_ACCEPTED)
async def upload_report(file: UploadFile = File(...)):
    filename = file.filename.lower() if file.filename else ""
    content_type = file.content_type or ""

    # PDFおよび主要な画像形式を許可
    is_pdf = filename.endswith(".pdf") or content_type == "application/pdf"
    is_image = content_type.startswith("image/") or filename.endswith((".png", ".jpg", ".jpeg", ".webp"))
    if not is_pdf and not is_image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDFまたは画像形式のファイルのみ対応しています。",
        )

    try:
        file_content = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"ファイルの読み込みに失敗しました: {str(e)}",
        )

    actual_content_type = "application/pdf" if is_pdf else content_type
    document_id = str(uuid.uuid4())

    # 1. GCS へファイルを保存
    try:
        blob_path = upload_file_to_gcs(document_id, file_content, actual_content_type)
    except Exception as e:
        print(f"GCS Upload Error:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"ストレージへの保存に失敗しました: {str(e)}"
        )

    # 2. Firestore へ初期ステータス（processing）を保存
    try:
        save_report(
            document_id=document_id,
            filename=file.filename,
            extracted_data=None,
            status="processing"
        )
    except Exception as e:
        print(f"Firestore Save Initial State Error:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Firestore初期保存エラー: {str(e)}"
        )

    # 3. Cloud Tasks へタスクをキューイング
    try:
        enqueue_ocr_task(
            document_id=document_id,
            blob_path=blob_path,
            filename=file.filename,
            content_type=actual_content_type
        )
    except Exception as e:
        print(f"Cloud Tasks Enqueue Error:\n{traceback.format_exc()}")
        # タスクキューイング失敗時は Firestore を failed に更新しておく
        save_report(
            document_id=document_id,
            filename=file.filename,
            extracted_data=None,
            status="failed",
            error_message=f"タスクの追加に失敗しました: {str(e)}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"キューへの追加に失敗しました: {str(e)}"
        )

    # 4. ブラウザには即座に受付完了を返却
    return {
        "status": "accepted",
        "document_id": document_id,
        "filename": file.filename,
        "message": "ファイルを受け付けました。Cloud Tasks経由で非同期に解析します。"
    }


@router.post("/tasks/process-ocr")
async def process_ocr_task(payload: TaskPayload):
    """
    Cloud Tasks から呼び出されるワーカーエンドポイント。
    GCS からデータを取得し、Gemini で解析して Firestore に結果を反映する。
    """
    document_id = payload.document_id
    try:
        # GCS からファイルデータを取得
        file_bytes = download_file_from_gcs(payload.blob_path)

        # Gemini API 解析実行
        extracted_data = await analyze_report_image(file_bytes, payload.content_type)

        # 解析成功：Firestore 更新
        save_report(
            document_id=document_id,
            filename=payload.filename,
            extracted_data=extracted_data,
            status="completed"
        )
        print(f"[CloudTasks Worker] Report {document_id} processed successfully.")
        return {"status": "success", "document_id": document_id}

    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"[CloudTasks Worker] Error ({document_id}):\n{error_trace}")

        save_report(
            document_id=document_id,
            filename=payload.filename,
            extracted_data=None,
            status="failed",
            error_message=str(e)
        )
        # 500を返すと Cloud Tasks が自動再試行（リトライ）するため、適宜例外をスロー
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Task processing failed: {str(e)}"
        )
