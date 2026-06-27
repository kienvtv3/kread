import { serial } from '../serial/serial.js'

let connected = $state(false)
let deviceInfo = $state(null)
let error = $state(null)
let portOpen = $state(false)

async function connect() {
  try {
    error = null
    await serial.connect()
    portOpen = true
    connected = true

    // Try KREAD_INFO but don't fail if firmware doesn't support it
    try {
      const info = await serial.sendCommand('KREAD_INFO')
      if (info && !info.error) {
        deviceInfo = info
      }
    } catch (e) {
      // Stock firmware won't respond to KREAD protocol — that's OK
      console.log('KREAD_INFO not supported (stock firmware?)')
      deviceInfo = { fw: 'non-kread firmware', sd_free: 0 }
    }
  } catch (e) {
    error = e.message
    connected = false
    portOpen = false
    deviceInfo = null
  }
}

async function disconnect() {
  try {
    await serial.disconnect()
  } finally {
    connected = false
    portOpen = false
    deviceInfo = null
  }
}

async function listFiles() {
  if (!connected) return { files: [], free: 0 }
  try {
    return await serial.sendCommand('KREAD_LIST')
  } catch (e) {
    return { files: [], free: 0 }
  }
}

async function deleteFile(filename) {
  if (!connected) return false
  const result = await serial.sendCommand(`KREAD_DELETE ${filename}`)
  return result.ok
}

async function pushFile(filename, data, onProgress) {
  if (!connected) throw new Error('Not connected')
  return serial.sendFile(filename, data, onProgress)
}

export const connection = {
  get connected() { return connected },
  get deviceInfo() { return deviceInfo },
  get error() { return error },
  connect,
  disconnect,
  listFiles,
  deleteFile,
  pushFile,
}
