# Mực Cửa hàng truyện

Website bán truyện với tài khoản khách hàng, giỏ hàng, đơn COD và trang quản trị tại `/admin`. Dữ liệu minh họa ban đầu gồm 14 SKU thuộc 11 bộ truyện. HTML, CSS và JavaScript phục vụ giao diện, Node.js 24 chạy API, SQLite lưu tài khoản, phiên đăng nhập, sản phẩm và đơn hàng.

## Chạy trên máy cá nhân

Cài Node.js 24, mở terminal trong thư mục `bookstore-demo` rồi chạy.

```sh
npm run setup
npm start
```

Ứng dụng không có thư viện npm phụ thuộc. Có thể chạy trực tiếp `node scripts/setup.mjs` và `node serve.mjs` nếu máy chỉ có Node.

Mở http://localhost:4173 để vào cửa hàng, http://localhost:4173/auth.html để khách đăng ký hoặc đăng nhập và http://localhost:4173/admin/login để đăng nhập quản trị. Nhấp đúp `CHAY-WEB.cmd` ở thư mục cha để chạy cùng máy chủ. File này ưu tiên Node.js 24 tại `.runtime/node24/node.exe` trong thư mục `bookstore-demo`, sau đó tìm Node.js trong PATH. Bản Node cục bộ chỉ cần `node.exe` vì ứng dụng không có thư viện npm phụ thuộc. Giữ thư mục `.runtime` khi sao chép dự án sang máy khác nếu muốn tiếp tục dùng bản Node đi kèm. Giữ cửa sổ máy chủ mở trong lúc sử dụng, nhấn Ctrl+C để dừng.

Lệnh setup tạo `.env` với tên quản trị `admin` và một mật khẩu ngẫu nhiên. Mở `.env` để lấy thông tin đăng nhập. File này và thư mục `data` được loại khỏi Git. Khi máy chủ khởi động lần đầu, tài khoản quản trị được tạo từ `ADMIN_USERNAME` và `ADMIN_PASSWORD`. Các lần khởi động tiếp theo giữ tài khoản và mật khẩu đang lưu trong database. Thay biến môi trường không đổi mật khẩu của một tài khoản đã tồn tại.

Database mặc định là `data/muc.sqlite`. Giữ toàn bộ thư mục `data` khi di chuyển máy chủ. Để sao lưu bằng cách sao chép thư mục, dừng máy chủ trước khi sao chép nhằm giữ nhất quán cả tệp SQLite và WAL. Khi phục hồi, dùng bản sao của cùng bộ dữ liệu và khởi động lại ứng dụng.

## Tài khoản khách hàng

- Khách đăng ký bằng tên đăng nhập 3–32 ký tự, gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.
- Tên được chuẩn hóa Unicode NFKC và so sánh không phân biệt hoa thường. Database có ràng buộc UNIQUE, nên các yêu cầu đăng ký đồng thời cũng không thể tạo tên trùng.
- Mật khẩu có 8–128 ký tự. Đăng ký thành công tự đăng nhập với quyền khách hàng. Người dùng đăng ký qua website luôn nhận quyền khách hàng.
- Mật khẩu được băm bằng scrypt với salt riêng. Phiên đăng nhập lưu trên server, cookie HttpOnly và SameSite=Lax, có Secure khi chạy production HTTPS. Mật khẩu và session token không lưu trong localStorage.
- Khách được duyệt sản phẩm và chuẩn bị giỏ trước khi đăng nhập. Đặt hàng cần đăng nhập, sau đó khách xem các đơn của tài khoản mình.

Giỏ, yêu thích và giao diện sáng tối tiếp tục lưu trên trình duyệt. Khi đổi tài khoản trên cùng trình duyệt, giỏ và yêu thích vẫn được giữ. Lịch sử đơn được tải theo tài khoản từ server. Các đơn mẫu localStorage của bản cũ không được đưa vào doanh thu.

## Quản lý cửa hàng

