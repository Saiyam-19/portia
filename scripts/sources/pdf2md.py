"""Convert a port document (PDF) to Markdown with <!-- page N --> markers, and report
pages without a text layer, so they can be transcribed by hand.

Needs: pip install pymupdf pymupdf4llm
Usage: python -I scripts/sources/pdf2md.py <input.pdf> <output.md>
Prints {"pages": n, "scanned": [page numbers], "sha256": "..."} for sources.json."""
import hashlib, json, sys
import pymupdf, pymupdf4llm

src, out = sys.argv[1], sys.argv[2]
doc = pymupdf.open(src)
scanned = [i + 1 for i, page in enumerate(doc) if len(page.get_text("text").strip()) < 40]
chunks = pymupdf4llm.to_markdown(src, page_chunks=True, show_progress=False)
with open(out, "w", encoding="utf-8") as f:
    for i, chunk in enumerate(chunks, start=1):
        f.write(f"\n\n<!-- page {i} -->\n\n")
        f.write(chunk["text"].strip() if (i not in scanned) else f"[Page {i} has no text layer; transcribed separately if needed.]")
    f.write("\n")
sha = hashlib.sha256(open(src, "rb").read()).hexdigest()
print(json.dumps({"pages": len(doc), "scanned": scanned, "sha256": sha}))
