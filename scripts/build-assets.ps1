$ErrorActionPreference = "Stop"

$SourceRoot = Join-Path $PSScriptRoot "../source-assets"
$OutputRoot = Join-Path $PSScriptRoot "../public/assets"

$PreviewSource = Join-Path $SourceRoot "preview"
$PreviewOutput = Join-Path $OutputRoot "preview"

$CacheFile = Join-Path $PSScriptRoot "../.asset-build-cache.json"


# ============================================================
# Настройки оптимизации
# ============================================================

$MainResize = "50%"
$MainQuality = 82

$PreviewResize = "192x192>"
$PreviewQuality = 78

$WebpMethod = 2
$WebpThreadLevel = 1

# Если изменить эти настройки, ВСЕ изображения будут пересозданы
$ConfigSignature = @"
v1
main_resize=$MainResize
main_quality=$MainQuality
preview_resize=$PreviewResize
preview_quality=$PreviewQuality
webp_method=$WebpMethod
webp_thread_level=$WebpThreadLevel
"@.Trim()


# ============================================================
# Проверки
# ============================================================

if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
    throw "ImageMagick не найден. Команда 'magick' недоступна."
}

if (-not (Test-Path $SourceRoot)) {
    throw "Не найдена папка оригиналов: $SourceRoot"
}

New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
New-Item -ItemType Directory -Path $PreviewOutput -Force | Out-Null


# ============================================================
# Читаем кэш
# ============================================================

$OldConfigSignature = ""

if (Test-Path $CacheFile) {
    try {
        $Cache = Get-Content $CacheFile -Raw | ConvertFrom-Json
        $OldConfigSignature = $Cache.configSignature
    }
    catch {
        Write-Host "Кэш повреждён. Будет выполнена полная генерация."
    }
}

$ForceRebuild = $OldConfigSignature -ne $ConfigSignature

if ($ForceRebuild) {
    Write-Host ""
    Write-Host "Изменились настройки оптимизации."
    Write-Host "Будет выполнена полная генерация изображений."
}


# ============================================================
# Функция поиска изменённых файлов
# ============================================================

