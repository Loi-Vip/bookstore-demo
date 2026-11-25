(() => {
  'use strict';
  const store = window.COMIC_STORE;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
  let state = { category: 'all', format: '', search: '', inStock: false, wishlistOnly: false, sort: 'featured' };
  let detailId = '';
  let detailReturnId = '';
  let toastTimer;
  let storageWarned = false;

  function toast(message) {
    $('#toast').textContent = message;
    if (!$('#toast').matches(':popover-open') && $('#toast').showPopover) $('#toast').showPopover();
    $('#toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('#toast').classList.remove('show'); if ($('#toast').hidePopover) $('#toast').hidePopover(); }, 2800);
  }
  function reportStorage() {
    if (!store.storageAvailable && !storageWarned) {
      storageWarned = true;
      toast('Trình duyệt chặn lưu dữ liệu. Giỏ hàng chỉ được giữ tạm trong phiên này.');
    }
  }
  function scrollCatalog() { $('#catalog').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }
  function showDialog(dialog) {
    $$('dialog[open]').forEach(other => { if (other !== dialog) other.close(); });
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }
  function favoriteButton(product) {
    const selected = store.wishlist.includes(product.id);
    return '<button class="favorite-button" data-favorite="' + product.id + '" aria-pressed="' + selected + '" aria-label="' + (selected ? 'Bỏ yêu thích ' : 'Yêu thích ') + escape(product.title) + '">' + heart + '</button>';
  }
  function priceMarkup(product) {
    return '<div class="price-row"><strong>' + money(product.price) + '</strong>' + (product.originalPrice > product.price ? '<del>' + money(product.originalPrice) + '</del>' : '') + '</div>';
  }
  function syncHeader() {
    $('#cartCount').textContent = store.cartCount;
    $('#drawerCount').textContent = '(' + store.cartCount + ')';
    $('#openCart').setAttribute('aria-label', 'Mở giỏ hàng, ' + store.cartCount + ' sản phẩm');
    $('#wishlistCount').textContent = store.wishlist.length;
    $('#wishlistButton').setAttribute('aria-pressed', String(state.wishlistOnly));
  }
  function renderCatalog() {
    const focused = document.activeElement?.dataset.favorite;
    const products = store.query(state);
    $('#catalogTitle').textContent = state.wishlistOnly ? 'Truyện bạn muốn giữ.' : 'Hôm nay, đọc gì?';
    $('#resultCount').textContent = products.length + ' sản phẩm';
    $('#emptyState').hidden = products.length !== 0;
    $('#clearFilters').hidden = !(state.category !== 'all' || state.format || state.search || state.inStock || state.wishlistOnly || state.sort !== 'featured');
    $('#productGrid').innerHTML = products.map(product => '<article class="product-card" data-product="' + product.id + '"><div class="cover-wrap"><span class="product-badge' + (!product.stock ? ' sold-out' : '') + '">' + escape(!product.stock ? 'Tạm hết hàng' : product.badge) + '</span>' + favoriteButton(product) + '<button class="cover-button" data-detail="' + product.id + '" aria-label="Xem ' + escape(product.title) + '"><img src="' + product.image + '" alt="Bìa minh hoạ ' + escape(product.title) + '" width="280" height="420" loading="lazy"></button></div><div class="product-info"><p class="product-kicker">' + escape(product.categoryLabel) + ' / ' + escape(product.author) + '</p><h3 class="product-title"><button data-detail="' + product.id + '">' + escape(product.series) + '</button></h3><p class="product-volume">' + escape(product.volume) + ' · ' + (product.format === 'boxset' ? 'Boxset / Combo' : 'Bản in tiếng Việt') + '</p>' + priceMarkup(product) + '<button class="add-button" data-add="' + product.id + '"' + (!product.stock ? ' disabled' : '') + '><span class="add-label">' + (product.stock ? 'Thêm vào giỏ' : 'Tạm hết hàng') + '</span><span aria-hidden="true">+</span></button></div></article>').join('');
    $$('.category[data-category]').forEach(button => {
      const selected = state.category === button.dataset.category;
      button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    });
    $('#boxsetFilter').classList.toggle('active', state.format === 'boxset');
    $('#boxsetFilter').setAttribute('aria-pressed', String(state.format === 'boxset'));
    $$('[data-nav]').forEach(button => button.classList.toggle('active', state.category === button.dataset.nav && !state.format && !state.wishlistOnly));
    $('[data-format-nav]').classList.toggle('active', state.format === 'boxset');
    $('#stockFilter').checked = state.inStock;
    $('#sortSelect').value = state.sort;
    syncHeader();
    if (focused) {
      const replacement = $$('#productGrid [data-favorite]').find(button => button.dataset.favorite === focused);
      (replacement || $('#wishlistButton')).focus({ preventScroll: true });
    }
  }
  function resetFilters(overrides = {}) {
    state = { category: 'all', format: '', search: '', inStock: false, wishlistOnly: false, sort: 'featured', ...overrides };
    $('#searchInput').value = state.search;
    renderCatalog();
  }
  function renderDetail(id) {
    const product = store.byId(id);
    if (!product) return;
    detailId = id;
    const siblings = store.products.filter(item => item.series === product.series);
    $('#detailDialog').setAttribute('aria-labelledby', 'detailTitle');
    $('#detailContent').innerHTML = '<div class="detail-layout"><div class="detail-cover"><img src="' + product.image + '" alt="Bìa minh hoạ ' + escape(product.title) + '" width="280" height="420"></div><div class="detail-info"><p class="eyebrow">' + escape(product.categoryLabel) + ' / ' + (product.format === 'boxset' ? 'BOXSET' : 'TRUYỆN IN') + '</p><h2 id="detailTitle">' + escape(product.series) + '</h2><p class="detail-author">' + escape(product.author) + '</p>' + priceMarkup(product) + '<p class="detail-description">' + escape(product.description) + '</p><dl class="detail-meta"><div><dt>Phiên bản</dt><dd>' + escape(product.volume) + '</dd></div><div><dt>Bộ truyện</dt><dd>' + escape(product.seriesStatus) + '</dd></div><div><dt>Loại sản phẩm</dt><dd>' + (product.format === 'boxset' ? 'Boxset / Combo' : 'Tập lẻ') + '</dd></div><div><dt>Tồn kho mẫu</dt><dd>' + product.stock + ' sản phẩm</dd></div></dl><p class="volume-label">Chọn tập / phiên bản</p><div class="volume-options">' + siblings.map(item => '<button data-volume="' + item.id + '" class="' + (item.id === id ? 'active' : '') + '" aria-pressed="' + (item.id === id) + '">' + escape(item.volume) + (!item.stock ? ' · Hết' : '') + '</button>').join('') + '</div><div class="detail-actions"><button class="primary-button" data-add="' + id + '"' + (!product.stock ? ' disabled' : '') + '>' + (product.stock ? 'Thêm vào giỏ' : 'Tạm hết hàng') + ' <span>+</span></button>' + favoriteButton(product) + '</div><p class="stock-status">' + (product.stock ? '● Còn hàng mẫu · Chọn đúng tập bạn đang tìm.' : '○ Tạm hết tập này. Bạn có thể chọn tập khác.') + '</p></div></div>';
  }
  function openDetail(id) {
    if (!store.byId(id)) return;
    detailReturnId = id;
    renderDetail(id); showDialog($('#detailDialog'));
    const url = new URL(location.href); url.searchParams.set('truyen', id); history.replaceState(null, '', url);
  }
  function renderCart() {
    const active = document.activeElement;
    const activeId = active?.dataset.quantity;
    const activeDelta = active?.dataset.delta;
    const lines = store.cartLines();
    const total = store.totals();
    $('#cartEmpty').hidden = lines.length > 0;
    $('#cartItems').hidden = lines.length === 0;
    $('#cartFooter').hidden = lines.length === 0;
    $('#cartItems').innerHTML = lines.map(item => '<div class="cart-row" data-cart-id="' + item.id + '"><img src="' + item.product.image + '" alt="" width="58" height="87"><div><h3>' + escape(item.product.series) + '</h3><p>' + escape(item.product.volume) + ' · ' + money(item.product.price) + '</p><div class="qty-control"><button data-quantity="' + item.id + '" data-delta="-1" aria-label="Giảm số lượng ' + escape(item.product.title) + '">−</button><span aria-label="Số lượng">' + item.quantity + '</span><button data-quantity="' + item.id + '" data-delta="1" aria-label="Tăng số lượng ' + escape(item.product.title) + '"' + (item.quantity >= item.product.stock ? ' disabled' : '') + '>+</button></div></div><div class="cart-row-end"><strong>' + money(item.product.price * item.quantity) + '</strong><button class="remove-item" data-remove="' + item.id + '" aria-label="Xoá ' + escape(item.product.title) + ' khỏi giỏ">Xoá</button></div></div>').join('');
    $('#cartSubtotal').textContent = money(total.subtotal);
    $('#cartDiscount').textContent = total.discount ? '−' + money(total.discount) : money(0);
    $('#cartShipping').textContent = total.shipping ? money(total.shipping) : 'Miễn phí';
    $('#cartTotal').textContent = money(total.total);
    $('#checkoutTotal').textContent = money(total.total);
    if (!lines.length) { $('#couponMessage').textContent = ''; $('#couponInput').value = ''; }
    syncHeader();
    if (activeId) {
      const next = $$('#cartItems [data-quantity]').find(button => button.dataset.quantity === activeId && button.dataset.delta === activeDelta && !button.disabled);
      (next || $('#cartDialog [data-close]')).focus({ preventScroll: true });
    }
  }
  function renderSeries() {
    const names = ['Two Piece', 'Chú Thuật Hồi Mân', 'Gia Đình Và Con Chó'];
    $('#seriesGrid').innerHTML = names.map(name => {
      const products = store.products.filter(product => product.series === name);
      if (!products.length) return '';
      return '<button class="series-card" data-series="' + escape(name) + '"><img src="' + products[0].image + '" alt="" width="65" height="98" loading="lazy"><div><h3>' + escape(name) + '</h3><p>' + escape(products[0].categoryLabel) + ' · ' + products.length + ' phiên bản mẫu</p><small>Xem các tập trong bộ</small></div><span class="series-arrow">↗</span></button>';
    }).join('');
    const heroProducts = [store.byId('two-piece-01'), store.products.find(product => product.category === 'manhwa'), store.byId('chu-thuat-hoi-man-01')].filter(Boolean);
    $('#heroCovers').innerHTML = heroProducts.map(product => '<img src="' + product.image + '" width="280" height="420" alt="Bìa minh hoạ ' + escape(product.series) + '">').join('');
  }
  function renderOrders() {
    const orders = store.orders;
    $('#ordersList').innerHTML = orders.length ? orders.map(order => '<article class="order-card"><div class="order-card-head"><strong>' + escape(order.code) + '</strong><span>Đơn mô phỏng</span></div><p>' + new Date(order.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' }) + '</p><ul>' + order.items.map(item => '<li>' + escape(item.title) + ' × ' + item.quantity + '</li>').join('') + '</ul><strong>Tổng: ' + money(order.totals.total) + '</strong></article>').join('') : '<div class="empty-state"><h3>Chưa có đơn hàng mẫu.</h3><p>Chọn vài tập truyện rồi thử đặt hàng nhé.</p></div>';
  }
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('#themeToggle').setAttribute('aria-label', 'Chuyển giao diện ' + (theme === 'dark' ? 'sáng' : 'tối'));
    $('#themeToggle').setAttribute('aria-pressed', String(theme === 'dark'));
    $('meta[name="theme-color"]').content = theme === 'dark' ? '#171a18' : '#f7f6f2';
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-close')) { button.closest('dialog').close(); return; }
    if (button.dataset.add) {
      const result = store.add(button.dataset.add); renderCart(); toast(result.message); reportStorage(); return;
    }
    if (button.dataset.detail) { openDetail(button.dataset.detail); return; }
    if (button.dataset.volume) {
      renderDetail(button.dataset.volume);
      const url = new URL(location.href); url.searchParams.set('truyen', button.dataset.volume); history.replaceState(null, '', url);
      $$('#detailContent [data-volume]').find(item => item.dataset.volume === button.dataset.volume)?.focus({ preventScroll: true });
      return;
    }
    if (button.dataset.favorite) {
      const added = store.toggleWishlist(button.dataset.favorite);
      const detailOpen = $('#detailDialog').open;
      renderCatalog();
      if (detailOpen) { renderDetail(detailId); $('#detailContent [data-favorite]').focus({ preventScroll: true }); }
      toast(added ? 'Đã lưu tập truyện vào danh sách yêu thích.' : 'Đã bỏ khỏi danh sách yêu thích.'); reportStorage(); return;
    }
    if (button.dataset.quantity) {
      if (!store.change(button.dataset.quantity, Number(button.dataset.delta))) toast('Không thể tăng quá tồn kho mẫu.');
      renderCart(); reportStorage(); return;
    }
    if (button.dataset.remove) {
      store.remove(button.dataset.remove); renderCart();
      ($('#cartItems [data-remove]') || $('#cartDialog [data-close]')).focus({ preventScroll: true });
      reportStorage(); return;
    }
    if (button.dataset.category) { state.category = button.dataset.category; state.wishlistOnly = false; renderCatalog(); return; }
    if (button.dataset.nav) { resetFilters({ category: button.dataset.nav }); scrollCatalog(); return; }
    if (button.dataset.formatNav) { resetFilters({ format: 'boxset' }); scrollCatalog(); return; }
    if (button.dataset.series) { resetFilters({ search: button.dataset.series }); scrollCatalog(); return; }
    if (button.hasAttribute('data-orders')) { renderOrders(); showDialog($('#ordersDialog')); }
  });
  $('#searchForm').addEventListener('submit', event => { event.preventDefault(); state.search = $('#searchInput').value; renderCatalog(); scrollCatalog(); });
  $('#searchInput').addEventListener('input', () => { state.search = $('#searchInput').value; renderCatalog(); });
  $('#sortSelect').addEventListener('change', event => { state.sort = event.target.value; renderCatalog(); });
  $('#stockFilter').addEventListener('change', event => { state.inStock = event.target.checked; renderCatalog(); });
  $('#boxsetFilter').addEventListener('click', () => { state.format = state.format ? '' : 'boxset'; renderCatalog(); });
  ['clearFilters', 'emptyReset', 'heroExplore', 'browseAll'].forEach(id => $('#' + id).addEventListener('click', () => { resetFilters(); if (id !== 'clearFilters') scrollCatalog(); }));
  $('#heroBoxset').addEventListener('click', () => { resetFilters({ format: 'boxset' }); scrollCatalog(); });
  $('#wishlistButton').addEventListener('click', () => { const selected = !state.wishlistOnly; resetFilters({ wishlistOnly: selected }); scrollCatalog(); });
  $('#themeToggle').addEventListener('click', () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; setTheme(theme); store.setTheme(theme); });
  $('#openCart').addEventListener('click', () => { renderCart(); showDialog($('#cartDialog')); });
  $('#checkoutButton').addEventListener('click', () => {
    if (!store.cartCount) return;
    $('#checkoutFormView').hidden = false; $('#successView').hidden = true;
    $('#checkoutDialog').setAttribute('aria-labelledby', 'checkoutTitle');
    $('#checkoutError').textContent = ''; $('#checkoutTotal').textContent = money(store.totals().total);
    showDialog($('#checkoutDialog'));
  });
  $('#couponForm').addEventListener('submit', event => {
    event.preventDefault(); const result = store.applyCoupon($('#couponInput').value); $('#couponMessage').textContent = result.message; renderCart();
  });
  $('#checkoutForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!event.target.reportValidity()) return;
    const data = Object.fromEntries(new FormData(event.target));
    try {
      const order = store.checkout(data);
      $('#orderCode').textContent = order.code;
      $('#successTotal').textContent = money(order.totals.total);
      $('#checkoutFormView').hidden = true; $('#successView').hidden = false;
      $('#checkoutDialog').setAttribute('aria-labelledby', 'successTitle');
      event.target.reset(); renderCart(); $('#continueButton').focus(); $('#checkoutDialog').scrollTop = 0;
    } catch (error) { $('#checkoutError').textContent = error.message; }
  });
  $('#continueButton').addEventListener('click', () => { $('#checkoutDialog').close(); scrollCatalog(); });
  $('#openOrders').addEventListener('click', () => { renderOrders(); showDialog($('#ordersDialog')); });
  $('#aboutButton').addEventListener('click', () => showDialog($('#aboutDialog')));
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  }));
  $('#detailDialog').addEventListener('close', () => {
    const url = new URL(location.href); url.searchParams.delete('truyen'); history.replaceState(null, '', url);
    ($$('#productGrid [data-detail]').find(button => button.dataset.detail === detailReturnId) || $('#wishlistButton')).focus({ preventScroll: true });
  });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !document.querySelector('dialog[open]') && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) {
      event.preventDefault(); $('#searchInput').focus();
    }
  });
  window.addEventListener('storage', event => {
    if (event.key !== null && !event.key.startsWith('muc-comics-')) return;
    store.sync(); renderCatalog(); renderCart();
    if ($('#ordersDialog').open) renderOrders();
    if ($('#detailDialog').open) renderDetail(detailId);
    if ($('#checkoutDialog').open && !$('#checkoutFormView').hidden) $('#checkoutError').textContent = 'Giỏ truyện vừa thay đổi ở tab khác. Vui lòng kiểm tra lại tổng đơn.';
    setTheme(store.theme);
  });
  setTheme(store.theme); renderCatalog(); renderCart(); renderSeries();
  const incomingId = new URL(location.href).searchParams.get('truyen');
  const initialId = store.byId(incomingId)?.id;
  if (initialId && store.byId(initialId)) openDetail(initialId);
})();
