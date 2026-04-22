from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, compounds, dashboard, health, injections

app = FastAPI(title="peptracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(compounds.router)
app.include_router(injections.router)
app.include_router(dashboard.router)
