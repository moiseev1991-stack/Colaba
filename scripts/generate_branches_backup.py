"""Generate markdown backup of branches about to be deleted.

Reads branches_to_delete.txt (one branch name per line) and writes
docs/backup-deleted-branches-<date>.md with a table mapping each branch
to its SHA + last commit subject. Pure stdlib, safe to run from any cwd.
"""

from __future__ import annotations

import subprocess
import sys
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
INPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
    r"C:\Users\user\AppData\Local\Temp\branches_to_delete.txt"
)
TODAY = date.today().isoformat()
OUTPUT = REPO_ROOT / "docs" / f"backup-deleted-branches-{TODAY}.md"


def git(*args: str) -> str:
    res = subprocess.run(
        ["git", *args],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return res.stdout.strip()


def main() -> int:
    branches = [b.strip() for b in INPUT.read_text(encoding="utf-8").splitlines() if b.strip()]
    lines: list[str] = []
    lines.append(f"# Backup: удалённые merged-ветки ({TODAY})")
    lines.append("")
    lines.append(f"Все ветки ниже были **влиты в `origin/main`** и удалены из GitHub {TODAY}.")
    lines.append("Сами коммиты остались в истории main (git их не удалит — это merged history).")
    lines.append("При необходимости восстановить ветку по имени:")
    lines.append("")
    lines.append("```powershell")
    lines.append("git push origin <SHA>:refs/heads/<branch-name>")
    lines.append("```")
    lines.append("")
    lines.append(f"Альтернатива: локально созданы теги `archive/{TODAY}/<branch>` — можно")
    lines.append(f"восстановить из тега: `git push origin archive/{TODAY}/<branch>:refs/heads/<branch>`")
    lines.append("")
    lines.append("| Ветка | SHA | Последний commit |")
    lines.append("|-------|-----|------------------|")
    missing = 0
    for b in branches:
        sha = git("rev-parse", f"origin/{b}")
        if not sha or "unknown revision" in sha.lower() or "fatal" in sha.lower():
            missing += 1
            continue
        short = sha[:12]
        subject = git("log", "-1", "--format=%s", sha)
        subject = subject.replace("|", "/").replace("`", "'").replace("\n", " ")
        lines.append(f"| `{b}` | `{short}` | {subject} |")
    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"OK: wrote {OUTPUT} ({len(lines)} lines, {len(branches) - missing} branches, {missing} missing)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
