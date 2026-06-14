#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSETS_DIR = resolve(__dirname, '../resources/assets')
const FW_INCLUDE = resolve(__dirname, '../../firmware/include')
const FW_SRC = resolve(__dirname, '../../firmware/src')

const LANGUAGES = ['en', 'vi']

// Read asset keys from en/ directory
const assetKeys = readdirSync(resolve(ASSETS_DIR, 'en'))
  .filter(f => f.endsWith('.kp'))
  .map(f => f.replace('.kp', ''))
  .sort()

function keyToEnum(key) {
  return 'ASSET_' + key.toUpperCase().replace(/\./g, '_')
}

function keyToVar(lang, key) {
  return '_' + lang + '_' + key.replace(/\./g, '_')
}

// Generate header
let header = '// ui_assets.h — AUTO-GENERATED. Do not edit.\n'
header += '#pragma once\n#include <stdint.h>\n\n'
header += 'typedef struct {\n'
header += '    const uint8_t *data;\n'
header += '    uint16_t w, h;\n'
header += '    uint32_t size;\n'
header += '} ui_asset_t;\n\n'
header += 'typedef enum {\n'
for (let i = 0; i < assetKeys.length; i++) {
  header += '    ' + keyToEnum(assetKeys[i]) + ' = ' + i + ',\n'
}
header += '    ASSET_COUNT = ' + assetKeys.length + '\n'
header += '} ui_asset_id_t;\n\n'
for (const lang of LANGUAGES) {
  header += 'extern const ui_asset_t UI_ASSETS_' + lang.toUpperCase() + '[];\n'
}
header += '\nextern const ui_asset_t *ui_lang;\n'
header += 'void ui_set_language(const ui_asset_t *table);\n'

mkdirSync(FW_INCLUDE, { recursive: true })
writeFileSync(resolve(FW_INCLUDE, 'ui_assets.h'), header)
console.log('Generated ui_assets.h (' + assetKeys.length + ' assets)')

// Generate data
let data = '// ui_assets_data.c — AUTO-GENERATED. Do not edit.\n'
data += '#include "ui_assets.h"\n\n'
data += 'const ui_asset_t *ui_lang = 0;\n'
data += 'void ui_set_language(const ui_asset_t *table) { ui_lang = table; }\n\n'

for (const lang of LANGUAGES) {
  data += '// ── ' + lang.toUpperCase() + ' ──\n\n'

  for (const key of assetKeys) {
    const bytes = readFileSync(resolve(ASSETS_DIR, lang, key + '.kp'))
    const varName = keyToVar(lang, key)
    data += 'static const uint8_t ' + varName + '[] = {\n'
    const hex = Array.from(bytes).map(b => '0x' + b.toString(16).padStart(2, '0'))
    for (let i = 0; i < hex.length; i += 16) {
      data += '    ' + hex.slice(i, i + 16).join(',') + ',\n'
    }
    data += '};\n\n'
  }

  data += 'const ui_asset_t UI_ASSETS_' + lang.toUpperCase() + '[] = {\n'
  for (const key of assetKeys) {
    const bytes = readFileSync(resolve(ASSETS_DIR, lang, key + '.kp'))
    const w = bytes[4] | (bytes[5] << 8)  // portrait w (UI assets are portrait-packed)
    const h = bytes[6] | (bytes[7] << 8)  // portrait h
    const varName = keyToVar(lang, key)
    data += '    [' + keyToEnum(key) + '] = { ' + varName + ', ' + w + ', ' + h + ', sizeof(' + varName + ') },\n'
  }
  data += '};\n\n'
}

mkdirSync(FW_SRC, { recursive: true })
writeFileSync(resolve(FW_SRC, 'ui_assets_data.c'), data)
console.log('Generated ui_assets_data.c (' + (data.length / 1024).toFixed(0) + ' KB source)')
