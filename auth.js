(() => {
  'use strict';
  const form = document.querySelector('#authForm');
  const username = document.querySelector('#username');
  const password = document.querySelector('#password');
  const confirmation = document.querySelector('#passwordConfirmation');
  const errorMessage = document.querySelector('#authError');
  const statusMessage = document.querySelector('#authStatus');
  const submit = document.querySelector('#authSubmit');
  const tabs = [document.querySelector('#loginTab'), document.querySelector('#registerTab')];
  const params = new URLSearchParams(location.search);
  const requestedPath = params.get('next');
  if (['/admin', '/admin/'].includes(requestedPath)) {
    location.replace('/admin/login');
    return;
  }
  const nextPath = requestedPath === '/?checkout=1' ? '/?checkout=1' : '/';
  let mode = params.get('mode') === 'register' ? 'register' : 'login';
  let busy = false;

  function renderMode(focus = false) {
    const registering = mode === 'register';
    tabs.forEach((tab, index) => {
      const selected = registering === (index === 1);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelector('#authContent').setAttribute('aria-labelledby', registering ? 'registerTab' : 'loginTab');
    document.querySelector('#authEyebrow').textContent = registering ? 'BẮT ĐẦU BỘ SƯU TẬP' : 'CHÀO MỪNG TRỞ LẠI';
    document.querySelector('#authTitle').textContent = registering ? 'Một góc nhỏ của riêng bạn.' : 'Kệ truyện đang đợi bạn.';
    document.querySelector('#authIntro').textContent = registering ? 'Tạo tài khoản để bắt đầu đặt truyện tại Mực.' : 'Đăng nhập bằng tài khoản Mực của bạn.';
    document.querySelector('#confirmationField').hidden = !registering;
    confirmation.required = registering;
    confirmation.disabled = !registering;
    password.minLength = registering ? 8 : 1;
    password.autocomplete = registering ? 'new-password' : 'current-password';
    document.querySelector('#passwordHint').textContent = registering ? 'Mật khẩu phải có ít nhất 8 ký tự.' : 'Nhập mật khẩu tài khoản của bạn.';
    submit.textContent = registering ? 'Tạo tài khoản →' : 'Đăng nhập →';
    const switchLine = document.querySelector('#authSwitch');
    switchLine.replaceChildren(document.createTextNode(registering ? 'Đã có tài khoản? ' : 'Bạn mới đến Mực? '));
    const switchButton = document.createElement('button');
    switchButton.type = 'button';
    switchButton.id = 'switchMode';
    switchButton.textContent = registering ? 'Đăng nhập' : 'Tạo tài khoản';
    switchButton.addEventListener('click', switchMode);
    switchLine.append(switchButton);
    errorMessage.textContent = '';
    statusMessage.textContent = '';
    confirmation.setCustomValidity('');
    if (focus) username.focus();
  }

  function switchMode() {
    if (busy) return;
    mode = mode === 'login' ? 'register' : 'login';
    renderMode(true);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      if (busy) return;
      mode = index === 0 ? 'login' : 'register';
      renderMode();
    });
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || busy) return;
      event.preventDefault();
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
      mode = target === 0 ? 'login' : 'register';
      renderMode();
      tabs[target].focus();
    });
  });

  document.querySelector('#passwordToggle').addEventListener('click', event => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    event.currentTarget.textContent = show ? 'Ẩn' : 'Hiện';
    event.currentTarget.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    event.currentTarget.setAttribute('aria-pressed', String(show));
  });
  confirmation.addEventListener('input', () => confirmation.setCustomValidity(''));
  password.addEventListener('input', () => confirmation.setCustomValidity(''));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    errorMessage.textContent = '';
    statusMessage.textContent = '';
    if (mode === 'register' && password.value !== confirmation.value) {
      confirmation.setCustomValidity('Mật khẩu nhập lại chưa khớp.');
      confirmation.reportValidity();
      return;
    }
    if (!form.reportValidity()) return;
    busy = true;
    submit.disabled = true;
    tabs.forEach(tab => { tab.disabled = true; });
    document.querySelector('#switchMode').disabled = true;
    submit.textContent = mode === 'register' ? 'Đang tạo tài khoản…' : 'Đang đăng nhập…';
    try {
      await window.MUC_API.request(`/api/auth/${mode}`, {
        method: 'POST',
        body: { username: username.value.trim(), password: password.value }
      });
      statusMessage.textContent = mode === 'register' ? 'Tài khoản đã được tạo. Đang mở cửa hàng…' : 'Đăng nhập thành công. Đang chuyển trang…';
      location.replace(nextPath);
    } catch (error) {
      errorMessage.textContent = error.message || 'Chưa thể đăng nhập. Vui lòng thử lại.';
      busy = false;
      submit.disabled = false;
      tabs.forEach(tab => { tab.disabled = false; });
      document.querySelector('#switchMode').disabled = false;
      submit.textContent = mode === 'register' ? 'Tạo tài khoản →' : 'Đăng nhập →';
    }
  });

  renderMode();
})();
