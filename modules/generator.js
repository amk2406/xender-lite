const { randomBytes, randomInt, randomUUID } = require('crypto');
const net = require('net');

// ======================
// HELPER DATA
// ======================
const ADJECTIVES = [
  'happy', 'swift', 'brave', 'calm', 'bright', 'clever', 'cool', 'epic',
  'fancy', 'gentle', 'happy', 'jolly', 'kind', 'lively', 'mighty', 'noble',
  'proud', 'quick', 'silent', 'tidy', 'vivid', 'wise', 'zesty', 'bold',
  'cosmic', 'digital', 'electric', 'frozen', 'golden', 'hidden', 'iron',
  'jade', 'lunar', 'mystic', 'neon', 'omega', 'pixel', 'quantum', 'solar'
];

const NOUNS = [
  'tiger', 'eagle', 'wolf', 'dragon', 'phoenix', 'lion', 'bear', 'falcon',
  'shark', 'panther', 'raven', 'cobra', 'hawk', 'fox', 'otter', 'panda',
  'storm', 'river', 'mountain', 'ocean', 'forest', 'shadow', 'blade',
  'spark', 'nova', 'comet', 'orbit', 'pixel', 'code', 'byte', 'node',
  'cloud', 'wave', 'flame', 'frost', 'stone', 'crystal', 'ember'
];

const EMOJIS = [
  '🚀', '🔥', '✨', '🎉', '💡', '🌈', '⚡', '🎯', '🏆', '💎',
  '🌟', '🎨', '🎵', '📚', '💻', '🔮', '🍕', '☕', '🐱', '🐶',
  '🦄', '🌍', '🌙', '☀️', '🌸', '🍀', '🎸', '🎮', '📱', '🧠'
];

const COLOR_NAMES = [
  'red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'brown',
  'black', 'white', 'gray', 'cyan', 'magenta', 'lime', 'teal', 'indigo',
  'violet', 'gold', 'silver', 'crimson', 'navy', 'olive', 'maroon', 'aqua'
];

const MIME_TYPES = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'application/json', 'text/plain', 'text/html',
  'text/css', 'application/javascript', 'audio/mpeg', 'video/mp4',
  'application/zip', 'application/xml'
];

const EXTENSIONS = [
  'txt', 'pdf', 'png', 'jpg', 'gif', 'json', 'js', 'ts', 'html', 'css',
  'md', 'csv', 'xml', 'zip', 'mp3', 'mp4', 'svg', 'webp'
];

// ======================
// UUID
// ======================
function uuid() {
  return randomUUID();
}

// ======================
// TOKEN / SECRET
// ======================
function token(length = 32, encoding = 'hex') {
  if (length < 1) throw new Error('Length must be at least 1');
  const buf = randomBytes(length);

  switch (encoding) {
    case 'hex': return buf.toString('hex');
    case 'base64': return buf.toString('base64');
    case 'base64url': return buf.toString('base64url');
    default: throw new Error(`Unsupported encoding: ${encoding}`);
  }
}

function apiKey(prefix = 'sk', length = 32) {
  return `\( {prefix}_ \){token(length, 'hex')}`;
}

function bytes(size = 16) {
  return randomBytes(size);
}

function base64(length = 24) {
  return token(length, 'base64');
}

// ======================
// SALT
// ======================
function salt(bytes = 16) {
  if (bytes < 8) throw new Error('Salt should be at least 8 bytes');
  return randomBytes(bytes).toString('hex');
}

// ======================
// PORT
// ======================
function port(min = 1024, max = 65535) {
  if (min < 0 || max > 65535 || min > max) {
    throw new Error('Invalid port range');
  }
  return randomInt(min, max + 1);
}

function generatePortNumber(min = 1024, max = 65535) {
  if (min < 0 || max > 65535 || min > max) {
    throw new Error('Invalid port range');
  }
  return randomInt(min, max + 1);
}

function availablePort(start = 3000, end = 65535) {
  return new Promise((resolve, reject) => {
    const tryPort = (p) => {
      if (p > end) return reject(new Error('No available port found'));

      const server = net.createServer();
      server.unref();

      server.on('error', () => tryPort(p + 1));
      server.listen(p, () => {
        server.close(() => resolve(p));
      });
    };
    tryPort(start);
  });
}

