from .doc_reason import (
    DocReasonAgent, VisionCoreAgent, TelemetryCoreAgent,
    EngineeringAgent, ReportAgent, CodeAgent, KnowledgeSearchAgent, GeneralAgent,
)

_DOC_KEYWORDS = [
    "analyze document", "analyse document", "document", "pdf", "report", "manual",
    "maintenance", "analyze pump", "analyse pump", "extract", "drawing", "file",
]
_VISION_KEYWORDS = [
    "inspect equipment", "image", "photo", "picture", "inspect", "visual",
    "camera", "equipment image", "corrosion", "leakage", "defect",
]
_TELEMETRY_KEYWORDS = [
    "analyze telemetry", "telemetry", "vibration", "csv", "sensor", "signal",
    "waveform", "anomaly", "trend", "oscillation", "rpm", "temperature reading",
    "pressure reading", "flow rate",
]
_ENGINEERING_KEYWORDS = [
    "calculate engineering", "calculate engineering value", "calculate", "calculation",
    "hydraulic", "power", "load", "pressure drop", "flow", "heat transfer",
    "efficiency", "torque", "stress", "strain", "thermodynamic", "pump curve", "npsh",
]
_REPORT_KEYWORDS = [
    "generate report", "create report", "write report", "make report",
    "draft report", "produce report",
]
_CODE_KEYWORDS = [
    "run code", "write code", "generate code", "script", "python", "debug",
    "automate", "plc", "scada", "program", "function", "algorithm", "code",
]
_KNOWLEDGE_KEYWORDS = [
    "search knowledge", "find information", "knowledge base", "lookup",
]
_GREETING_KEYWORDS = [
    "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
    "howdy", "greetings", "what can you do", "who are you", "what are you",
    "help me", "introduce yourself", "sup", "yo", "hiya", "hi there",
    "hello there", "hey there",
]
_PETROCHEM_KEYWORDS = [
    "refinery", "petrochemical", "crude oil", "crude", "distillation", "cracking",
    "catalyst", "reactor", "column", "vessel", "pipeline", "valve",
    "compressor", "heat exchanger", "boiler", "furnace", "mrpl",
    "naphtha", "diesel", "gasoline", "lpg", "lng", "natural gas",
    "corrosion", "fouling", "shutdown", "turnaround", "hydrotreating",
    "reforming", "alkylation", "isomerization", "fractionation", "absorption",
    "stripping", "flare", "blowdown", "relief valve", "psv", "prv",
    "hazop", "psm", "ptw", "permit to work", "hot work", "confined space",
    "api", "asme", "atex", "sil", "sis", "esd", "emergency shutdown",
    "pump", "impeller", "seal", "bearing", "coupling", "gearbox",
    "turbine", "motor", "agitator", "mixer", "separator", "drum",
    "tank", "storage", "loading", "unloading", "jetty", "pipeline",
    "bitumen", "asphalt", "wax", "lube oil", "base oil", "fuel oil",
    "kerosene", "atf", "aviation", "petcoke", "sulphur", "sulfur",
    "hydrogen", "nitrogen", "oxygen", "steam", "condensate",
    "process", "unit", "plant", "facility", "operation", "production",
    "maintenance", "inspection", "reliability", "integrity", "rbi", "rcm",
    "condition monitoring", "vibration", "thickness", "ndt", "ut", "rt",
    "what is", "how does", "explain", "tell me about", "describe",
]

_AGENTS = {
    "DocReason":        DocReasonAgent(),
    "VisionCore":       VisionCoreAgent(),
    "TelemetryCore":    TelemetryCoreAgent(),
    "EngineeringAgent": EngineeringAgent(),
    "ReportAgent":      ReportAgent(),
    "CodeAgent":        CodeAgent(),
    "KnowledgeSearch":  KnowledgeSearchAgent(),
    "GeneralAgent":     GeneralAgent(),
}


def route(command: str) -> tuple[list, str]:
    """Returns (selected_agents, task_type)."""
    text = command.lower().strip()
    words = text.split()

    first_word = words[0] if words else ""
    greeting_bases = {"hi", "hello", "hey", "howdy", "greetings", "sup", "yo"}
    is_greeting = (
        any(first_word == g or (first_word.startswith(g) and len(first_word) <= len(g) + 3) for g in greeting_bases)
        or any(text.startswith(p) for p in ["good morning", "good afternoon", "good evening", "hi there", "hello there", "hey there"])
    )
    if is_greeting:
        return [_AGENTS["GeneralAgent"]], "general"

    if len(words) <= 2 and not any(w in text for w in _DOC_KEYWORDS + _CODE_KEYWORDS + _ENGINEERING_KEYWORDS):
        return [_AGENTS["GeneralAgent"]], "general"

    if any(w in text for w in ["completely", "full analysis", "complete analysis"]):
        return list(_AGENTS.values()), "comprehensive_analysis"

    if any(w in text for w in _REPORT_KEYWORDS):
        return [_AGENTS["ReportAgent"]], "report_generation"

    if any(w in text for w in _CODE_KEYWORDS):
        return [_AGENTS["CodeAgent"]], "code_execution"

    if any(w in text for w in _VISION_KEYWORDS):
        return [_AGENTS["VisionCore"]], "visual_inspection"

    if any(w in text for w in _TELEMETRY_KEYWORDS):
        return [_AGENTS["TelemetryCore"]], "telemetry_analysis"

    if any(w in text for w in _ENGINEERING_KEYWORDS):
        return [_AGENTS["EngineeringAgent"]], "engineering_calculation"

    if any(w in text for w in _DOC_KEYWORDS):
        return [_AGENTS["DocReason"]], "document_analysis"

    if any(w in text for w in _KNOWLEDGE_KEYWORDS):
        return [_AGENTS["KnowledgeSearch"]], "knowledge_search"

    if any(w in text for w in _PETROCHEM_KEYWORDS):
        return [_AGENTS["GeneralAgent"]], "general"

    return [_AGENTS["GeneralAgent"]], "general"
