import io
import math
import statistics
from fastapi import APIRouter, UploadFile, File, HTTPException
import pandas as pd

router = APIRouter()

Z_THRESHOLD = 2.5  # Z-score threshold for anomaly detection


def _detect_anomalies(values: list[float]) -> list[int]:
    """Return indices where Z-score exceeds threshold."""
    if len(values) < 4:
        return []
    mean = statistics.mean(values)
    stdev = statistics.stdev(values)
    if stdev == 0:
        return []
    return [i for i, v in enumerate(values) if abs((v - mean) / stdev) > Z_THRESHOLD]


def _parse_df(df: pd.DataFrame) -> list[dict]:
    """
    Accepts any CSV/XLSX with:
      - First column = timestamps / labels (time axis)
      - Remaining columns = numeric sensor readings

    Returns a list of sensor dicts compatible with the frontend SensorData shape.
    """
    df.columns = [str(c).strip() for c in df.columns]

    # First column is the time axis
    time_col = df.columns[0]
    sensor_cols = [c for c in df.columns[1:] if pd.api.types.is_numeric_dtype(df[c])]

    if not sensor_cols:
        # Try to coerce all non-first columns to numeric
        for c in df.columns[1:]:
            df[c] = pd.to_numeric(df[c], errors="coerce")
        sensor_cols = [c for c in df.columns[1:] if not df[c].isna().all()]

    if not sensor_cols:
        raise ValueError("No numeric sensor columns found in the file.")

    # Limit to 500 rows for performance
    df = df.head(500).copy()
    df[time_col] = df[time_col].astype(str)

    sensors = []
    for col in sensor_cols:
        series = df[col].replace([float('inf'), float('-inf')], float('nan')).ffill().fillna(0)
        values = [round(float(v), 3) for v in series]
        times  = list(df[time_col])

        readings = [{"time": t, "value": v} for t, v in zip(times, values)]
        anomaly_indices = _detect_anomalies(values)

        valid = [v for v in values if not math.isnan(v)]
        sensors.append({
            "name":      col,
            "unit":      "",          # unit not known from raw CSV
            "readings":  readings,
            "min":       round(min(valid), 3) if valid else 0,
            "max":       round(max(valid), 3) if valid else 0,
            "avg":       round(statistics.mean(valid), 3) if valid else 0,
            "anomalies": anomaly_indices,
        })

    return sensors


@router.post("/telemetry/upload")
async def upload_telemetry(file: UploadFile = File(...)):
    name = (file.filename or "").lower()
    raw  = await file.read()

    try:
        # First try to parse as Excel
        try:
            if name.endswith(".xlsx"):
                df = pd.read_excel(io.BytesIO(raw), engine="openpyxl")
            elif name.endswith(".xls"):
                df = pd.read_excel(io.BytesIO(raw))
            else:
                # Try auto-detecting excel format even without extension
                df = pd.read_excel(io.BytesIO(raw))
        except Exception:
            # If it fails to parse as Excel (e.g. CSV named .xls, or generic CSV), fallback to CSV
            for sep in [",", ";", "\t"]:
                try:
                    df = pd.read_csv(io.BytesIO(raw), sep=sep)
                    if df.shape[1] > 1:
                        break
                except Exception:
                    continue
            else:
                df = pd.read_csv(io.BytesIO(raw))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    if df.empty or df.shape[1] < 2:
        raise HTTPException(status_code=400, detail="File must have at least 2 columns (time + one sensor).")

    try:
        sensors = _parse_df(df)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "filename": file.filename,
        "rows":     len(df),
        "sensors":  sensors,
    }
