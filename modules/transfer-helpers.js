/**
 * Simple Transfer Helpers for TCPSocket
 * -------------------------------------
 * Clean API:
 *   - sendFile(socket, filePath, options?)
 *   - sendBuffer(socket, buffer, filename, options?)
 *   - enableReceiver(socket, options?)   ← call this to start receiving
 *
 * Uses amk2406/cache for tracking incoming transfers.
 */

const fs = require('fs');
const path = require('path');
const Cache = require('cache'); // amk2406/cache

const CHUNK_SIZE = 64 * 1024; // 64KB
const receiveCache = new Cache({ defaultTTL: 30 * 60, maxSize: 700 }); // 30 min TTL

// -----------------------------------------------------------------------------
// SENDER
// -----------------------------------------------------------------------------

/**
 * Send a real file from disk
 * @param {TCPSocket} socket
 * @param {string} filePath
 * @param {object} [options]
 * @param {string} [options.filename]     - custom name for the receiver
 * @param {function} [options.onProgress] - (sent, total) => {}
 */
async function sendFile(socket, filePath, options = {}) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) throw new Error('File not found: ' + absolute);

  const buffer = fs.readFileSync(absolute);
  const filename = options.filename || path.basename(absolute);

  return sendBuffer(socket, buffer, filename, options);
}

/**
 * Send any Buffer / Uint8Array
 * @param {TCPSocket} socket
 * @param {Buffer|Uint8Array} buffer
 * @param {string} filename
 * @param {object} [options]
 * @param {function} [options.onProgress] - (sent, total) => {}
 */
async function sendBuffer(socket, buffer, filename, options = {}) {
  if (!socket.isConnected()) throw new Error('Socket not connected');
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new Error('data must be a Buffer or Uint8Array');
  }

  const data = Buffer.from(buffer);
  const total = data.length;
  const fileId = 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

  // 1. Start
  const start = await socket.emit('file:start', {
    fileId,
    filename: path.basename(filename),
    size: total
  });
  if (!start?.ok) throw new Error(start?.error || 'Peer rejected file:start');

  // 2. Chunks
  let offset = 0;
  let index = 0;

  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = data.subarray(offset, end);

    const ack = await socket.emit('file:chunk', {
      fileId,
      index,
      data: chunk
    });

    if (!ack?.ok) {
      socket.emit('file:abort', { fileId }).catch(() => {});
      throw new Error(ack?.error || `Chunk ${index} rejected`);
    }

    offset = end;
    index++;

    if (options.onProgress) {
      options.onProgress(offset, total);
    }
  }

  // 3. End
  const result = await socket.emit('file:end', { fileId });
  if (!result?.ok) throw new Error(result?.error || 'Finalize failed');

  return result;
}

// -----------------------------------------------------------------------------
// RECEIVER
// -----------------------------------------------------------------------------

/**
 * Enable receiving files/buffers on this socket.
 * Call once per socket (client or server-side connection).
 *
 * @param {TCPSocket} socket
 * @param {object} [options]
 * @param {string} [options.saveDir='./received']
 * @param {boolean} [options.saveToDisk=true]     - false = only keep in memory
 * @param {function} [options.onStart]            - ({fileId, filename, size}) => {}
 * @param {function} [options.onProgress]         - (fileId, received, total) => {}
 * @param {function} [options.onComplete]         - ({fileId, filename, size, buffer?, savedAs?}) => {}
 * @param {function} [options.onError]            - (err, fileId) => {}
 */
function enableReceiver(socket, options = {}) {
  const saveDir = options.saveDir || path.join(process.cwd(), 'received');
  const saveToDisk = options.saveToDisk !== false;

  if (saveToDisk) {
    fs.mkdirSync(saveDir, { recursive: true });
  }

  // ----- start -----
  socket.on('file:start', (info, ack) => {
    try {
      if (!info?.fileId || !info.filename || typeof info.size !== 'number') {
        return ack?.({ ok: false, error: 'invalid start' });
      }

      const safeName = path.basename(info.filename);

      receiveCache.set(info.fileId, {
        fileId: info.fileId,
        filename: safeName,
        size: info.size,
        chunks: [],
        received: 0
      });

      options.onStart?.({ fileId: info.fileId, filename: safeName, size: info.size });
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
      options.onError?.(err, info?.fileId);
    }
  });

  // ----- chunk -----
  socket.on('file:chunk', (msg, ack) => {
    try {
      const t = receiveCache.get(msg.fileId);
      if (!t) return ack?.({ ok: false, error: 'unknown fileId' });

      const buf = Buffer.from(msg.data);
      t.chunks[msg.index] = buf;
      t.received += buf.length;

      // refresh TTL
      receiveCache.set(msg.fileId, t);

      options.onProgress?.(msg.fileId, t.received, t.size);
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
      options.onError?.(err, msg?.fileId);
    }
  });

  // ----- end -----
  socket.on('file:end', (msg, ack) => {
    try {
      const t = receiveCache.get(msg.fileId);
      if (!t) return ack?.({ ok: false, error: 'unknown fileId' });

      // reassemble
      const parts = [];
      for (let i = 0; i < t.chunks.length; i++) {
        if (!t.chunks[i]) throw new Error('Missing chunk ' + i);
        parts.push(t.chunks[i]);
      }
      const full = Buffer.concat(parts);

      if (full.length !== t.size) {
        throw new Error(`Size mismatch: expected ${t.size}, got ${full.length}`);
      }

      let savedAs = null;
      if (saveToDisk) {
        savedAs = path.join(saveDir, t.filename);
        fs.writeFileSync(savedAs, full);
      }

      receiveCache.delete(msg.fileId);

      const result = {
        ok: true,
        fileId: t.fileId,
        filename: t.filename,
        size: full.length,
        buffer: full,          // always available
        savedAs                // null if saveToDisk = false
      };

      options.onComplete?.(result);
      ack?.(result);
    } catch (err) {
      receiveCache.delete(msg?.fileId);
      ack?.({ ok: false, error: err.message });
      options.onError?.(err, msg?.fileId);
    }
  });

  // ----- abort -----
  socket.on('file:abort', (msg) => {
    if (msg?.fileId) receiveCache.delete(msg.fileId);
  });
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

module.exports = {
  sendFile,
  sendBuffer,
  enableReceiver
};
