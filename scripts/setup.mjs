import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const password = randomBytes(18).toString('base64url');
const configuration = `ADMIN_USERNAME=admin\nADMIN_PASSWORD=${password}\nDB_PATH=data/muc.sqlite\n`;
try {
  writeFileSync(path.join(root, '.env'), configuration, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  console.log('Đã tạo .env với tài khoản admin và mật khẩu ngẫu nhiên. Mở .env để xem thông tin đăng nhập, rồi chạy npm start.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Cấu hình .env đã có. Chạy npm start để mở cửa hàng.');
}
