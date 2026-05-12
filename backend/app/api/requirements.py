from fastapi import APIRouter, HTTPException

from app.schemas.requirements import (
    RequirementsAnalyzeRequest,
    RequirementsAnalyzeResponse,
)
from app.services.llm_service import LLMService

router = APIRouter(prefix="/requirements", tags=["requirements"])


@router.post("/analyze", response_model=RequirementsAnalyzeResponse)
async def analyze_requirements(
    payload: RequirementsAnalyzeRequest,
) -> RequirementsAnalyzeResponse:
    llm = LLMService()
    try:
        analysis, mocked = await llm.analyze_requirements(payload.description)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return RequirementsAnalyzeResponse(
        analysis=analysis,
        model=llm.settings.openai_model,
        mocked=mocked,
    )
