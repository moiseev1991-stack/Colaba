$path = $args[0]
$msg = "Landing: редизайн под Лиды + КП - Hero с демо-виджетом, 4 карточки возможностей, 8 аудиторий, Examples с кампаниями КП, FAQ, Pricing Pro"
$utf8NoBom = New-Object System.Text.UTF8Encoding $False
[System.IO.File]::WriteAllText($path, $msg + "`n", $utf8NoBom)
