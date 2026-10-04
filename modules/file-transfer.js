/**
 * Helpers to send / receive large data (files or Buffers) over
 * amk2406/tcp-socket (https://github.com/amk2406/tcp-socket).
 *
 * Protocol (chunked + acks):
 *   file:start   → ack { ok, nextIndex, receivedBytes }
 *   file:chunk   → ack { ok, nextIndex, receivedBytes }
 *   file:end     → ack { ok, fileId, filename, size, savedAs, buffer? }
 *   file:pause   → ack { ok }
 *   file:status  → ack { ok, exists, nextIndex, receivedBytes, size, filename }
 *   file:abort
 *
 * Pause / resume:
 *   Sender can pause mid-transfer. Chunks already acked stay on the receiver.
 *   On disconnect the sender stops; on reconnect it asks file:status and
 *   continues from nextIndex instead of starting over.
 *
 * Receiver writes a .part file as chunks arrive so progress survives a
 * process-level reconnect of the peer (same saveDir + same fileId).
 *
 * Tracks in-progress receives with Cache by amk2406
 * (https://github.com/amk2406/cache).
 *
 * Main functions:
 *   enableReceiver(socket, options)
 *   sendFile(socket, filePath, opts)
 *   sendBuffer(socket, buffer, filename, opts)
 *   pauseTransfer(fileId)
 *   resumeTransfer(fileId)
 *   abortTransfer(socket, fileId)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Cache = require('cache'); // amk2406/cache

const DEFAULT_CHUNK_SIZE = 100 * 1024; // 100 KB
const TRANSFER_TTL = 30 * 60;         // 30 minutes

// In-progress incoming transfers (fileId → state)
const receiveCache = new Cache({
  defaultTTL: TRANSFER_TTL,
  maxSize: 50
});

// In-progress outgoing transfers (fileId → controller)
const sendCache = new Cache({
  defaultTTL: TRANSFER_TTL,
  maxSize: 50
});

function makeFileId() {
  return `f_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function partPathFor(savePath) {
  return `${savePath}.part`;
}

function metaPathFor(savePath) {
  return `${savePath}.part.meta.json`;
}

function writeMeta(savePath, meta) {
  fs.writeFileSync(metaPathFor(savePath), JSON.stringify(meta));
}

function readMeta(savePath) {
  const p = metaPathFor(savePath);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function removePartFiles(savePath) {
  for (const p of [partPathFor(savePath), metaPathFor(savePath)]) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // ignore
    }
  }
}

function waitUntilConnected(socket, timeoutMs = 0) {
  if (socket?.isConnected?.()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer = null;
    const onUp = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      socket.off?.('connect', onUp);
      socket.off?.('reconnect', onUp);
    };
    socket.on?.('connect', onUp);
    socket.on?.('reconnect', onUp);
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for socket reconnect'));
      }, timeoutMs);
    }
  });
}

function emitAck(socket, event, payload, timeoutMs) {
  if (!socket?.isConnected?.()) {
    return Promise.reject(new Error('Socket not connected'));
  }
  // tcp-socket emit() already returns a Promise when an ack is expected
  // (pass a callback OR just await). We await the promise form.
  return Promise.resolve(socket.emit(event, payload)).then((ack) => ack);
}

// =============================================================================
// RECEIVER – call this once per socket
// =============================================================================

/**
 * Enable receiving of files / buffers on this socket.
 *
 * @param {object} socket               TCPSocket instance
 * @param {object} [options]
 * @param {string} [options.saveDir]    Where to save files (default: ./received)
 * @param {boolean} [options.saveToDisk=true]
 * @param {function} [options.onStart]
 * @param {function} [options.onProgress]
 * @param {function} [options.onPause]
 * @param {function} [options.onComplete]
 * @param {function} [options.onError]
 */
