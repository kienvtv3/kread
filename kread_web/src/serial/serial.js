// KREAD Serial Protocol Implementation

class KreadSerial {
  constructor() {
    this.port = null
    this.reader = null
    this.writer = null
    this.readBuffer = ''
  }

  async connect(baudRate = 115200) {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API not supported. Use Chrome or Edge.')
    }

    // If port already open, close it first
    if (this.port) {
      try {
        if (this.reader) {
          await this.reader.cancel().catch(() => {})
          this.reader = null
        }
        await this.port.close().catch(() => {})
      } catch (e) {
        // ignore close errors
      }
      this.port = null
    }

    // ESP32-C3 USB Serial/JTAG: vendor 0x303A (Espressif), product 0x1001
    this.port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x303A, usbProductId: 0x1001 }]
    })

    // Port might already be open (HMR / page reload)
    if (!this.port.readable) {
      await this.port.open({ baudRate })
    }

    // Start reading
    this._startReading()
  }

  async disconnect() {
    if (this.reader) {
      await this.reader.cancel()
      this.reader = null
    }
    if (this.port) {
      await this.port.close()
      this.port = null
    }
  }

  async _startReading() {
    const textDecoder = new TextDecoderStream()
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable)
    this.reader = textDecoder.readable.getReader()

    try {
      while (true) {
        const { value, done } = await this.reader.read()
        if (done) break
        if (value) {
          this.readBuffer += value
          this._processBuffer()
        }
      }
    } catch (err) {
      console.error('Read error:', err)
    }
  }

  _processBuffer() {
    // Process complete lines from buffer
    const lines = this.readBuffer.split('\n')
    this.readBuffer = lines.pop() || ''

    for (const line of lines) {
      if (line.trim()) {
        this._handleResponse(line.trim())
      }
    }
  }

  _pendingResolve = null

  _handleResponse(line) {
    console.log('RX:', line)

    // Parse KREAD responses
    if (line.startsWith('KREAD_INFO ')) {
      const json = line.slice(11)
      try {
        const data = JSON.parse(json)
        if (this._pendingResolve) {
          this._pendingResolve(data)
          this._pendingResolve = null
        }
      } catch (e) {
        console.error('Failed to parse KREAD_INFO:', e)
      }
    } else if (line.startsWith('KREAD_FILES ')) {
      const json = line.slice(12)
      try {
        const data = JSON.parse(json)
        if (this._pendingResolve) {
          this._pendingResolve(data)
          this._pendingResolve = null
        }
      } catch (e) {
        console.error('Failed to parse KREAD_FILES:', e)
      }
    } else if (line === 'KREAD_OK') {
      if (this._pendingResolve) {
        this._pendingResolve({ ok: true })
        this._pendingResolve = null
      }
    } else if (line === 'KREAD_READY') {
      if (this._pendingResolve) {
        this._pendingResolve({ ready: true })
        this._pendingResolve = null
      }
    } else if (line.startsWith('KREAD_ERROR ')) {
      const reason = line.slice(12)
      if (this._pendingResolve) {
        this._pendingResolve({ error: reason })
        this._pendingResolve = null
      }
    }
  }

  async sendCommand(cmd, timeout = 5000) {
    if (!this.port) {
      throw new Error('Not connected')
    }

    const encoder = new TextEncoder()
    const writer = this.port.writable.getWriter()

    await writer.write(encoder.encode(cmd + '\n'))
    writer.releaseLock()

    console.log('TX:', cmd)

    // Wait for response
    return new Promise((resolve, reject) => {
      this._pendingResolve = resolve
      setTimeout(() => {
        if (this._pendingResolve) {
          this._pendingResolve = null
          reject(new Error('Command timeout'))
        }
      }, timeout)
    })
  }

  async sendFile(filename, data, onProgress) {
    if (!this.port) {
      throw new Error('Not connected')
    }

    const filesize = data.byteLength

    // Send START command
    const startResponse = await this.sendCommand(`KREAD_START ${filename} ${filesize}`)
    if (!startResponse.ready) {
      throw new Error('Device not ready')
    }

    // Send binary data in chunks
    const chunkSize = 4096
    const writer = this.port.writable.getWriter()

    for (let offset = 0; offset < filesize; offset += chunkSize) {
      const chunk = data.slice(offset, Math.min(offset + chunkSize, filesize))
      await writer.write(new Uint8Array(chunk))

      if (onProgress) {
        onProgress(offset + chunk.byteLength, filesize)
      }
    }

    writer.releaseLock()

    // Calculate CRC32 and send END command
    const crc = this._crc32(new Uint8Array(data))
    const endResponse = await this.sendCommand(`KREAD_END ${crc.toString(16)}`)

    if (endResponse.error) {
      throw new Error(endResponse.error)
    }

    return endResponse.ok
  }

  _crc32(data) {
    let crc = 0xFFFFFFFF
    const table = this._getCrc32Table()

    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF]
    }

    return (crc ^ 0xFFFFFFFF) >>> 0
  }

  _crc32Table = null

  _getCrc32Table() {
    if (this._crc32Table) return this._crc32Table

    this._crc32Table = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
      }
      this._crc32Table[i] = c
    }
    return this._crc32Table
  }
}

export const serial = new KreadSerial()
