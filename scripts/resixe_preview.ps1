

# Запуск обработки файлов
Get-ChildItem *.png | ForEach-Object {
    magick $_.FullName "$($_.BaseName).webp"
}