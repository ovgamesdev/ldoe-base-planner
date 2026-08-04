# === НАСТРОЙКИ РАЗМЕРОВ (вводите свои значения сюда) ===
$origWidth  = 1024   # Исходная ширина картинки
$origHeight = 1024   # Исходная высота картинки

$diff = 1

$cropLeft   = 140 + $diff    # Отрезать слева
$cropRight  = 139 + $diff    # Отрезать справа
$cropTop    = 140 + $diff    # Отрезать сверху
$cropBottom = 139 + $diff    # Отрезать снизу
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