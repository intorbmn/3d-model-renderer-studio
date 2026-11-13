# 3D Model Renderer Studio

[English](README.md)

Công cụ chạy trên trình duyệt để tạo **card model** cho mod Minecraft [3D Model Renderer](https://github.com/intorbmn/3d-model-renderer). Card là một ảnh PNG của nhân vật, bên trong chứa toàn bộ model (lưới, texture và thông số), giống card nhân vật của Koikatsu. Chỉ cần chia sẻ một file, bỏ vào thư mục `Cards` của mod là dùng được.

**Mở studio:** https://intorbmn.github.io/3d-model-renderer-studio/

Mọi thứ chạy trong trình duyệt của bạn, không tải gì lên mạng.

## Tính năng

- Mở các loại model giống mod: **PMX, PMD, VRM, GLB, glTF** (chọn cả thư mục model để lấy kèm texture, hoặc kéo thả vào).
- Xem trước model với các động tác mặc định của mod (đứng, đi, chạy, ngồi, bơi, bò, bay elytra, cưỡi, ngủ, vung tay) hoặc file `.vmd` bất kỳ. Bộ xương không phải MMD được chuyển động tác giống cách mod làm, và thanh trạng thái cho biết mod có cử động được bộ xương đó hay không.
- Chỉnh card: tên, tác giả model, điều khoản sử dụng, nguồn, ghi chú, kích thước và màu cho từng material (mod áp dụng đúng các màu này). Thanh biểu cảm chỉ để xem trước.
- Xuất card thành ảnh PNG. Mở lại card để sửa tiếp.
- Nhận ra card Koikatsu và hướng dẫn cách chuyển: card Koikatsu chỉ chứa thông số cho trình tạo nhân vật, không có model 3D, nên cần xuất nhân vật ra PMX bằng KKBP exporter trước.

## Định dạng card

Xem [docs/CARD_FORMAT.md](docs/CARD_FORMAT.md). Tóm tắt: một ảnh PNG bình thường, nối sau là khối `3DMRCARD` gồm manifest JSON và các file model (nén deflate, có SHA-256 cho từng file), cuối cùng là 16 byte kết thúc. Trình xem ảnh vẫn hiện bức ảnh như thường.

## Tôn trọng điều khoản của model

Card chứa toàn bộ model. Chỉ chia sẻ card của model cho phép phân phối lại, và điền đủ tác giả cùng điều khoản sử dụng.

## Dự kiến

- Model mẫu có sẵn với thanh chỉnh kiểu Koikatsu (tỉ lệ cơ thể, tóc, trang phục). Đang chờ một model có giấy phép cho phép đóng gói kèm, và engine của mod hỗ trợ chỉnh dáng người.
- Mẫu tư thế và góc máy cho ảnh card.

## Phát triển

Không cần build. Mở thư mục qua HTTP (`npm run serve`, rồi vào http://localhost:8000) và sửa các file trong `src/`. `npm test` chạy test định dạng card (Node 22).

three.js và three-vrm được đặt sẵn trong `vendor/` để trang chạy không cần CDN. Xem [THIRD_PARTY.md](THIRD_PARTY.md).

## Giấy phép

MIT. Xem [LICENSE](LICENSE).
