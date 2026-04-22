from fastapi import FastAPI

from app.routers import auth, compounds, dashboard, health, injections

app = FastAPI(title="peptracker")

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(compounds.router)
app.include_router(injections.router)
app.include_router(dashboard.router)
