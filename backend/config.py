import os

PROJECT_ID = os.getenv("GCP_PROJECT_ID")
FIRESTORE_COLLECTION = os.getenv("FIRESTORE_COLLECTION", "handwritten_reports")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
