# === НАСТРОЙКИ РАЗМЕРОВ (вводите свои значения сюда) ===
$origWidth  = 1317   # Исходная ширина картинки
$origHeight = 1317   # Исходная высота картинки

$diff = 1

$cropLeft   = 100 + $diff    # Отрезать слева
$cropRight  = 100 + $diff    # Отрезать справа
$cropTop    = 99 + $diff    # Отрезать сверху
$cropBottom = 101 + $diff    # Отрезать снизу
# =======================================================

# Автоматический расчет геометрии для ImageMagick
$targetWidth  = $origWidth - $cropLeft - $cropRight
$targetHeight = $origHeight - $cropTop - $cropBottom
$offsetX      = $cropLeft
$offsetY      = $cropTop

# Собираем строку параметров (получится что-то вроде "372x373+54+81")
$cropGeometry = "${targetWidth}x${targetHeight}+$offsetX+$offsetY"
$resizeGeometry = "${origWidth}x${origHeight}"

# Запуск обработки файлов
Get-ChildItem *.png | ForEach-Object {
    magick $_.FullName -crop $cropGeometry +repage -resize $resizeGeometry "$($_.BaseName).webp"
}