/* eslint-disable no-undef */
const { execFileSync } = require('node:child_process');
const { readFileSync, statSync, writeFileSync } = require('node:fs');
const { join, resolve, sep } = require('node:path');
const { crc32, deflateRawSync } = require('node:zlib');

// __dirname здесь уже даётся самим Node (CommonJS) — не нужно вычислять
// его вручную через import.meta.url, как в ESM-варианте.
// Корень проекта находится на уровень выше директории со скриптом
const PROJECT_ROOT = resolve(__dirname, '..');
const OUTPUT_ZIP = join(PROJECT_ROOT, 'project_archive.zip');

// Дополнительные исключения ПОВЕРХ .gitignore — например, отслеживаемые
// git'ом папки со сборочными артефактами, отчёты тестов, крупные бинарники
// и т.п., которые вы не хотите видеть в архиве. Пути — относительно корня
// проекта, разделитель всегда '/', поддерживаются glob-паттерны:
//   *   — любые символы, кроме '/'
//   **  — любые символы, включая '/'
//   ?   — один любой символ, кроме '/'
const EXTRA_EXCLUDES = ['public/*.png', 'public/google*.html', 'source-assets/**'];

function copyToClipboard(text) {
  try {
    execFileSync('clip', { input: text });
  } catch {
    // Буфер обмена недоступен (не Windows, нет clip.exe и т.п.) — не критично.
  }
}

/**
 * Возвращает относительные пути всех файлов проекта, которые НЕ
 * игнорируются .gitignore: уже отслеживаемых (--cached) и новых, но не
 * игнорируемых (--others --exclude-standard). Список формирует сам git,
 * а не ручной разбор .gitignore — так автоматически учитываются шаблоны
 * с /, отрицания (!), вложенные .gitignore и прочие тонкости синтаксиса.
 */
function listFilesRespectingGitignore(rootDir) {
  const raw = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: rootDir, maxBuffer: 64 * 1024 * 1024 },
  ).toString('utf8');
  return raw.split('\0').filter(Boolean);
}

// Превращает glob-паттерн в RegExp. Поддерживает '*', '**' и '?'.
// Путь всегда сравнивается в виде с '/'-разделителями (см. вызов ниже).
function globToRegExp(pattern) {
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i += 1;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  re += '$';
  return new RegExp(re);
}

function filterExcluded(relativeFiles, patterns) {
  const regexes = patterns.map(globToRegExp);
  const kept = [];
  const skipped = [];
  for (const relPath of relativeFiles) {
    const normalized = relPath.split(sep).join('/');
    if (regexes.some(re => re.test(normalized))) {
      skipped.push(relPath);
    } else {
      kept.push(relPath);
    }
  }
  return { kept, skipped };
}

// DOS date/time — ZIP's native timestamp format (2-second resolution,
// years 1980–2107), same as what zipfile.ZipFile/Compress-Archive write.
function dosDateTime(date) {
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    (date.getSeconds() >> 1);
  const dosDate =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { dosTime, dosDate };
}

// Builds a plain ZIP (local file headers + central directory + end-of-
// central-directory record) entirely from Node's built-ins — no archiver/
// jszip/etc. dependency, and so no `npm install` at all is needed to run
// this script. Deflate compression comes from node:zlib; per-file CRC32
// from zlib.crc32 (available since Node 21). This intentionally skips
// ZIP64, since a source-code archive is never going to hit the 4 GiB /
// 65535-entry limits that feature exists for.
function buildZip(rootDir, relativeFiles) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;
  let entryCount = 0;

  for (const relPath of relativeFiles) {
    const fullPath = join(rootDir, relPath);
    let data;
    try {
      data = readFileSync(fullPath);
    } catch {
      console.log(`⚠️ Пропущено (не найдено): ${relPath}`);
      continue;
    }
    const stats = statSync(fullPath);
    const { dosTime, dosDate } = dosDateTime(stats.mtime);
    // ZIP entry names always use '/', even on Windows.
    const nameBuf = Buffer.from(relPath.split(sep).join('/'), 'utf8');
    const fileCrc = crc32(data) >>> 0;
    const deflated = deflateRawSync(data);
    // Store instead of deflate when compression doesn't actually help
    // (tiny files, or already-compressed content) — matches what
    // zipfile/Compress-Archive effectively do too.
    const useStore = deflated.length >= data.length;
    const method = useStore ? 0 : 8;
    const payload = useStore ? data : deflated;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed to extract
    localHeader.writeUInt16LE(0x0800, 6); // general purpose flag: bit 11 = UTF-8 name
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(fileCrc, 14);
    localHeader.writeUInt32LE(payload.length, 18); // compressed size
    localHeader.writeUInt32LE(data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localChunks.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central directory signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed to extract
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(fileCrc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // file comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attributes
    centralHeader.writeUInt32LE(0, 38); // external file attributes
    centralHeader.writeUInt32LE(offset, 42); // offset of local header

    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + payload.length;
    entryCount += 1;
    console.log(`Добавлен: ${relPath}`);
  }

  const centralDirStart = offset;
  const centralDirBuf = Buffer.concat(centralChunks);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  eocd.writeUInt16LE(0, 4); // this disk number
  eocd.writeUInt16LE(0, 6); // disk with central directory
  eocd.writeUInt16LE(entryCount, 8); // entries on this disk
  eocd.writeUInt16LE(entryCount, 10); // entries total
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(centralDirStart, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, centralDirBuf, eocd]);
}

try {
  const allFiles = listFilesRespectingGitignore(PROJECT_ROOT).filter(
    relPath => join(PROJECT_ROOT, relPath) !== OUTPUT_ZIP,
  );
  const { kept: files, skipped } = filterExcluded(allFiles, EXTRA_EXCLUDES);
  if (skipped.length) {
    console.log(`🚫 Исключено по EXTRA_EXCLUDES (${skipped.length}):`);
    for (const s of skipped) console.log(`   - ${s}`);
  }
  const zipBuffer = buildZip(PROJECT_ROOT, files);
  writeFileSync(OUTPUT_ZIP, zipBuffer);
  copyToClipboard(OUTPUT_ZIP);
  console.log(`\n✅ Архив успешно сформирован: ${OUTPUT_ZIP}`);
  console.log('📋 Путь скопирован в буфер обмена.');
} catch (err) {
  if (err && err.code === 'ENOENT') {
    console.error(
      '❌ git не найден в PATH — установите Git или запускайте скрипт из окружения, где он доступен.',
    );
  } else {
    console.error(
      '❌ Не удалось создать архив:',
      err && err.message ? err.message : err,
    );
  }
  process.exitCode = 1;
}
