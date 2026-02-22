# Fix garbled commit message via rebase with "edit"
# Runs: rebase -i, then at stop: amend + continue
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$env:GIT_SEQUENCE_EDITOR = 'powershell -ExecutionPolicy Bypass -File "E:/cod/Colaba/scripts/git-seq-editor.ps1"'
git rebase -i 2d39a19
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# If we're in rebase (edit), amend and continue
$stat = git status --short
if ($stat -match "rebase in progress") {
  git commit --amend -m "Landing: редизайн под Лиды + КП - Hero с демо-виджетом, 4 карточки возможностей, 8 аудиторий, Examples с кампаниями КП, FAQ, Pricing Pro"
  git rebase --continue
}