// ======================
// NUMBERS
// ======================
function int(min = 0, max = 100) {
  return randomInt(min, max + 1);
}

function float(min = 0, max = 1, decimals = 2) {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(decimals));
}

function boolean(probability = 0.5) {
  return Math.random() < probability;
}

// ======================
// STRINGS
// ======================
function string(length = 16, alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += alphabet[randomInt(0, alphabet.length)];
  }
  return result;
}

function alphanumeric(length = 16) {
  return string(length, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
}

function numeric(length = 6) {
  return string(length, '0123456789');
}

function hex(length = 16) {
  return string(length, '0123456789abcdef');
}

function base58(length = 16) {
  return string(length, '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');
}

function shortId(length = 12) {
  return string(length, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-');
}

function nanoid(length = 21) {
  return string(length, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-');
}

// ======================
// PASSWORD & OTP
// ======================
function password(options = {}) {
  const {
    length = 16,
    uppercase = true,
    lowercase = true,
    numbers = true,
    symbols = true,
  } = options;

  let alphabet = '';
  if (lowercase) alphabet += 'abcdefghijklmnopqrstuvwxyz';
  if (uppercase) alphabet += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (numbers) alphabet += '0123456789';
  if (symbols) alphabet += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (!alphabet) throw new Error('At least one character set must be enabled');
  return string(length, alphabet);
}

function otp(length = 6) {
  return numeric(length);
}

// ======================
// USERNAME / SLUG
// ======================
function username() {
  const adj = ADJECTIVES[randomInt(0, ADJECTIVES.length)];
  const noun = NOUNS[randomInt(0, NOUNS.length)];
  const num = int(1, 99);
  return `\( {adj} \){noun}${num}`;
}

function slug() {
  const adj = ADJECTIVES[randomInt(0, ADJECTIVES.length)];
  const noun = NOUNS[randomInt(0, NOUNS.length)];
  const num = int(10, 99);
  return `\( {adj}- \){noun}-${num}`;
}

// ======================
// EMOJI
// ======================
function emoji() {
  return EMOJIS[randomInt(0, EMOJIS.length)];
}

function emojis(count = 3) {
  return Array.from({ length: count }, () => emoji()).join('');
}

// ======================
// CREDIT CARD (Luhn valid)
// ======================
function _luhn(number) {
  let sum = 0;
  let shouldDouble = false;

  for (let i = number.length - 1; i >= 0; i--) {
    let digit = parseInt(number[i], 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function creditCard() {
  // Generate 15 digits, then calculate check digit
  let number = '4' + numeric(14); // Visa-like
  for (let i = 0; i <= 9; i++) {
    const candidate = number + i;
    if (_luhn(candidate)) return candidate.match(/.{1,4}/g).join(' ');
  }
  return creditCard(); // extremely rare fallback
}

function cvv(length = 3) {
  return numeric(length);
}

function expiry() {
  const month = String(int(1, 12)).padStart(2, '0');
  const year = String(int(25, 32)); // 2025–2032
  return `\( {month}/ \){year}`;
}

// ======================
// CONTACT
// ======================
function phone(countryCode = '+1') {
  return `\( {countryCode} ( \){int(200, 999)}) \( {int(200, 999)}- \){int(1000, 9999)}`;
}

function email() {
  const name = username().toLowerCase();
  const domains = ['example.com', 'mail.com', 'test.org', 'demo.net', 'email.io'];
  return `\( {name}@ \){domains[randomInt(0, domains.length)]}`;
}

// ======================
// DOMAIN / URL
// ======================
function domain() {
  const name = slug().replace(/-/g, '');
  const tlds = ['com', 'net', 'org', 'io', 'dev', 'app', 'co'];
  return `\( {name}. \){tlds[randomInt(0, tlds.length)]}`;
}

function url() {
  const protocols = ['https', 'http'];
  const path = slug();
  return `\( {protocols[randomInt(0, 2)]}:// \){domain()}/${path}`;
}

// ======================
// NETWORK
// ======================
function ipv4() {
  return `\( {int(1, 255)}. \){int(0, 255)}.\( {int(0, 255)}. \){int(1, 254)}`;
}

function ip() {
  return ipv4();
}

function ipv6() {
  return Array.from({ length: 8 }, () => hex(4)).join(':');
}

function mac() {
  return Array.from({ length: 6 }, () => hex(2)).join(':');
}

// ======================
// GEO
// ======================
function lat() {
  return float(-90, 90, 6);
}

function lng() {
  return float(-180, 180, 6);
}

function coordinates() {
  return { lat: lat(), lng: lng() };
}

// ======================
// COLOR
// ======================
function hexColor() {
  return '#' + hex(6);
}

function rgb() {
  return { r: int(0, 255), g: int(0, 255), b: int(0, 255) };
}

function hsl() {
  return { h: int(0, 360), s: int(0, 100), l: int(0, 100) };
}

function colorName() {
  return COLOR_NAMES[randomInt(0, COLOR_NAMES.length)];
}

// ======================
// DATE
// ======================
function date(start = new Date(2000, 0, 1), end = new Date()) {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return new Date(startTime + Math.random() * (endTime - startTime));
}

// ======================
// IDs
// ======================
function ulid() {
  // Simple ULID-like (timestamp + randomness)
  const time = Date.now().toString(36).toUpperCase().padStart(10, '0');
  const random = string(16, '0123456789ABCDEFGHJKMNPQRSTVWXYZ');
  return time + random;
}

function objectId() {
  // MongoDB-style 24-char hex
  const time = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const random = hex(16);
  return time + random;
}

// ======================
// FILE
// ======================
function fileName(ext) {
  const name = slug().replace(/-/g, '_');
  const extension = ext || EXTENSIONS[randomInt(0, EXTENSIONS.length)];
  return `\( {name}. \){extension}`;
}

function mimeType() {
  return MIME_TYPES[randomInt(0, MIME_TYPES.length)];
}

// ======================
// OTHER
// ======================
function userAgent() {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
  ];
  return agents[randomInt(0, agents.length)];
}

function semver() {
  return `\( {int(0, 5)}. \){int(0, 20)}.${int(0, 30)}`;
}

// ======================
// ARRAY HELPERS
// ======================
function pick(array) {
  if (!Array.isArray(array) || array.length === 0) {
    throw new Error('Array must not be empty');
  }
  return array[randomInt(0, array.length)];
}

function choice(array) {
  return pick(array);
}

function sample(array, count = 1) {
  if (!Array.isArray(array) || array.length === 0) {
    throw new Error('Array must not be empty');
  }
  if (count > array.length) count = array.length;

  const copy = [...array];
  const result = [];
  for (let i = 0; i < count; i++) {
    const index = randomInt(0, copy.length);
    result.push(copy.splice(index, 1)[0]);
  }
  return result;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ======================
// EXPORT ALL
// ======================
module.exports = {
  // UUID & IDs
  uuid,
  nanoid,
  shortId,
  ulid,
  objectId,

  // Token / Secret
  token,
  apiKey,
  bytes,
  base64,
  salt,

  // Port
  port,
  generatePortNumber,
  availablePort,

  // Numbers
  int,
  float,
  boolean,

  // Strings
  string,
  alphanumeric,
  numeric,
  hex,
  base58,

  // Password & OTP
  password,
  otp,

  // Username / Slug
  username,
  slug,

  // Emoji
  emoji,
  emojis,

  // Credit Card
  creditCard,
  cvv,
  expiry,

  // Contact
  phone,
  email,

  // Domain / URL
  domain,
  url,

  // Network
  ipv4,
  ip,
  ipv6,
  mac,

  // Geo
  lat,
  lng,
  coordinates,

  // Color
  hexColor,
  rgb,
  hsl,
  colorName,

  // Date
  date,

  // File
  fileName,
  mimeType,

  // Other
  userAgent,
  semver,

  // Array helpers
  pick,
  choice,
  sample,
  shuffle,
};