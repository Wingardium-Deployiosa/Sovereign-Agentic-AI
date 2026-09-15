import sys, json
sys.stdout.reconfigure(encoding='utf-8')

from backend.rag.evidence_consistency import extract_checklist_items, determine_assessment

chunks = json.load(open('backend/data/vector_store/chunks.json', encoding='utf-8'))
items = extract_checklist_items(chunks)
print('Checklist items:', len(items))
for it in items:
    print(' ', it)
print()
print('Assessment:', determine_assessment(chunks))