function Get-ChangedFiles {
    param(
        [Parameter(Mandatory = $true)]
        [System.IO.DirectoryInfo]$SourceDirectory,

        [Parameter(Mandatory = $true)]
        [System.IO.DirectoryInfo]$OutputDirectory
    )

    $SourceFiles = @(Get-ChildItem $SourceDirectory -File -Filter "*.webp")

    $ChangedFiles = @()
    $Total = $SourceFiles.Count
    $Current = 0

    foreach ($SourceFile in $SourceFiles) {
        $Current++

        Write-Progress `
            -Activity "Проверка изображений" `
            -Status "$Current / $Total" `
            -PercentComplete $(if ($Total -gt 0) { ($Current / $Total) * 100 } else { 100 })

        $OutputFile = Join-Path $OutputDirectory $SourceFile.Name

        $NeedsBuild = $false

        # Оптимизированного файла нет
        if (-not (Test-Path $OutputFile)) {
            $NeedsBuild = $true
        }

        # Изменился оригинал
        elseif ($SourceFile.LastWriteTimeUtc -gt (Get-Item $OutputFile).LastWriteTimeUtc) {
            $NeedsBuild = $true
        }

        # Изменились настройки оптимизации
        elseif ($ForceRebuild) {
            $NeedsBuild = $true
        }

        if ($NeedsBuild) {
            $ChangedFiles += $SourceFile
        }
    }

    Write-Progress `
        -Activity "Проверка изображений" `
        -Completed

    return $ChangedFiles
}


# ============================================================
# Удаление устаревших оптимизированных файлов
# ============================================================

function Remove-StaleOptimizedFiles {
    param(
        [Parameter(Mandatory = $true)]
        [System.IO.DirectoryInfo]$SourceDirectory,

        [Parameter(Mandatory = $true)]
        [System.IO.DirectoryInfo]$OutputDirectory
    )

    $SourceNames = @(
        Get-ChildItem $SourceDirectory -File -Filter "*.webp" |
        ForEach-Object { $_.Name }
    )

    $OutputFiles = @(
        Get-ChildItem $OutputDirectory -File -Filter "*.webp"
    )

    $DeletedCount = 0

    foreach ($OutputFile in $OutputFiles) {

        if ($OutputFile.Name -notin $SourceNames) {

            Write-Host "Удаление устаревшего: $($OutputFile.Name)"

            Remove-Item $OutputFile.FullName -Force

            $DeletedCount++
        }
    }

    return $DeletedCount
}

# ============================================================
# Очистка устаревших основных изображений
# ============================================================

$DeletedMain = Remove-StaleOptimizedFiles `
    -SourceDirectory (Get-Item $SourceRoot) `
    -OutputDirectory (Get-Item $OutputRoot)


# ============================================================
# Основные изображения
# ============================================================

$MainFiles = @(Get-ChildItem $SourceRoot -File -Filter "*.webp")

$MainChanged = @(Get-ChangedFiles `
    -SourceDirectory (Get-Item $SourceRoot) `
    -OutputDirectory (Get-Item $OutputRoot)
)

Write-Host ""
Write-Host "Основные изображения:"
Write-Host "Удалено устаревших основных изображений: $DeletedMain"
Write-Host "Всего: $($MainFiles.Count)"
Write-Host "Нужно обработать: $($MainChanged.Count)"

if ($MainChanged.Count -gt 0) {

    Write-Host "Обработка..."

    $MainInputFiles = @(
        $MainChanged | ForEach-Object {
            $_.FullName
        }
    )

    magick mogrify `
        -path $OutputRoot `
        -resize $MainResize `
        -strip `
        -quality $MainQuality `
        -define "webp:method=$WebpMethod" `
        -define "webp:thread-level=$WebpThreadLevel" `
        $MainInputFiles

    if ($LASTEXITCODE -ne 0) {
        throw "Ошибка оптимизации основных изображений."
    }

    Write-Host "Готово."
}
else {
    Write-Host "Все изображения уже актуальны."
}

# ============================================================
# Очистка устаревших preview
# ============================================================

$DeletedPreview = Remove-StaleOptimizedFiles `
    -SourceDirectory (Get-Item $PreviewSource) `
    -OutputDirectory (Get-Item $PreviewOutput)

# ============================================================
# Preview
# ============================================================

$PreviewFiles = @(Get-ChildItem $PreviewSource -File -Filter "*.webp")

$PreviewChanged = @(Get-ChangedFiles `
    -SourceDirectory (Get-Item $PreviewSource) `
    -OutputDirectory (Get-Item $PreviewOutput)
)

Write-Host ""
Write-Host "Preview:"
Write-Host "Удалено устаревших preview: $DeletedPreview"
Write-Host "Всего: $($PreviewFiles.Count)"
Write-Host "Нужно обработать: $($PreviewChanged.Count)"

if ($PreviewChanged.Count -gt 0) {

    Write-Host "Обработка..."

    $PreviewInputFiles = @(
        $PreviewChanged | ForEach-Object {
            $_.FullName
        }
    )

    magick mogrify `
        -path $PreviewOutput `
        -resize $PreviewResize `
        -strip `
        -quality $PreviewQuality `
        -define "webp:method=$WebpMethod" `
        -define "webp:thread-level=$WebpThreadLevel" `
        $PreviewInputFiles

    if ($LASTEXITCODE -ne 0) {
        throw "Ошибка создания preview."
    }

    Write-Host "Готово."
}
else {
    Write-Host "Все preview уже актуальны."
}


# ============================================================
# Сохраняем настройки кэша
# ============================================================

$CacheData = @{
    configSignature = $ConfigSignature
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
}

$CacheData |
    ConvertTo-Json |
    Set-Content -Path $CacheFile -Encoding UTF8


Write-Host ""
Write-Host "=========================================="
Write-Host "Оптимизация завершена."
Write-Host "=========================================="