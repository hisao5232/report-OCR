import uuid
import traceback
from fastapi import APIRouter, File, HTTPException, UploadFile, status, BackgroundTasks
from schemas import ReportUpdateRequest
from services.firestore import (
    fetch_all_reports,
    delete_report_by_id,
    save_report,
    update_report_by_id,
)
from services.gemini import analyze_report_image

router = APIRouter()


async def process_report_task(
    document_id: str,
    filename: str,
    file_content: bytes,
    actual_content_type: str
):
    """
    バックグラウンドでGemini解析を実行し、結果（成功・失敗）をFirestoreに更新・保存する
    """
    try:
        # Gemini解析（重い処理）を実行
        extracted_data = await analyze_report_image(file_content, actual_content_type)
        
        # 解析成功：ステータスを completed に更新して抽出データを保存
        save_report(
            report_id=document_id,
            filename=filename,
            extracted_data=extracted_data,
            status="completed"
        )
        print(f"[BackgroundTask] Report {document_id} processed successfully.")

    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"[BackgroundTask] Processing Error ({document_id}):\n{error_trace}")
        
        # 解析失敗：ステータスを failed に更新し、エラーメッセージを保存
        save_report(
            report_id=document_id,
            filename=filename,
            extracted_data=None,
            status="failed",
            error_message=str(e)
        )


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


@router.delete("/reports/{report_id}")
async def delete_report(report_id: str):
    try:
        success = delete_report_by_id(report_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定されたレポートが見つかりません。"
            )
        return {"status": "success", "message": f"Report {report_id} deleted."}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Delete Report Error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete report: {str(e)}"
        )


@router.put("/reports/{report_id}")
async def update_report(report_id: str, payload: ReportUpdateRequest):
    try:
        success = update_report_by_id(report_id, payload.extracted_data, payload.raw_text)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定されたレポートが見つかりません。"
            )
        return {"status": "success", "message": f"Report {report_id} updated."}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Update Report Error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update report: {str(e)}"
        )


@router.post("/upload-report", status_code=status.HTTP_202_ACCEPTED)
async def upload_report(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
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

    # 適切な MimeType を決定
    actual_content_type = "application/pdf" if is_pdf else content_type

    # 1. 事前にドキュメントIDを発行
    document_id = str(uuid.uuid4())

    # 2. Firestoreへ「processing（処理中）」状態で初期保存
    try:
        save_report(
            report_id=document_id,
            filename=file.filename,
            extracted_data=None,
            status="processing"
        )
    except Exception as e:
        print(f"Firestore Save Initial State Error:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Firestore保存エラー: {str(e)}"
        )

    # 3. バックグラウンドタスクにタスクを追加（レスポンス返却後に裏で実行）
    background_tasks.add_task(
        process_report_task,
        document_id,
        file.filename,
        file_content,
        actual_content_type
    )

    # 4. ブラウザには即座に受付完了を返す
    return {
        "status": "accepted",
        "document_id": document_id,
        "filename": file.filename,
        "message": "ファイルを受け付けました。バックグラウンドで解析を実行します。"
    }
