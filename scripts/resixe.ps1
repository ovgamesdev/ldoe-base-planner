# === НАСТРОЙКИ РАЗМЕРОВ (вводите свои значения сюда) ===
$origWidth  = 512   # Исходная ширина картинки
$origHeight = 512   # Исходная высота картинки

$diff = 1

$cropLeft   = 53 + $diff    # Отрезать слева
$cropRight  = 86 + $diff    # Отрезать справа
$cropTop    = 80 + $diff    # Отрезать сверху
$cropBottom = 59 + $diff    # Отрезать снизу
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