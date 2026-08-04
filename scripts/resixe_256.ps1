# === НАСТРОЙКИ РАЗМЕРОВ (вводите свои значения сюда) ===
$origWidth  = 256   # Исходная ширина картинки

# Собираем строку параметров (получится что-то вроде "372x373+54+81")
$resizeGeometry = "${origWidth}"

# Запуск обработки файлов
Get-ChildItem *.png | ForEach-Object {
    magick $_.FullName -resize $resizeGeometry "$($_.BaseName).webp"
}