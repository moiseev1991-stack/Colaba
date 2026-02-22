# Fix garbled commit message 943e169 via rebase
# Usage: run from repo root
$ErrorActionPreference = "Stop"
$newMsg = "Landing: редизайн под Лиды + КП - Hero с демо-виджетом, 4 карточки возможностей, 8 аудиторий, Examples с кампаниями КП, FAQ, Pricing Pro"
$msgFile = Join-Path $env:TEMP "git-reword-msg.txt"
[System.IO.File]::WriteAllText($msgFile, $newMsg + "`n", [System.Text.Encoding]::UTF8)

$seqEditor = @'
powershell -NoProfile -Command "
  $f = $args[1]
  (Get-Content $f -Raw) -replace 'pick 943e169 ', 'reword 943e169 ' | Set-Content $f -NoNewline
"
'@

$editor = "powershell -NoProfile -Command `"Copy-Item -Path '$msgFile' -Destination $args[1] -Force`""

$env:GIT_SEQUENCE_EDITOR = $seqEditor.Trim()
$env:GIT_EDITOR = $editor
git rebase -i 2d39a19
