import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const ADMIN_SESSION_COOKIE = 'muc_admin_session';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function usernameValues(value) {
  if (typeof value !== 'string') throw new HttpError(400, 'Vui lòng nhập tên đăng nhập.');
  const username = value.normalize('NFKC').trim();
  if ([...username].length < 3 || [...username].length > 32 || !/^[\p{L}\p{M}\p{N}._-]+$/u.test(username)) {
    throw new HttpError(400, 'Tên đăng nhập cần 3–32 ký tự, gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.');
  }
  return { username, key: username.toLocaleLowerCase('vi') };
}

export function validatePassword(value) {
  if (typeof value !== 'string' || [...value].length < 8 || [...value].length > 128) {
    throw new HttpError(400, 'Mật khẩu phải có từ 8 đến 128 ký tự.');
  }
}

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || [...password].length > 128) return false;
  const [algorithm, salt, expected] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const actual = await deriveKey(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

export function publicUser(row) {
  return row ? { id: row.id, username: row.username, role: row.role } : null;
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function requestToken(request, cookieName) {
  const cookies = request.headers.cookie || '';
  const prefix = `${cookieName}=`;
  const token = cookies.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length);
  return token && /^[a-zA-Z0-9_-]{43}$/.test(token) ? token : '';
}

export function currentUser(db, request, cookieName = 'muc_session') {
  const token = requestToken(request, cookieName);
  if (!token) return null;
  const row = db.prepare(`SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(tokenHash(token), Date.now());
  return publicUser(row);
}

export function requireUser(user, role) {
  if (!user) throw new HttpError(401, 'Vui lòng đăng nhập để tiếp tục.');
  if (role && user.role !== role) throw new HttpError(403, 'Tài khoản này không có quyền quản trị.');
  return user;
}

function cookieOptions(request, cookieName) {
  const forwardedProtocol = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = process.env.NODE_ENV === 'production' || request.socket.encrypted || forwardedProtocol === 'https';
  const path = cookieName === ADMIN_SESSION_COOKIE ? '/api' : '/';
  return `Path=${path}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function startSession(db, request, response, userId, cookieName = 'muc_session') {
  endSession(db, request, response, cookieName);
  const token = randomBytes(32).toString('base64url');
  const expiry = Date.now() + SESSION_SECONDS * 1000;
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), userId, expiry);
  response.setHeader('Set-Cookie', `${cookieName}=${token}; Max-Age=${SESSION_SECONDS}; ${cookieOptions(request, cookieName)}`);
}

export function endSession(db, request, response, cookieName = 'muc_session') {
  const token = requestToken(request, cookieName);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
  const existingCookies = response.getHeader('Set-Cookie') || [];
  const expiredCookie = `${cookieName}=; Max-Age=0; ${cookieOptions(request, cookieName)}`;
  response.setHeader('Set-Cookie', [].concat(existingCookies, expiredCookie));
}

export function checkMutationRequest(request) {
  if (request.headers['x-muc-request'] !== '1' || request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new HttpError(403, 'Yêu cầu không hợp lệ. Vui lòng tải lại trang.');
  }
  if (request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Yêu cầu khác nguồn bị từ chối.');
  if (request.headers.origin) {
    let origin;
    try { origin = new URL(request.headers.origin); } catch { throw new HttpError(403, 'Nguồn yêu cầu không hợp lệ.'); }
    const forwardedProtocol = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = process.env.NODE_ENV === 'production' || forwardedProtocol === 'https' || request.socket.encrypted ? 'https:' : 'http:';
    const expected = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : `${protocol}//${request.headers.host}`;
    if (origin.origin !== expected) throw new HttpError(403, 'Nguồn yêu cầu không hợp lệ.');
  }
}

export async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 64 * 1024) throw new HttpError(413, 'Dữ liệu gửi lên vượt giới hạn.');
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Dữ liệu JSON không hợp lệ.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Dữ liệu gửi lên không hợp lệ.');
  return body;
}

const attempts = new Map();
export function checkAuthRate(request) {
  const address = request.socket.remoteAddress || 'unknown';
  // Render terminates the proxy connection and appends the client address.
  const client = process.env.RENDER ? String(request.headers['x-forwarded-for'] || address).split(',').at(-1).trim() : address;
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.expires <= now) attempts.delete(key);
  const entry = attempts.get(client) || { count: 0, expires: now + 10 * 60 * 1000 };
  if (entry.count >= 30 || attempts.size > 10000) throw new HttpError(429, 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 10 phút.');
  entry.count += 1;
  attempts.set(client, entry);
}
