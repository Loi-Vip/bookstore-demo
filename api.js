(() => {
  'use strict';
  async function request(path, options = {}) {
    if (location.protocol === 'file:') throw new Error('Hãy mở website bằng máy chủ để sử dụng tài khoản và đơn hàng.');
    const method = options.method || 'GET';
    const headers = { Accept: 'application/json', ...options.headers };
    const mutation = !['GET', 'HEAD'].includes(method.toUpperCase());
    if (mutation) headers['X-Muc-Request'] = '1';
    if (mutation || options.body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(path, {
        method, headers, credentials: 'same-origin', cache: 'no-store',
        body: options.body === undefined ? (mutation ? '{}' : undefined) : JSON.stringify(options.body)
      });
    } catch {
      throw new Error('Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.');
    }
    let data;
    try { data = await response.json(); }
    catch { throw new Error('Máy chủ chưa cung cấp API hợp lệ. Hãy chạy website bằng npm start.'); }
    if (!response.ok) {
      const error = new Error(data.error || data.message || 'Yêu cầu chưa thực hiện được. Vui lòng thử lại.');
      error.status = response.status;
      throw error;
    }
    return data;
  }
  window.MUC_API = { request };
})();
