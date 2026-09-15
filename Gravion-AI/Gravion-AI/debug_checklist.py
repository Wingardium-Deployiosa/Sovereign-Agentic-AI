import json, re, sys
sys.stdout.reconfigure(encoding='utf-8')

chunks = json.load(open('backend/data/vector_store/chunks.json', encoding='utf-8'))

ROW_SPLIT = re.compile(r'(?<!\d)(?=\d{1,2}\s+[A-Z][a-z])')
STATUS_RE  = re.compile(
    r'^\d{0,2}\s*(.*?)\s+(Pass|Fail|Attention|N/A)\s*(.*?)$',
    re.IGNORECASE | re.DOTALL
)

def _is_checklist_chunk(text: str) -> bool:
    """True if chunk contains multiple Pass/Fail/Attention status tokens."""
    return len(re.findall(r'\b(Pass|Fail|Attention|N/A)\b', text, re.I)) >= 2

def extract_checklist_items(chunks):
    items = []
    seen = set()
    for chunk in chunks:
        text = chunk['text']
        if not _is_checklist_chunk(text):
            continue

        # Trim everything before the first status-bearing row
        # Find the first occurrence of a digit followed by a word (row start)
        m_first = re.search(r'(?<!\d)\d{1,2}\s+[A-Z][a-z]', text)
        region = text[m_first.start():] if m_first else text

        # Also trim maintenance history section
        m_end = re.search(r'\bMaintenance History\b', region, re.I)
        if m_end:
            region = region[:m_end.start()]

        for seg in ROW_SPLIT.split(region):
            seg = seg.strip()
            if not seg:
                continue
            m = STATUS_RE.match(seg)
            if not m:
                continue
            point  = m.group(1).strip().strip(' -')
            status = m.group(2).strip().capitalize()
            remark = m.group(3).strip()
            if len(point) < 5:
                continue
            if re.search(r'\d{2}-[A-Za-z]{3}-\d{4}', point):
                continue
            key = point[:40].lower()
            if key in seen:
                continue
            seen.add(key)
            items.append({'point': point, 'status': status, 'remark': remark or None})
    return items

items = extract_checklist_items(chunks)
for it in items:
    print(it)
print('total:', len(items))
