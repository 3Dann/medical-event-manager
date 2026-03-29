from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, SessionLocal
import models
from routes import auth, patients, insurance, claims, strategy, responsiveness, import_data
from data.seed_data import RESPONSIVENESS_DEFAULTS

app = FastAPI(title="Medical Event Manager API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables
models.Base.metadata.create_all(bind=engine)

# Seed default responsiveness scores
def seed_responsiveness():
    db = SessionLocal()
    try:
        count = db.query(models.ResponsivenessScore).count()
        if count == 0:
            for item in RESPONSIVENESS_DEFAULTS:
                score = models.ResponsivenessScore(**item, is_default=True)
                db.add(score)
            db.commit()
    finally:
        db.close()

seed_responsiveness()

# Register routes
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(insurance.router)
app.include_router(insurance.entitlement_router)
app.include_router(claims.router)
app.include_router(strategy.router)
app.include_router(responsiveness.router)
app.include_router(import_data.router)


@app.get("/")
def root():
    return {"message": "Medical Event Manager API", "version": "1.0.0", "status": "running"}


@app.get("/api/health")
def health():
    return {"status": "ok"}
