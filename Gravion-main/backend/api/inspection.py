from fastapi import Form
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from backend.vision.image_loader import load_image, ImageLoadError
from backend.vision.analyzer import analyze

router = APIRouter()


class ObservationOut(BaseModel):
    type: str
    severity: str
    location: str
    description: str


class InspectionResponse(BaseModel):
    status: str
    agent: str = "VisionCore"
    equipment_guess: Optional[str] = None
    observations: List[ObservationOut] = []
    visible_leak: bool = False
    visible_damage: bool = False
    visible_corrosion: bool = False
    overall_visual_condition: str = "UNKNOWN"
    confidence: float = 0.0
    raw_description: str = ""
    fallback_used: bool = False


@router.post("/inspect", response_model=InspectionResponse)
async def inspect_image(
    file: UploadFile = File(...),
    vision_model: str = Form("llava:latest")
):
    data = await file.read()
    try:
        image = load_image(data, file.filename or "upload.jpg")
    except ImageLoadError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        result = await analyze(image, vision_model)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {e}")

    return InspectionResponse(
        status="success",
        equipment_guess=result.equipment_guess,
        observations=[
            ObservationOut(
                type=o.type,
                severity=o.severity,
                location=o.location,
                description=o.description,
            )
            for o in result.observations
        ],
        visible_leak=result.visible_leak,
        visible_damage=result.visible_damage,
        visible_corrosion=result.visible_corrosion,
        overall_visual_condition=result.overall_visual_condition,
        confidence=result.confidence,
        raw_description=result.raw_description,
        fallback_used=result.fallback_used,
    )