Mở `/admin/login` để đăng nhập bằng tài khoản quản trị, sau đó vào trang quản lý tại `/admin`. Khi chưa có phiên quản trị, `/admin` tự chuyển đến trang đăng nhập này. Liên kết đăng nhập quản trị cũ tại `/auth.html?next=/admin` cũng chuyển tới `/admin/login`.

Phiên quản trị dùng cookie riêng với phiên khách hàng, nên có thể mở trang mua hàng và trang quản lý trong cùng trình duyệt. Đăng xuất quản trị kết thúc phiên quản trị, đăng xuất ở cửa hàng kết thúc phiên mua hàng. Trang đăng nhập quản trị kiểm tra quyền admin trước khi tạo phiên. Tài khoản khách hàng có thể tiếp tục mua hàng trong lúc chủ cửa hàng sử dụng trang quản lý.

- Thêm và chỉnh sửa tên bộ, tập, tác giả, thể loại, định dạng, giá, tồn kho, ảnh và mô tả.
- Gỡ sản phẩm để ẩn khỏi cửa hàng, hoặc đăng lại khi cần. Lịch sử đơn giữ thông tin sản phẩm tại thời điểm mua.
- Ảnh dùng đường dẫn có sẵn trong `assets` hoặc URL HTTPS. Trình duyệt tải ảnh URL trực tiếp từ nguồn được nhập.
- Xem đơn, người nhận và các dòng hàng. Chuyển đơn chờ xử lý thành hoàn tất hoặc đã hủy. Đơn hoàn tất có thể hủy để loại doanh thu và trả hàng về kho. Đơn đã hủy không được kích hoạt lại.
- Xem doanh thu và sản phẩm đã bán theo khoảng ngày tạo đơn, tính theo UTC+7.

Doanh thu là tiền sản phẩm sau giảm giá của các đơn **đã hoàn tất**, không bao gồm phí giao hàng. Đơn chờ xử lý và đơn hủy không được tính. Không có dữ liệu doanh thu giả. Thanh toán COD được quản trị viên xác nhận thủ công qua trạng thái đơn, ứng dụng chưa kết nối cổng thanh toán hay đơn vị vận chuyển.

## Quy tắc đơn hàng

Server lấy giá và tồn kho từ database, tính lại giảm giá và phí vận chuyển. Mã `MUC10` giảm 10% tiền hàng. Phí vận chuyển 25.000 đồng, miễn phí khi tiền hàng sau giảm đạt 300.000 đồng.

Tạo đơn và trừ tồn kho cùng một transaction SQLite. Một mã yêu cầu đặt hàng được dùng lại khi thử gửi lại sau lỗi mạng để tránh tạo hai đơn. Hủy đơn trả lại tồn kho một lần. Giá và tổng tiền gửi từ trình duyệt không quyết định kết quả thanh toán. Thông tin người nhận được lưu vào đơn để chủ cửa hàng xử lý, chỉ chủ tài khoản và quản trị viên được đọc qua API.

## Triển khai trên Render

