from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_current_user
from app.models import User
from app.schemas import ReferenceResult
from app.services import reference_service

router = APIRouter(prefix="/api/reference", tags=["reference"])


@router.get("/search", response_model=list[ReferenceResult])
async def search_reference(
    q: str = Query(default=""),
    type: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    return await reference_service.search(q, type)


@router.get("/local", response_model=list[ReferenceResult])
def get_local_list(
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return reference_service.get_all_local()
