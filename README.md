# Mực — Cửa hàng truyện

Frontend demo dành cho **bán truyện in**: manga, manhwa, manhua, light novel, tập lẻ và boxset. Thay thế bản hiệu sách trước đó trong cùng thư mục để đường dẫn xem trước vẫn dùng được.

## Mở bằng nhấp đúp, không cần PowerShell

Nhấp đúp **CHAY-WEB.cmd** ở thư mục cha (nằm cạnh thư mục `bookstore-demo`). File sẽ mở `index.html` trong trình duyệt mặc định. Cũng có thể nhấp đúp trực tiếp `index.html`.

Bản frontend này dùng toàn bộ tệp cục bộ nên không cần Node, cài package, mạng hoặc máy chủ để xem và thử mua. Đã kiểm tra luồng tìm/lọc, chọn tập, giỏ hàng và đặt đơn mẫu trên Chrome bằng đường dẫn file.

Giỏ và đơn mẫu của bản mở file được lưu riêng với bản `localhost`. Giữ nguyên `CHAY-WEB.cmd` cùng thư mục `bookstore-demo` khi di chuyển dự án. Đóng tab trình duyệt để kết thúc bản mở file.

## Chạy bằng máy chủ trong VS Code (tuỳ chọn)

Mở thư mục `bookstore-demo` trong VS Code. Trong Terminal chạy:

```sh
node serve.mjs
```

Mở http://localhost:4173. Không cần cài package. Nếu có npm có thể dùng `npm start`. Nếu cổng đang dùng, chạy `node serve.mjs 4174`. Hoặc mở `index.html` bằng Live Server. Có thể mở file HTML trực tiếp để xem, nhưng khuyến nghị dùng server cục bộ để dữ liệu trình duyệt được lưu nhất quán.

## Có thể thử

- Tìm không dấu theo tên truyện, tên bộ, tác giả hoặc số tập.
- Lọc Manga / Manhwa / Manhua / Light novel, boxset, còn hàng; sắp xếp theo giá/tập mới/tên.
- Bấm bìa truyện để xem chi tiết, chọn tập hoặc boxset trong cùng bộ.
- Lưu yêu thích, đổi sáng/tối; giữ trạng thái sau khi tải lại.
- Thêm giỏ, tăng giảm, xoá; chặn số lượng vượt tồn kho mẫu.
- Mã **MUC10** giảm 10% tiền truyện. Phí giao hàng demo 25.000đ; miễn phí khi tiền truyện **sau giảm giá** đạt 300.000đ.
- Đặt hàng COD mô phỏng với kiểm tra tên, số điện thoại Việt Nam 10 chữ số bắt đầu bằng 0 và địa chỉ. Xem lại ở **Đơn hàng mẫu**.

## Dữ liệu và giới hạn

14 SKU trong `catalog.js`, thuộc 11 tên truyện được tuỳ biến theo yêu cầu: Two Piece, Chú Thuật Hồi Mân, Gia Đình Và Con Chó, Axe Man, Team Leveldown, Cách Sử Dụng Chất Xám, Một Người Hạ Tay, Hồ Yêu Bô Lão, Blade Paint Offline, Respawn To Two, Thanh Gươm Diệt Vong. Bút danh tác giả và cốt truyện hiện là nội dung minh hoạ cho bản demo. Giá, tồn kho, tập/boxset và trạng thái bộ là dữ liệu minh hoạ. Bìa SVG tự thiết kế trong `assets/covers/`, không sử dụng bìa hoặc nhân vật truyện thật. Không cần font, ảnh hoặc thư viện từ CDN.

Ứng dụng không gửi đơn, không thu tiền, không gọi hệ thống vận chuyển và chưa có admin/database. Giỏ hàng, yêu thích, theme và tối đa 30 đơn mẫu được giữ trong localStorage với tiền tố `muc-comics-`. Thông tin người nhận chỉ dùng để kiểm tra biểu mẫu, **không được lưu vào đơn mẫu**. Dữ liệu từ bản sách cũ (`bia-muc-cart`) không nhập vào danh mục truyện. `catalog-compat.js` ánh xạ ID của bản demo trước để giữ giỏ, yêu thích, liên kết và đổi tên trong đơn mẫu đã lưu sang tên tuỳ biến hiện tại; hỗ trợ cả ID gốc lẫn ID từ lần đổi tên trước.

Đây là frontend để đánh giá trải nghiệm. Khi nối backend cần xác thực lại giá, tồn kho, mã giảm giá và tổng đơn tại server; không tin tổng tiền từ trình duyệt.

## Dự án GitHub đã tham khảo

- [Mattlambo/comic-e-commerce — Spawn Vault](https://github.com/Mattlambo/comic-e-commerce): cách tách data / trạng thái giỏ / render, nút mua luôn hiện, cập nhật tổng và lưu giỏ; [MIT](https://github.com/Mattlambo/comic-e-commerce/blob/main/LICENSE).
- [AlgoBrother/ComicVerse](https://github.com/AlgoBrother/ComicVerse): hero giới thiệu truyện, danh mục có bộ lọc, bộ truyện nổi bật, chi tiết và luồng mua. Chỉ tham khảo bố cục; không nhập mã nguồn hoặc hình ảnh.
- [Zaki-akdas/anime-store-ecommerce](https://github.com/Zaki-akdas/anime-store-ecommerce): tham khảo hero chia ô và lựa chọn sáng/tối / yêu thích. Không nhập mã nguồn hoặc hình ảnh.

HTML/CSS/JS và bìa minh hoạ trong bản demo này được viết riêng. Thiết kế áp dụng bố cục storefront của các nguồn trên rồi điều chỉnh thành cửa hàng truyện tiếng Việt, có model **bộ truyện → tập/boxset → giá/tồn kho**.

## Tệp chính

`index.html` — giao diện và biểu mẫu; `styles.css` — responsive/sáng tối; `catalog.js` — dữ liệu; `store.js` — tìm/lọc, giỏ, mã giảm giá, đơn mẫu; `app.js` — thao tác giao diện; `serve.mjs` — server cục bộ.

## Kiểm tra

`npm run check` kiểm tra cú pháp. `tests/smoke.cjs` kiểm tra các luồng mua truyện bằng Playwright khi có thư viện và Chrome cài sẵn. Xem hướng dẫn trong file test; ảnh QA được lưu ở `test-results/`.
