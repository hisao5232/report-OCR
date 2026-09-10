import traceback
from google.cloud import firestore
from config import PROJECT_ID, FIRESTORE_COLLECTION

try:
    if PROJECT_ID:
        db_client = firestore.Client(project=PROJECT_ID)
    else:
        db_client = firestore.Client()
except Exception as e:
    print(f"Firestore Client Init Error: {e}")
    db_client = None

def get_db():
    if not db_client:
        raise RuntimeError("Firestore client is not initialized.")
    return db_client

def fetch_all_reports():
    db = get_db()
    docs = db.collection(FIRESTORE_COLLECTION).stream()
    reports_list = []
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        for k, v in list(data.items()):
            if hasattr(v, "isoformat"):
                data[k] = v.isoformat()
            elif hasattr(v, "to_datetime"):
                data[k] = v.to_datetime().isoformat()
        reports_list.append(data)
    reports_list.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return reports_list

def delete_report_by_id(report_id: str):
    db = get_db()
    doc_ref = db.collection(FIRESTORE_COLLECTION).document(report_id)
    doc = doc_ref.get()
    if not doc.exists:
        return False
    doc_ref.delete()
    return True

def save_report(document_id: str, filename: str, extracted_data: dict):
    db = get_db()
    firestore_payload = {
        "document_id": document_id,
        "filename": filename,
        "created_at": firestore.SERVER_TIMESTAMP,
        "extracted_data": extracted_data,
    }
    doc_ref = db.collection(FIRESTORE_COLLECTION).document(document_id)
    doc_ref.set(firestore_payload)

def update_report_by_id(report_id: str, extracted_data: dict, raw_text: str = None):
    db = get_db()
    doc_ref = db.collection(FIRESTORE_COLLECTION).document(report_id)
    doc = doc_ref.get()
    if not doc.exists:
        return False
    
    update_data = {
        "extracted_data": extracted_data,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    if raw_text is not None:
        update_data["raw_text"] = raw_text
        
    doc_ref.update(update_data)
    return True

