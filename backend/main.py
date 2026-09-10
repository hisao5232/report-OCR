from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import GEMINI_MODEL
from services.gemini import get_gemini_client
from routers import reports

app = FastAPI(
    title="Handwritten Report OCR Service (Gemini Powered)",
    version="2.0.0",
    description="Geminiを使用してPDF報告書を解析しFirestoreに保存するAPI",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーターの登録
app.include_router(reports.router)

@app.on_event("startup")
async def startup_event():
    print("=== 利用可能な Gemini モデル一覧 ===")
    client = get_gemini_client()
    if client:
        try:
            for m in client.models.list():
                print(f"Model: {m.name}")
        except Exception as e:
            print(f"モデル一覧取得エラー: {e}")
    else:
        print("Gemini client is not initialized.")
    print("====================================")

@app.get("/healthz")
async def health_check():
    return {"status": "ok", "configured_model": GEMINI_MODEL}
