(() => {
  'use strict';
  const api = window.MUC_API;
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value) || 0);
  const date = value => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('vi-VN');
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const statuses = { pending: 'Chờ xử lý', completed: 'Đã hoàn tất', cancelled: 'Đã hủy' };
  const orderTransitions = { pending: ['completed', 'cancelled'], completed: ['cancelled'], cancelled: [] };
  const productDialog = document.querySelector('#productDialog');
  const orderDialog = document.querySelector('#orderDialog');
  const productForm = document.querySelector('#productForm');
  const orderForm = document.querySelector('#orderStatusForm');
  const message = document.querySelector('#adminMessage');
  let products = [];
  let orders = [];
  let editingId = null;
  let editingRevision = null;
  let editingStale = false;
  let selectedOrderId = null;
  let selectedOrderStatus = null;
  let dashboardRequest = 0;
  let loading = false;
  let savingProduct = false;
  let savingOrder = false;
  const changingProducts = new Set();

  function showGate(title, detail, allowLogin = true) {
    document.querySelector('#adminShell').hidden = true;
    document.querySelector('#adminGate').hidden = false;
    document.querySelector('#gateTitle').textContent = title;
    document.querySelector('#gateMessage').textContent = detail;
    document.querySelector('#gateAction').hidden = !allowLogin;
    document.querySelector('#adminGate').setAttribute('role', 'alert');
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  }

  function reportError(error, target = message) {
    if (error.status === 401) {
      location.replace('/admin/login');
      return;
    }
    if (error.status === 403) {
      showGate('Tài khoản chưa có quyền quản lý.', 'Đăng nhập bằng tài khoản quản trị để tiếp tục.');
      return;
    }
    target.classList.add('error-message');
    target.textContent = error.message || 'Chưa thể tải dữ liệu. Vui lòng thử lại.';
  }

  function announce(text) {
    message.classList.remove('error-message');
    message.textContent = text;
  }

  function imageUrl(value) {
    if (String(value).startsWith('assets/')) return `/${value}`;
    if (String(value).startsWith('/assets/')) return value;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '/assets/favicon.svg';
    } catch {
      return '/assets/favicon.svg';
    }
  }

  function renderProducts() {
    const keyword = document.querySelector('#productSearch').value.trim().toLocaleLowerCase('vi');
    const shown = products.filter(product => [product.id, product.title, product.series, product.volume, product.author].join(' ').toLocaleLowerCase('vi').includes(keyword));
    document.querySelector('#productRows').innerHTML = shown.length ? shown.map(product => `
      <tr>
        <td><div class="table-product"><img src="${escape(imageUrl(product.image))}" width="42" height="63" alt="" loading="lazy"><div><strong>${escape(product.title || `${product.series} — ${product.volume}`)}</strong><small>${escape(product.categoryLabel || product.category)} · ${escape(product.id)}</small></div></div></td>
        <td class="nowrap">${money(product.price)}</td>
        <td>${Number(product.stock) || 0}</td>
        <td><span class="status-label ${product.active ? 'status-completed' : 'status-cancelled'}">${product.active ? 'Đang đăng' : 'Đã gỡ'}</span></td>
        <td><div class="row-actions"><button type="button" data-edit-product="${escape(product.id)}" ${changingProducts.has(product.id) ? 'disabled' : ''}>Chỉnh sửa</button><button type="button" data-toggle-product="${escape(product.id)}" ${changingProducts.has(product.id) ? 'disabled' : ''}>${product.active ? 'Gỡ sản phẩm' : 'Đăng lại'}</button></div></td>
      </tr>`).join('') : '<tr><td colspan="5" class="empty-copy">Chưa có sản phẩm phù hợp.</td></tr>';
  }

  function renderOrders() {
    document.querySelector('#orderRows').innerHTML = orders.length ? orders.map(order => `
      <tr><td><strong>${escape(order.code)}</strong></td><td>${escape(order.username || order.customer?.name || '—')}</td><td>${escape(date(order.createdAt))}</td><td class="nowrap">${money(order.totals?.total)}</td><td><span class="status-label status-${escape(Object.hasOwn(statuses, order.status) ? order.status : 'pending')}">${escape(statuses[order.status] || order.status)}</span></td><td><button type="button" class="table-button" data-order="${escape(order.id)}">Xem đơn ↗</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty-copy">Chưa có đơn hàng trong khoảng thời gian này.</td></tr>';
  }

  async function loadDashboard() {
    const requestId = ++dashboardRequest;
    const params = new URLSearchParams();
    const from = document.querySelector('#fromDate').value;
    const to = document.querySelector('#toDate').value;
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const result = await api.request(`/api/admin/dashboard${params.size ? `?${params}` : ''}`);
    if (requestId !== dashboardRequest) return;
    orders = result.orders || [];
    document.querySelector('#revenueValue').textContent = money(result.summary?.revenue);
    document.querySelector('#orderCount').textContent = String(result.summary?.orders ?? 0);
    document.querySelector('#productCount').textContent = String(result.summary?.products ?? 0);
    document.querySelector('#publishedCount').textContent = String(result.summary?.publishedProducts ?? 0);
    const topProducts = result.topProducts || [];
    document.querySelector('#topProducts').innerHTML = topProducts.length ? topProducts.map((product, index) => `<div class="top-product"><span class="top-rank">${index + 1}</span><div><strong>${escape(product.title)}</strong><small>${Number(product.quantity) || 0} sản phẩm đã bán</small></div><b>${money(product.revenue)}</b></div>`).join('') : '<p class="empty-copy">Doanh thu sẽ xuất hiện khi có đơn hàng hoàn tất.</p>';
    renderOrders();
  }

  async function loadProducts() {
    const result = await api.request('/api/admin/products');
    products = result.products || [];
    renderProducts();
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    const refreshButton = document.querySelector('#refreshButton');
    refreshButton.disabled = true;
    refreshButton.textContent = 'Đang tải…';
    try {
      await Promise.all([loadProducts(), loadDashboard()]);
    } finally {
      loading = false;
      refreshButton.disabled = false;
      refreshButton.textContent = 'Làm mới ↻';
    }
  }

  function openProduct(product = null) {
    editingId = product?.id ?? null;
    editingRevision = product?.revision ?? null;
    editingStale = false;
    document.querySelector('#saveProductButton').disabled = false;
    document.querySelector('#saveProductButton').textContent = 'Lưu sản phẩm';
    productForm.reset();
    document.querySelector('#productError').textContent = '';
    document.querySelector('#productDialogTitle').textContent = product ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm';
    document.querySelector('#productIdLabel').textContent = product ? `Mã sản phẩm ${product.id}` : 'Thông tin sản phẩm hiển thị trên cửa hàng.';
    if (product) {
      for (const name of ['series', 'volume', 'author', 'category', 'format', 'seriesStatus', 'price', 'originalPrice', 'stock', 'badge', 'image', 'description']) {
        productForm.elements[name].value = product[name] ?? '';
      }
      productForm.elements.active.checked = Boolean(product.active);
      productForm.elements.featured.checked = Boolean(product.featured);
    } else {
      productForm.elements.active.checked = true;
      productForm.elements.stock.value = '0';
      productForm.elements.seriesStatus.value = 'Đang phát hành';
    }
    productDialog.showModal();
    productForm.elements.series.focus();
  }

  function renderOrderDetail(order) {
    selectedOrderStatus = order.status || 'pending';
    document.querySelector('#orderDialogTitle').textContent = `Đơn ${order.code}`;
    const customer = order.customer || {};
    document.querySelector('#orderDetail').innerHTML = `
      <p class="muted">${escape(date(order.createdAt))} · ${escape(order.username || '—')}</p>
      <dl class="recipient-details"><div><dt>Người nhận</dt><dd>${escape(customer.name || '—')}</dd></div><div><dt>Điện thoại</dt><dd>${escape(customer.phone || '—')}</dd></div><div class="span-two"><dt>Địa chỉ</dt><dd>${escape(customer.address || '—')}</dd></div></dl>
      <div class="order-items">${(order.items || []).map(item => `<div><span><strong>${escape(item.title)}</strong><small>${Number(item.quantity) || 0} × ${money(item.price)}</small></span><b>${money(Number(item.quantity) * Number(item.price))}</b></div>`).join('')}</div>
      <dl class="order-totals"><div><dt>Tiền sản phẩm</dt><dd>${money(order.totals?.subtotal)}</dd></div><div><dt>Giảm giá</dt><dd>−${money(order.totals?.discount)}</dd></div><div><dt>Phí giao hàng</dt><dd>${money(order.totals?.shipping)}</dd></div><div class="total"><dt>Tổng cộng</dt><dd>${money(order.totals?.total)}</dd></div></dl>`;
    orderForm.elements.status.value = selectedOrderStatus;
    updateOrderControls();
    document.querySelector('#orderError').textContent = '';
  }

  function updateOrderControls() {
    const select = orderForm.elements.status;
    const allowed = orderTransitions[selectedOrderStatus] || [];
    for (const option of select.options) option.disabled = option.value !== selectedOrderStatus && !allowed.includes(option.value);
    select.disabled = savingOrder || allowed.length === 0;
    document.querySelector('#saveOrderStatus').disabled = savingOrder || !allowed.includes(select.value);
    orderForm.querySelector('.input-hint').textContent = selectedOrderStatus === 'cancelled'
      ? 'Đơn đã hủy và đã hoàn lại tồn kho.'
      : selectedOrderStatus === 'completed'
        ? 'Đơn đã được ghi nhận doanh thu. Hủy đơn sẽ hoàn lại tồn kho và điều chỉnh doanh thu.'
        : 'Đơn hoàn tất được ghi nhận doanh thu. Hủy đơn sẽ hoàn lại tồn kho.';
  }

  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => {
    if (savingProduct && button.closest('dialog') === productDialog || savingOrder && button.closest('dialog') === orderDialog) return;
    button.closest('dialog').close();
  }));
  productDialog.addEventListener('cancel', event => { if (savingProduct) event.preventDefault(); });
  orderDialog.addEventListener('cancel', event => { if (savingOrder) event.preventDefault(); });
  document.querySelector('#newProductButton').addEventListener('click', () => openProduct());
  document.querySelector('#productSearch').addEventListener('input', renderProducts);
  document.querySelector('#refreshButton').addEventListener('click', () => refresh().then(() => announce('Dữ liệu đã được cập nhật.')).catch(reportError));
  document.querySelector('#dateFilter').addEventListener('submit', async event => {
    event.preventDefault();
    const from = document.querySelector('#fromDate');
    const to = document.querySelector('#toDate');
    to.setCustomValidity(from.value && to.value && from.value > to.value ? 'Ngày kết thúc phải từ ngày bắt đầu trở đi.' : '');
    if (!event.currentTarget.reportValidity()) return;
    try { await loadDashboard(); announce('Đã cập nhật kết quả theo thời gian đã chọn.'); } catch (error) { reportError(error); }
  });
  document.querySelectorAll('#dateFilter input').forEach(input => input.addEventListener('input', () => document.querySelector('#toDate').setCustomValidity('')));
  document.querySelector('#clearDates').addEventListener('click', async () => {
    document.querySelector('#dateFilter').reset();
    document.querySelector('#toDate').setCustomValidity('');
    try { await loadDashboard(); announce('Đang xem toàn bộ thời gian.'); } catch (error) { reportError(error); }
  });
  document.querySelector('#logoutButton').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try { await api.request('/api/admin/auth/logout', { method: 'POST', body: {} }); location.replace('/admin/login'); }
    catch (error) { event.currentTarget.disabled = false; reportError(error); }
  });
  document.querySelector('#productRows').addEventListener('click', async event => {
    const editButton = event.target.closest('[data-edit-product]');
    const toggleButton = event.target.closest('[data-toggle-product]');
    if (editButton) {
      const product = products.find(item => item.id === editButton.dataset.editProduct);
      if (product && !changingProducts.has(product.id)) openProduct(product);
    }
    if (toggleButton) {
      const product = products.find(item => item.id === toggleButton.dataset.toggleProduct);
      if (!product || changingProducts.has(product.id)) return;
      changingProducts.add(product.id);
      toggleButton.disabled = true;
      try {
        await api.request(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: 'PATCH', body: { active: !product.active, revision: product.revision } });
        await Promise.all([loadProducts(), loadDashboard()]);
        announce(product.active ? 'Đã gỡ sản phẩm khỏi cửa hàng.' : 'Đã đăng lại sản phẩm.');
      } catch (error) {
        if (error.status === 409) await loadProducts().catch(refreshError => reportError(refreshError));
        reportError(error);
      } finally {
        changingProducts.delete(product.id);
        renderProducts();
      }
    }
  });
  productForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (savingProduct || editingStale || !productForm.reportValidity()) return;
    const values = new FormData(productForm);
    const data = {};
    for (const name of ['series', 'volume', 'author', 'category', 'format', 'seriesStatus', 'badge', 'image', 'description']) data[name] = String(values.get(name) || '').trim();
    data.price = Number(values.get('price'));
    data.stock = Number(values.get('stock'));
    data.originalPrice = values.get('originalPrice') === '' ? null : Number(values.get('originalPrice'));
    data.active = productForm.elements.active.checked;
    data.featured = productForm.elements.featured.checked;
    if (editingId) data.revision = editingRevision;
    savingProduct = true;
    const saveButton = document.querySelector('#saveProductButton');
    saveButton.disabled = true;
    saveButton.textContent = 'Đang lưu…';
    document.querySelector('#productError').textContent = '';
    try {
      await api.request(editingId ? `/api/admin/products/${encodeURIComponent(editingId)}` : '/api/admin/products', { method: editingId ? 'PATCH' : 'POST', body: data });
      productDialog.close();
      await Promise.all([loadProducts(), loadDashboard()]);
      announce(editingId ? 'Đã lưu thay đổi sản phẩm.' : 'Đã thêm sản phẩm mới.');
    } catch (error) {
      if (editingId && error.status === 409) {
        editingStale = true;
        await loadProducts().catch(refreshError => reportError(refreshError));
        document.querySelector('#productError').textContent = 'Sản phẩm vừa thay đổi. Đóng biểu mẫu và mở lại để cập nhật tồn kho mới trước khi lưu.';
      } else reportError(error, productDialog.open ? document.querySelector('#productError') : message);
    } finally {
      savingProduct = false;
      saveButton.disabled = editingStale;
      saveButton.textContent = editingStale ? 'Mở lại để cập nhật' : 'Lưu sản phẩm';
    }
  });
  document.querySelector('#orderRows').addEventListener('click', event => {
    const button = event.target.closest('[data-order]');
    if (!button) return;
    const order = orders.find(item => String(item.id) === button.dataset.order);
    if (!order) return;
    selectedOrderId = order.id;
    renderOrderDetail(order);
    orderDialog.showModal();
  });
  orderForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (savingOrder || !selectedOrderId || !(orderTransitions[selectedOrderStatus] || []).includes(orderForm.elements.status.value)) return;
    savingOrder = true;
    const button = document.querySelector('#saveOrderStatus');
    updateOrderControls();
    button.textContent = 'Đang cập nhật…';
    document.querySelector('#orderError').textContent = '';
    try {
      await api.request(`/api/admin/orders/${encodeURIComponent(selectedOrderId)}`, { method: 'PATCH', body: { status: orderForm.elements.status.value } });
      await Promise.all([loadProducts(), loadDashboard()]);
      const currentOrder = orders.find(order => order.id === selectedOrderId);
      if (currentOrder) renderOrderDetail(currentOrder);
      else orderDialog.close();
      announce('Đã cập nhật trạng thái đơn và doanh thu.');
    } catch (error) { reportError(error, document.querySelector('#orderError')); }
    finally { savingOrder = false; updateOrderControls(); button.textContent = 'Cập nhật'; }
  });
  orderForm.elements.status.addEventListener('change', updateOrderControls);
  document.querySelectorAll('.admin-nav a').forEach(link => link.addEventListener('click', () => {
    document.querySelectorAll('.admin-nav a').forEach(item => item.classList.toggle('active', item === link));
  }));

  async function initialize() {
    try {
      const { user } = await api.request('/api/admin/auth/me');
      if (!user || user.role !== 'admin') { location.replace('/admin/login'); return; }
      document.querySelector('#adminUsername').textContent = user.username;
      document.querySelector('#adminGate').hidden = true;
      document.querySelector('#adminShell').hidden = false;
      await refresh();
    } catch (error) {
      if (document.querySelector('#adminShell').hidden) showGate('Chưa thể mở trang quản lý.', error.message || 'Vui lòng tải lại trang để thử lại.');
      else reportError(error);
    }
  }
  initialize();
})();
