# Запуск обработки файлов
Get-ChildItem *.png | ForEach-Object {
    magick $_.FullName "$($_.BaseName).webp"
    if ($LASTEXITCODE -eq 0) {
        Remove-Item $_.FullName
    }
}