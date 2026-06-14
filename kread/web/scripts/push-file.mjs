/**
 * Push a file to device SD card via KREAD serial protocol.
 * Usage: node scripts/push-file.mjs <file> [COM port]
 */
import { SerialPort } from 'serialport';
import { readFileSync } from 'fs';
import crc32 from 'buffer-crc32';

const filePath = process.argv[2] || 'test_aa.kp';
const portPath = process.argv[3] || 'COM7';

const file = readFileSync(filePath);
console.log(`File: ${filePath} (${file.length} bytes)`);

const port = new SerialPort({ path: portPath, baudRate: 115200, hupcl: false });
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let accumBuf = '';

port.on('data', (data) => {
  accumBuf += data.toString();
});

function waitFor(match, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (accumBuf.includes(match)) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}

async function run() {
  // Wait for device boot + drain
  console.log('Waiting for device...');
  await wait(3000);
  accumBuf = '';  // clear boot messages

  // Send START command
  const cmd = `KREAD_START ${filePath.split(/[/\\]/).pop()} ${file.length}\n`;
  console.log(`> ${cmd.trim()}`);
  port.write(cmd);

  // Wait for KREAD_READY
  const ready = await waitFor('KREAD_READY', 5000);
  if (!ready) {
    console.error('KREAD_READY not received. Buffer:', accumBuf.slice(-200));
    port.close();
    process.exit(1);
  }
  console.log('< KREAD_READY');

  // Send binary data in 1KB chunks with flow control delay
  accumBuf = '';
  const chunkSize = 1024;
  for (let i = 0; i < file.length; i += chunkSize) {
    const chunk = file.subarray(i, Math.min(i + chunkSize, file.length));
    port.write(chunk);
    await wait(50);  // let device write to SD
    const pct = Math.round((i + chunk.length) / file.length * 100);
    process.stdout.write(`\r  Sending: ${pct}%`);
  }
  console.log('\r  Sending: 100%');

  // Wait for device to flush SD writes
  await wait(2000);

  // Send END with CRC32
  const crcVal = crc32.unsigned(file).toString(16).padStart(8, '0');
  const endCmd = `KREAD_END ${crcVal}\n`;
  console.log(`> ${endCmd.trim()}`);
  accumBuf = '';
  port.write(endCmd);

  // Wait for OK
  const ok = await waitFor('KREAD_OK', 5000);
  if (ok) {
    console.log('< KREAD_OK — transfer successful!');
  } else {
    console.error('Transfer may have failed. Buffer:', accumBuf.slice(-200));
  }

  port.close();
}

run().catch(e => { console.error(e); process.exit(1); });