Phiên bản có tài khoản và quản trị cần **Web Service** chạy Node.js 24. SQLite cần **Persistent Disk** để giữ dữ liệu qua deploy và restart. Theo tài liệu Render, persistent disk gắn với dịch vụ trả phí. Xem điều kiện và mức giá trong tài khoản trước khi tạo dịch vụ. [Render Web Services](https://render.com/docs/web-services), [Render Persistent Disks](https://render.com/docs/disks)

Trong Render, tạo Web Service từ repository GitHub và đặt các giá trị sau.

| Trường | Giá trị |
|---|---|
| Runtime | Node |
| Branch | main hoặc nhánh có mã mới |
| Root Directory | Để trống khi index.html nằm ở gốc repo |
| Build Command | `npm run check` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Persistent Disk mount path | `/var/data` |

Khai báo các biến môi trường trên Render.

| Biến | Giá trị |
|---|---|
| `NODE_VERSION` | `24` |
| `NODE_ENV` | `production` |
| `DB_PATH` | `/var/data/muc.sqlite` |
| `ADMIN_USERNAME` | Tên quản trị do chủ cửa hàng chọn |
| `ADMIN_PASSWORD` | Mật khẩu quản trị đủ 8 ký tự trở lên |
| `APP_ORIGIN` | URL HTTPS thực tế của dịch vụ, tùy chọn |

Render cấp biến `PORT`, máy chủ tự lắng nghe trên `0.0.0.0`. Nếu khai báo APP_ORIGIN, phải dùng đúng URL HTTPS, cập nhật khi đổi tên miền. Kết nối từ trình duyệt đến API dùng cùng origin. Không đưa `.env` hoặc database lên repository công khai.

Chạy một instance ghi vào database SQLite trên ổ gắn kèm. Khi cần nhiều instance hoặc một nền tảng dữ liệu được quản trị, cần chuyển lớp lưu trữ sang database dùng chung. Static Site của phiên bản cũ có thể tiếp tục chứa giao diện cũ cho đến khi chủ cửa hàng đưa phiên bản Web Service lên.

Sau deploy, thử đăng ký hai tên giống nhau, đăng nhập, tạo đơn bằng tài khoản khách, đăng nhập quản trị tại `/admin`, hoàn tất đơn và kiểm tra doanh thu. Khởi động lại dịch vụ để xác nhận tài khoản, sản phẩm và đơn vẫn còn trên Persistent Disk.

## Kiểm tra

```sh
npm run check
npm test
npm run test:ui
```

`npm test` dùng node:test, tự mở server và database tạm để kiểm tra API, quyền truy cập, đăng ký cạnh tranh, đặt hàng, doanh thu và lưu dữ liệu sau restart. `test:ui` dùng Playwright và Chrome để kiểm tra thao tác người dùng, quản trị và di động. Khi chạy trên máy khác, trỏ `PLAYWRIGHT_MODULE` đến thư viện Playwright đã cài và `CHROME_PATH` đến Chrome. Các ảnh kiểm tra nằm trong `test-results/accounts`.

`tests/smoke.cjs` giữ các kịch bản của bản frontend cũ để tham khảo. Các giả định về đơn mẫu cục bộ trong tệp đó thuộc phiên bản trước. Bộ API và trình duyệt mới kiểm tra chức năng tài khoản và đơn hàng trên server.

## Cấu trúc mã nguồn

`server/database.mjs` quản lý schema SQLite và transaction. `server/security.mjs` xử lý mật khẩu, session và kiểm tra yêu cầu. `server/commerce.mjs` xử lý sản phẩm, đơn và doanh thu. `server/api.mjs` định nghĩa các endpoint. `serve.mjs` phục vụ API và các tệp công khai.

`api.js` gọi API cùng origin. `catalog.js` giữ dữ liệu minh họa để tạo danh mục lần đầu. `catalog-compat.js` giữ ánh xạ ID cũ. `store.js` quản lý giỏ và trạng thái cửa hàng, `app.js` điều khiển giao diện. `auth.html` và `auth.js` cung cấp tài khoản khách hàng. `admin/login.html` và `admin/login.js` cung cấp đăng nhập quản trị, `admin/index.html` và `admin/admin.js` cung cấp trang quản lý. Khi database đã tạo, sửa danh mục qua `/admin`, dữ liệu seed không ghi đè các thay đổi quản trị.

## Nguồn tham khảo giao diện

Các bố cục ban đầu tham khảo [Spawn Vault](https://github.com/Mattlambo/comic-e-commerce), [ComicVerse](https://github.com/AlgoBrother/ComicVerse) và [anime-store-ecommerce](https://github.com/Zaki-akdas/anime-store-ecommerce). Mã ứng dụng và bìa SVG trong dự án được viết riêng, tên truyện và nội dung danh mục là minh họa.
