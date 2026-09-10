import uuid
import traceback
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from schemas import ReportUpdateRequest
from services.firestore import (
    fetch_all_reports,
    delete_report_by_id,
    save_report,
    update_report_by_id,
)
from services.gemini import analyze_report_image

router = APIRouter()


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


@router.post("/upload-report", status_code=status.HTTP_201_CREATED)
async def upload_report(file: UploadFile = File(...)):
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

    try:
        extracted_data = await analyze_report_image(pdf_content, file.content_type)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    except Exception as e:
        print(f"Gemini Processing Error:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gemini解析エラー: {str(e)}"
        )

    document_id = str(uuid.uuid4())
    try:
        save_report(document_id, file.filename, extracted_data)
    except Exception as e:
        print(f"Firestore Save Error:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Firestore保存エラー: {str(e)}"
        )

    return {
        "status": "success",
        "document_id": document_id,
        "filename": file.filename,
        "extracted_data": extracted_data,
    }
    