function enableReceiver(socket, options = {}) {
  const saveDir = options.saveDir || path.join(process.cwd(), 'received');
  const saveToDisk = options.saveToDisk !== false;

  if (saveToDisk) {
    fs.mkdirSync(saveDir, { recursive: true });
  }

  function persistTransfer(transfer) {
    receiveCache.set(transfer.fileId, transfer, TRANSFER_TTL);
    if (saveToDisk && transfer.savePath) {
      writeMeta(transfer.savePath, {
        fileId: transfer.fileId,
        filename: transfer.filename,
        size: transfer.size,
        chunkSize: transfer.chunkSize,
        nextIndex: transfer.nextIndex,
        receivedBytes: transfer.receivedBytes,
        saveToDisk: true
      });
    }
  }

  function loadOrCreateTransfer(info) {
    const existing = receiveCache.get(info.fileId);
    if (existing) return existing;

    const safeName = path.basename(info.filename);
    const savePath = path.join(saveDir, safeName);
    const meta = saveToDisk ? readMeta(savePath) : null;

    // Resume from a leftover .part written before this process started,
    // but only if fileId + size + chunkSize match.
    if (
      meta &&
      meta.fileId === info.fileId &&
      meta.size === info.size &&
      (!info.chunkSize || meta.chunkSize === info.chunkSize) &&
      fs.existsSync(partPathFor(savePath))
    ) {
      const stat = fs.statSync(partPathFor(savePath));
      const transfer = {
        fileId: info.fileId,
        filename: safeName,
        size: info.size,
        chunkSize: info.chunkSize || meta.chunkSize || DEFAULT_CHUNK_SIZE,
        savePath,
        saveToDisk,
        nextIndex: meta.nextIndex || 0,
        receivedBytes: Math.min(stat.size, meta.receivedBytes || stat.size),
        chunks: saveToDisk ? null : [],
        paused: false,
        fd: null
      };
      persistTransfer(transfer);
      return transfer;
    }

    const transfer = {
      fileId: info.fileId,
      filename: safeName,
      size: info.size,
      chunkSize: info.chunkSize || DEFAULT_CHUNK_SIZE,
      savePath,
      saveToDisk,
      nextIndex: 0,
      receivedBytes: 0,
      chunks: saveToDisk ? null : [],
      paused: false,
      fd: null
    };

    if (saveToDisk) {
      // Pre-allocate / reset the part file for a fresh transfer of this name.
      fs.writeFileSync(partPathFor(savePath), Buffer.alloc(0));
    }

    persistTransfer(transfer);
    return transfer;
  }

  function openPartFd(transfer) {
    if (!transfer.saveToDisk) return;
    if (transfer.fd) return;
    transfer.fd = fs.openSync(partPathFor(transfer.savePath), 'r+');
  }

  function closePartFd(transfer) {
    if (transfer.fd != null) {
      try { fs.closeSync(transfer.fd); } catch { /* ignore */ }
      transfer.fd = null;
    }
  }

  function snapshot(transfer) {
    return {
      ok: true,
      exists: true,
      fileId: transfer.fileId,
      filename: transfer.filename,
      size: transfer.size,
      chunkSize: transfer.chunkSize,
      nextIndex: transfer.nextIndex,
      receivedBytes: transfer.receivedBytes,
      paused: !!transfer.paused
    };
  }

  // ----- start (or resume handshake) -----
  socket.on('file:start', (info, ack) => {
    try {
      if (!info?.fileId || !info.filename || typeof info.size !== 'number') {
        return ack?.({ ok: false, error: 'invalid start payload' });
      }

      const transfer = loadOrCreateTransfer(info);
      transfer.paused = false;
      persistTransfer(transfer);

      options.onStart?.({
        fileId: transfer.fileId,
        filename: transfer.filename,
        size: transfer.size,
        resumed: transfer.nextIndex > 0,
        nextIndex: transfer.nextIndex,
        receivedBytes: transfer.receivedBytes
      });

      ack?.(snapshot(transfer));
    } catch (err) {
      ack?.({ ok: false, error: err.message });
      options.onError?.(err, info?.fileId);
    }
  });

  // ----- status (used after reconnect) -----
  socket.on('file:status', (msg, ack) => {
    try {
      const transfer = msg?.fileId ? receiveCache.get(msg.fileId) : null;
      if (!transfer) {
        return ack?.({ ok: true, exists: false, nextIndex: 0, receivedBytes: 0 });
      }
      ack?.(snapshot(transfer));
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  // ----- chunk -----
  socket.on('file:chunk', (msg, ack) => {
    try {
      const transfer = receiveCache.get(msg.fileId);
      if (!transfer) return ack?.({ ok: false, error: 'unknown fileId' });
      if (transfer.paused) return ack?.({ ok: false, error: 'paused', paused: true });

      const buf = Buffer.isBuffer(msg.data) ? msg.data : Buffer.from(msg.data);
      const index = msg.index;

      // Ignore / reject out-of-order chunks. Sender resumes from nextIndex.
      if (index !== transfer.nextIndex) {
        return ack?.({
          ok: false,
          error: 'unexpected index',
          nextIndex: transfer.nextIndex,
          receivedBytes: transfer.receivedBytes
        });
      }

      if (transfer.saveToDisk) {
        openPartFd(transfer);
        fs.writeSync(transfer.fd, buf, 0, buf.length, transfer.receivedBytes);
      } else {
        transfer.chunks[index] = buf;
      }

      transfer.nextIndex = index + 1;
      transfer.receivedBytes += buf.length;
      persistTransfer(transfer);

      options.onProgress?.(transfer.fileId, transfer.receivedBytes, transfer.size);
      ack?.(snapshot(transfer));
    } catch (err) {
      ack?.({ ok: false, error: err.message });
      options.onError?.(err, msg?.fileId);
    }
  });

  // ----- pause (receiver side mark) -----
  socket.on('file:pause', (msg, ack) => {
    try {
      const transfer = receiveCache.get(msg?.fileId);
      if (!transfer) return ack?.({ ok: false, error: 'unknown fileId' });
      transfer.paused = true;
      closePartFd(transfer);
      persistTransfer(transfer);
      options.onPause?.({
        fileId: transfer.fileId,
        nextIndex: transfer.nextIndex,
        receivedBytes: transfer.receivedBytes
      });
      ack?.(snapshot(transfer));
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  // ----- end -----
  socket.on('file:end', (msg, ack) => {
    try {
      const transfer = receiveCache.get(msg.fileId);
      if (!transfer) return ack?.({ ok: false, error: 'unknown fileId' });

      if (transfer.receivedBytes !== transfer.size) {
        throw new Error(
          `Size mismatch: expected ${transfer.size}, got ${transfer.receivedBytes}`
        );
      }

      let fullBuffer = null;
      let savedAs = null;

      if (transfer.saveToDisk) {
        closePartFd(transfer);
        const part = partPathFor(transfer.savePath);
        // Atomic-ish finish: rename .part → final name
        if (fs.existsSync(transfer.savePath)) {
          fs.unlinkSync(transfer.savePath);
        }
        fs.renameSync(part, transfer.savePath);
        try { fs.unlinkSync(metaPathFor(transfer.savePath)); } catch { /* ignore */ }
        savedAs = transfer.savePath;
        // Always also expose the buffer for backward compatibility
        fullBuffer = fs.readFileSync(transfer.savePath);
      } else {
        const ordered = [];
        for (let i = 0; i < transfer.nextIndex; i++) {
          if (!transfer.chunks[i]) throw new Error(`Missing chunk ${i}`);
          ordered.push(transfer.chunks[i]);
        }
        fullBuffer = Buffer.concat(ordered);
        if (fullBuffer.length !== transfer.size) {
          throw new Error(
            `Size mismatch: expected ${transfer.size}, got ${fullBuffer.length}`
          );
        }
      }

      receiveCache.delete(msg.fileId);

      const result = {
        ok: true,
        fileId: transfer.fileId,
        filename: transfer.filename,
        size: transfer.size,
        buffer: fullBuffer,
        savedAs
      };

      options.onComplete?.(result);
      ack?.(result);
    } catch (err) {
      const t = receiveCache.get(msg?.fileId);
      if (t) closePartFd(t);
      receiveCache.delete(msg?.fileId);
      ack?.({ ok: false, error: err.message });
      options.onError?.(err, msg?.fileId);
    }
  });

  // ----- abort -----
  socket.on('file:abort', (msg) => {
    if (!msg?.fileId) return;
    const transfer = receiveCache.get(msg.fileId);
    if (transfer) {
      closePartFd(transfer);
      if (transfer.saveToDisk) removePartFiles(transfer.savePath);
    }
    receiveCache.delete(msg.fileId);
  });
}

// =============================================================================
// SENDER – pause / resume / reconnect
// =============================================================================

function getController(fileId) {
  return sendCache.get(fileId);
}

function attachSocketLifecycle(controller) {
  const socket = controller.socket;
  if (!socket || controller._lifeAttached) return;
  controller._lifeAttached = true;

  controller._onDisconnect = () => {
    if (controller.status === 'sending') {
      controller.status = 'disconnected';
      controller.onPause?.({
        fileId: controller.fileId,
        reason: 'disconnect',
        nextIndex: controller.nextIndex,
        sentBytes: controller.sentBytes
      });
    }
  };

  controller._onReconnect = async () => {
    if (controller.status !== 'disconnected' && controller.status !== 'paused') return;
    if (controller.status === 'paused') return; // stay paused until user resumes
    try {
      await resumeOutgoing(controller);
    } catch (err) {
      controller.reject?.(err);
    }
  };

  socket.on?.('disconnect', controller._onDisconnect);
  socket.on?.('reconnect', controller._onReconnect);
  socket.on?.('connect', controller._onReconnect);
}

function detachSocketLifecycle(controller) {
  const socket = controller.socket;
  if (!socket || !controller._lifeAttached) return;
  socket.off?.('disconnect', controller._onDisconnect);
  socket.off?.('reconnect', controller._onReconnect);
  socket.off?.('connect', controller._onReconnect);
  controller._lifeAttached = false;
}

async function handshakeStart(controller) {
  const startAck = await emitAck(controller.socket, 'file:start', {
    fileId: controller.fileId,
    filename: path.basename(controller.filename),
    size: controller.total,
    chunkSize: controller.chunkSize
  });

  if (!startAck || startAck.ok === false) {
    throw new Error(`Start rejected: ${startAck?.error || 'unknown'}`);
  }

  if (typeof startAck.nextIndex === 'number' && startAck.nextIndex > 0) {
    controller.nextIndex = startAck.nextIndex;
    controller.sentBytes = startAck.receivedBytes || (startAck.nextIndex * controller.chunkSize);
    if (controller.sentBytes > controller.total) controller.sentBytes = controller.total;
  }
}

async function queryStatus(controller) {
  try {
    const ack = await emitAck(controller.socket, 'file:status', {
      fileId: controller.fileId
    });
    if (ack?.ok && ack.exists) {
      controller.nextIndex = ack.nextIndex || 0;
      controller.sentBytes = ack.receivedBytes || 0;
      return true;
    }
  } catch {
    // fall through – treat as fresh
  }
  return false;
}

function readChunk(controller, index) {
  const offset = index * controller.chunkSize;
  if (offset >= controller.total) return null;
  const end = Math.min(offset + controller.chunkSize, controller.total);

  if (controller.buffer) {
    return controller.buffer.subarray(offset, end);
  }

  const length = end - offset;
  const buf = Buffer.allocUnsafe(length);
  const fd = fs.openSync(controller.filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, length, offset);
  } finally {
    fs.closeSync(fd);
  }
  return buf;
}

async function sendLoop(controller) {
  controller.status = 'sending';

  while (controller.sentBytes < controller.total) {
    if (controller.status === 'aborted') {
      throw new Error('Transfer aborted');
    }
    if (controller.status === 'paused' || controller.status === 'disconnected') {
      return; // wait for resume
    }

    if (!controller.socket?.isConnected?.()) {
      controller.status = 'disconnected';
      controller.onPause?.({
        fileId: controller.fileId,
        reason: 'disconnect',
        nextIndex: controller.nextIndex,
        sentBytes: controller.sentBytes
      });
      return;
    }

    const index = controller.nextIndex;
    const chunk = readChunk(controller, index);
    if (!chunk) break;

    let ack;
    try {
      ack = await emitAck(controller.socket, 'file:chunk', {
        fileId: controller.fileId,
        index,
        offset: index * controller.chunkSize,
        data: chunk
      });
    } catch (err) {
      // Network drop mid-ack → wait for reconnect rather than failing hard
      controller.status = 'disconnected';
      controller.onPause?.({
        fileId: controller.fileId,
        reason: 'disconnect',
        error: err.message,
        nextIndex: controller.nextIndex,
        sentBytes: controller.sentBytes
      });
      return;
    }

    if (!ack || ack.ok === false) {
      if (ack?.paused || ack?.error === 'paused') {
        controller.status = 'paused';
        return;
      }
      if (typeof ack?.nextIndex === 'number') {
        // Receiver is ahead / we were out of order – snap to its cursor
        controller.nextIndex = ack.nextIndex;
        controller.sentBytes = ack.receivedBytes || ack.nextIndex * controller.chunkSize;
        continue;
      }
      await controller.socket.emit('file:abort', { fileId: controller.fileId }).catch(() => {});
      throw new Error(`Chunk ${index} rejected: ${ack?.error || 'unknown'}`);
    }

    controller.nextIndex = typeof ack.nextIndex === 'number' ? ack.nextIndex : index + 1;
    controller.sentBytes =
      typeof ack.receivedBytes === 'number' ? ack.receivedBytes : controller.sentBytes + chunk.length;
    sendCache.set(controller.fileId, controller, TRANSFER_TTL);
    controller.onProgress?.(controller.sentBytes, controller.total);
  }

  if (controller.sentBytes < controller.total) return;

  const endResult = await emitAck(controller.socket, 'file:end', {
    fileId: controller.fileId
  });

  if (!endResult || endResult.ok === false) {
    throw new Error(`End rejected: ${endResult?.error || 'unknown'}`);
  }

  controller.status = 'complete';
  detachSocketLifecycle(controller);
  sendCache.delete(controller.fileId);
  controller.resolve?.(endResult);
  return endResult;
}

async function resumeOutgoing(controller) {
  if (controller.status === 'complete' || controller.status === 'aborted') {
    return controller.promise;
  }

  if (!controller.socket?.isConnected?.()) {
    await waitUntilConnected(controller.socket, controller.reconnectTimeoutMs || 0);
  }

  const known = await queryStatus(controller);
  if (!known) {
    await handshakeStart(controller);
  }

  controller.status = 'sending';
  controller.onResume?.({
    fileId: controller.fileId,
    nextIndex: controller.nextIndex,
    sentBytes: controller.sentBytes
  });

  return sendLoop(controller);
}

function createController(socket, opts) {
  const controller = {
    socket,
    fileId: opts.fileId,
    filename: opts.filename,
    filePath: opts.filePath || null,
    buffer: opts.buffer || null,
    total: opts.total,
    chunkSize: opts.chunkSize || DEFAULT_CHUNK_SIZE,
    nextIndex: 0,
    sentBytes: 0,
    status: 'idle', // idle | sending | paused | disconnected | complete | aborted
    onProgress: opts.onProgress,
    onPause: opts.onPause,
    onResume: opts.onResume,
    reconnectTimeoutMs: opts.reconnectTimeoutMs || 0,
    resolve: null,
    reject: null,
    promise: null
  };

  controller.promise = new Promise((resolve, reject) => {
    controller.resolve = resolve;
    controller.reject = (err) => {
      controller.status = 'aborted';
      detachSocketLifecycle(controller);
      sendCache.delete(controller.fileId);
      reject(err);
    };
  });

  // Attach handle methods onto the promise so callers can:
  //   const t = sendFile(...)
  //   t.pause(); t.resume(); await t;
  controller.promise.fileId = controller.fileId;
  controller.promise.pause = () => pauseTransfer(controller.fileId);
  controller.promise.resume = () => resumeTransfer(controller.fileId);
  controller.promise.abort = () => abortTransfer(controller.socket, controller.fileId);
  controller.promise.getState = () => ({
    fileId: controller.fileId,
    filename: controller.filename,
    status: controller.status,
    nextIndex: controller.nextIndex,
    sentBytes: controller.sentBytes,
    total: controller.total
  });

  sendCache.set(controller.fileId, controller, TRANSFER_TTL);
  attachSocketLifecycle(controller);
  return controller;
}

async function startOutgoing(controller) {
  if (!controller.socket?.isConnected?.()) {
    throw new Error('Socket not connected');
  }
  await handshakeStart(controller);
  // fire-and-forget the loop; the promise settles when complete/abort
  sendLoop(controller).catch((err) => controller.reject?.(err));
  return controller.promise;
}

// =============================================================================
// PUBLIC SEND FUNCTIONS
// =============================================================================

/**
 * Send a file from disk. Does not load the whole file into memory.
 *
 * The returned Promise resolves with the receiver's file:end ack.
 * Extra methods on the promise:
 *   .pause() .resume() .abort() .getState() .fileId
 *
 * @param {object} socket
 * @param {string} filePath
 * @param {object} [opts]
 * @param {string} [opts.filename]
 * @param {string} [opts.fileId]       Reuse an id to resume a previous send
 * @param {number} [opts.chunkSize]
 * @param {function} [opts.onProgress] (sent, total) => {}
 * @param {function} [opts.onPause]
 * @param {function} [opts.onResume]
 */
async function sendFile(socket, filePath, opts = {}) {
  if (!socket?.isConnected?.()) throw new Error('Socket not connected');

  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);

  const stat = fs.statSync(abs);
  if (!stat.isFile()) throw new Error('Not a regular file');

  const fileId = opts.fileId || makeFileId();
  const existing = sendCache.get(fileId);
  if (existing && existing.status !== 'complete' && existing.status !== 'aborted') {
    existing.socket = socket;
    attachSocketLifecycle(existing);
    return resumeOutgoing(existing).then(() => existing.promise);
  }

  const controller = createController(socket, {
    fileId,
    filename: opts.filename || path.basename(abs),
    filePath: abs,
    total: stat.size,
    chunkSize: opts.chunkSize,
    onProgress: opts.onProgress,
    onPause: opts.onPause,
    onResume: opts.onResume,
    reconnectTimeoutMs: opts.reconnectTimeoutMs
  });

  return startOutgoing(controller);
}

/**
 * Send an in-memory Buffer (or Uint8Array).
 * Same pause / resume / reconnect behaviour as sendFile.
 */
async function sendBuffer(socket, buffer, filename = 'data.bin', opts = {}) {
  if (!socket?.isConnected?.()) throw new Error('Socket not connected');
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new Error('data must be a Buffer or Uint8Array');
  }

  const data = Buffer.from(buffer);
  const fileId = opts.fileId || makeFileId();
  const existing = sendCache.get(fileId);
  if (existing && existing.status !== 'complete' && existing.status !== 'aborted') {
    existing.socket = socket;
    existing.buffer = data;
    attachSocketLifecycle(existing);
    return resumeOutgoing(existing).then(() => existing.promise);
  }

  const controller = createController(socket, {
    fileId,
    filename: path.basename(filename),
    buffer: data,
    total: data.length,
    chunkSize: opts.chunkSize,
    onProgress: opts.onProgress,
    onPause: opts.onPause,
    onResume: opts.onResume,
    reconnectTimeoutMs: opts.reconnectTimeoutMs
  });

  return startOutgoing(controller);
}

/**
 * Pause an outgoing transfer. Already-acked chunks stay on the receiver.
 */
async function pauseTransfer(fileId) {
  const controller = getController(fileId);
  if (!controller) return false;
  if (controller.status === 'complete' || controller.status === 'aborted') return false;

  controller.status = 'paused';
  if (controller.socket?.isConnected?.()) {
    await controller.socket.emit('file:pause', { fileId }).catch(() => {});
  }
  controller.onPause?.({
    fileId,
    reason: 'user',
    nextIndex: controller.nextIndex,
    sentBytes: controller.sentBytes
  });
  return true;
}

/**
 * Resume a paused or disconnected outgoing transfer.
 * Queries the receiver for nextIndex so we never resend acked data.
 */
async function resumeTransfer(fileId) {
  const controller = getController(fileId);
  if (!controller) throw new Error(`Unknown transfer: ${fileId}`);
  if (controller.status === 'complete') return controller.promise;
  if (controller.status === 'aborted') throw new Error('Transfer aborted');
  return resumeOutgoing(controller);
}

/**
 * Abort a transfer on both sides.
 */
async function abortTransfer(socket, fileId) {
  const controller = getController(fileId);
  if (controller) {
    controller.status = 'aborted';
    detachSocketLifecycle(controller);
    controller.reject?.(new Error('Transfer aborted'));
    sendCache.delete(fileId);
    socket = socket || controller.socket;
  }

  if (socket?.isConnected?.()) {
    await socket.emit('file:abort', { fileId }).catch(() => {});
  }

  const incoming = receiveCache.get(fileId);
  if (incoming) {
    if (incoming.fd != null) {
      try { fs.closeSync(incoming.fd); } catch { /* ignore */ }
    }
    if (incoming.saveToDisk) removePartFiles(incoming.savePath);
    receiveCache.delete(fileId);
  }
}

/**
 * Optional helper: after you get a new TCPSocket (or the same one reconnects),
 * re-bind receiver handlers and continue any outgoing transfers.
 */
function bindSocket(socket, receiverOptions) {
  if (receiverOptions !== false) {
    enableReceiver(socket, receiverOptions || {});
  }
  // Re-attach outgoing controllers that were pointing at a dead socket
  for (const [fileId, controller] of (sendCache.entries?.() || [])) {
    controller.socket = socket;
    attachSocketLifecycle(controller);
    if (controller.status === 'disconnected') {
      resumeOutgoing(controller).catch((err) => controller.reject?.(err));
    }
  }
  return { incoming: receiveCache.size(), outgoing: sendCache.size() };
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  enableReceiver,
  enableFileReceiver: enableReceiver, // alias for backward compatibility
  bindSocket,

  sendFile,
  sendBuffer,

  pauseTransfer,
  resumeTransfer,
  abortTransfer,

  getTransferStats: () => ({
    incoming: receiveCache.size(),
    outgoing: sendCache.size(),
    active: receiveCache.size() + sendCache.size(),
    stats: receiveCache.getStats?.() || null
  })
};
