from pathlib import Path
import pymupdf as fitz
import docx


def load(file_path: str) -> list[dict]:
    """
    Returns list of {text, page, document} dicts.
    """
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        return _load_pdf(path)
    elif suffix == ".docx":
        return _load_docx(path)
    elif suffix == ".txt":
        return _load_txt(path)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")


def _load_pdf(path: Path) -> list[dict]:
    pages = []
    doc = fitz.open(str(path))
    for i, page in enumerate(doc):
        text = page.get_text().strip()
        if text:
            text = _normalise(text)
            pages.append({"text": text, "page": i + 1, "document": path.name})
    doc.close()
    return pages


def _normalise(text: str) -> str:
    """Normalise Unicode punctuation so ranges like 55\u201370 survive chunking."""
    # Replace en-dash / em-dash / figure-dash with spaced hyphen
    for ch in ('\u2013', '\u2014', '\u2012'):
        text = text.replace(ch, ' - ')
    # Normalise degree symbol variants to standard U+00B0
    for ch in ('\uff70', '\u02da', '\u00ba', '\u1d52'):
        text = text.replace(ch, '\u00b0')
    return text


def _load_docx(path: Path) -> list[dict]:
    doc = docx.Document(str(path))
    full_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    return [{"text": full_text, "page": 1, "document": path.name}]


def _load_txt(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8", errors="ignore").strip()
    return [{"text": text, "page": 1, "document": path.name}]
