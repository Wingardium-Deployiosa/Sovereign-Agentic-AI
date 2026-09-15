from .doc_reason import DocReasonAgent, VisionCoreAgent, TelemetryCoreAgent, EngineeringAgent

_DOC_KEYWORDS = ["document", "pdf", "report", "manual", "maintenance", "analyze pump", "analyse pump"]
_VISION_KEYWORDS = ["image", "photo", "picture", "inspect", "visual", "camera", "equipment image"]
_TELEMETRY_KEYWORDS = ["vibration", "csv", "sensor", "telemetry", "data", "signal", "waveform"]
_ENGINEERING_KEYWORDS = ["calculate", "calculation", "hydraulic", "power", "load", "pressure", "flow"]

_AGENTS = {
    "DocReason": DocReasonAgent(),
    "VisionCore": VisionCoreAgent(),
    "TelemetryCore": TelemetryCoreAgent(),
    "EngineeringAgent": EngineeringAgent(),
}


def route(command: str) -> tuple[list, str]:
    """Returns (selected_agents, task_type)."""
    text = command.lower()

    # Multi-agent: comprehensive analysis
    if any(w in text for w in ["completely", "full analysis", "complete analysis"]):
        return list(_AGENTS.values()), "comprehensive_analysis"

    if any(w in text for w in _DOC_KEYWORDS):
        return [_AGENTS["DocReason"]], "document_analysis"

    if any(w in text for w in _VISION_KEYWORDS):
        return [_AGENTS["VisionCore"]], "visual_inspection"

    if any(w in text for w in _TELEMETRY_KEYWORDS):
        return [_AGENTS["TelemetryCore"]], "telemetry_analysis"

    if any(w in text for w in _ENGINEERING_KEYWORDS):
        return [_AGENTS["EngineeringAgent"]], "engineering_calculation"

    # Default fallback
    return [_AGENTS["DocReason"]], "industrial_analysis"
