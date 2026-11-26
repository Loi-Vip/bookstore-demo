(() => {
  'use strict';
  const form = document.querySelector('#adminLoginForm');
  const username = document.querySelector('#username');
  const password = document.querySelector('#password');
  const passwordToggle = document.querySelector('#passwordToggle');
  const submit = document.querySelector('#authSubmit');
  const errorMessage = document.querySelector('#authError');
  const statusMessage = document.querySelector('#authStatus');
  let busy = false;

  passwordToggle.addEventListener('click', () => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    passwordToggle.textContent = show ? 'Ẩn' : 'Hiện';
    passwordToggle.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    passwordToggle.setAttribute('aria-pressed', String(show));
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    errorMessage.textContent = '';
    errorMessage.hidden = true;
    statusMessage.textContent = 'Đang đăng nhập…';
    statusMessage.hidden = false;
    busy = true;
    form.setAttribute('aria-busy', 'true');
    submit.disabled = true;
    submit.textContent = 'Đang đăng nhập…';
    try {
      const { user } = await window.MUC_API.request('/api/admin/auth/login', {
        method: 'POST',
        body: { username: username.value.trim(), password: password.value }
      });
      if (user?.role !== 'admin') throw new Error('Tài khoản này chưa có quyền quản trị.');
      statusMessage.textContent = 'Đăng nhập thành công. Đang mở trang quản trị…';
      location.replace('/admin');
    } catch (error) {
      errorMessage.textContent = error.message || 'Chưa thể đăng nhập quản trị. Vui lòng thử lại.';
      errorMessage.hidden = false;
      statusMessage.textContent = '';
      statusMessage.hidden = true;
      busy = false;
      form.setAttribute('aria-busy', 'false');
      submit.disabled = false;
      submit.textContent = 'Đăng nhập quản trị →';
    }
  });

  window.MUC_API.request('/api/admin/auth/me').then(({ user }) => {
    if (user?.role === 'admin' && !busy) location.replace('/admin');
  }).catch(() => {});
})();
