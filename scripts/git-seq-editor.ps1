$path = $args[0]
(Get-Content $path -Raw) -replace 'pick d662e24 ', 'edit d662e24 ' | Set-Content $path -NoNewline
