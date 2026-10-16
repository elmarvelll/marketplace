# One-off extraction helper (kept for the record; see EXTRACTION_REPORT.md): rewrites AkadVerse URL/import paths in the
# copied Marketplace sources to the standalone app's paths. Run once from the project root. Touches only this project.
import re, pathlib
ROOTS = ["src", "services", "tests", "scripts"]
RULES = [
    (r"@/app/studashboard/admin/marketplace/", "@/app/admin/"),
    (r"@/app/studashboard/admin/", "@/app/admin/"),
    (r"@/app/studashboard/marketplace/", "@/app/"),
    (r"src/app/studashboard/admin/marketplace", "src/app/admin"),
    (r"src/app/studashboard/marketplace", "src/app"),
    (r"/studashboard/admin/marketplace", "/admin"),
    (r"/studashboard/admin", "/admin"),
    (r"/studashboard/marketplace/", "/"),
    (r"/studashboard/marketplace(?=[\"'`?#\s<)}])", "/"),
    (r"studashboard/admin/marketplace", "admin"),
    (r"studashboard/marketplace/", ""),
]
changed = 0
for root in ROOTS:
    for path in pathlib.Path(root).rglob("*"):
        if path.suffix not in {".ts", ".tsx", ".mjs"} or path.name == "_rewrite-paths.py":
            continue
        text = path.read_text()
        new = text
        for pattern, repl in RULES:
            new = re.sub(pattern, repl, new)
        if new != text:
            path.write_text(new)
            changed += 1
print("files rewritten:", changed)
