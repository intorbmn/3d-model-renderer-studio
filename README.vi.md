# 3D Model Renderer Studio

[English](README.md)

Công cụ chạy trên trình duyệt để tạo **card model** cho mod Minecraft [3D Model Renderer](https://github.com/intorbmn/3d-model-renderer). Card là một ảnh PNG của nhân vật, bên trong chứa toàn bộ model (lưới, texture và thông số), giống card nhân vật của Koikatsu. Chỉ cần chia sẻ một file, bỏ vào thư mục `Cards` của mod là dùng được.

**Mở studio:** https://intorbmn.github.io/3d-model-renderer-studio/

Mọi thứ chạy trong trình duyệt của bạn, không tải gì lên mạng.

## Tính năng

- **Tạo nhân vật** từ cơ thể gốc có sẵn (chưa có quần áo, không có chi tiết trên cơ thể, chỉ có mặt), với mẫu **nữ** và **nam**. Chỉnh bằng thanh trượt giống trình tạo nhân vật của các game ILLGAMES: cơ thể, mặt, tóc (kiểu, độ dài, màu), trang phục (áo, váy/quần đùi/quần dài). Tóc, váy và ngực có sẵn xương vật lý.
- **Nhóm vật lý**: các chuỗi spring bone chia thành nhóm tóc, quần áo, cơ thể và tuỳ chỉnh; tự nhận diện theo tên xương (hoặc lấy spring bone có sẵn của VRM), chỉnh từng nhóm, xem trước trực tiếp và ghi vào card để mod nhận diện. Có thể tự thêm nhóm từ bất kỳ xương nào.
- **Card ILLGAMES** (Koikatsu, Koikatsu Sunshine, AI Shoujo / Honey Select 2, Honey Come, Summer Vacation Scramble…): các card này chỉ chứa thông số cho trình tạo nhân vật, không có model 3D, nên studio dựng lại nhân vật trên cơ thể gốc theo tỉ lệ cơ thể và màu sắc trong card.
- **Xuất model** ra GLB, glTF, OBJ, STL hoặc PLY (OBJ/STL/PLY theo tư thế hiện tại), hoặc tải file gốc.

- Mở các loại model giống mod: **PMX, PMD, VRM, GLB, glTF** (chọn cả thư mục model để lấy kèm texture, hoặc kéo thả vào).
- Xem trước model với các động tác mặc định của mod (đứng, đi, chạy, ngồi, bơi, bò, bay elytra, cưỡi, ngủ, vung tay) hoặc file `.vmd` bất kỳ. Bộ xương không phải MMD được chuyển động tác giống cách mod làm, và thanh trạng thái cho biết mod có cử động được bộ xương đó hay không.
- Chỉnh card: tên, tác giả model, điều khoản sử dụng, nguồn, ghi chú, kích thước và màu cho từng material (mod áp dụng đúng các màu này). Thanh biểu cảm chỉ để xem trước.
- Xuất card thành ảnh PNG. Mở lại card để sửa tiếp.
- Muốn bản sao chính xác của nhân vật Koikatsu: xuất nhân vật ra PMX bằng KKBP exporter trong game rồi mở file PMX đó ở đây.

## Định dạng card

Xem [docs/CARD_FORMAT.md](docs/CARD_FORMAT.md). Tóm tắt: một ảnh PNG bình thường, nối sau là khối `3DMRCARD` gồm manifest JSON và các file model (nén deflate, có SHA-256 cho từng file), cuối cùng là 16 byte kết thúc. Trình xem ảnh vẫn hiện bức ảnh như thường.

## Tôn trọng điều khoản của model

Card chứa toàn bộ model. Chỉ chia sẻ card của model cho phép phân phối lại, và điền đủ tác giả cùng điều khoản sử dụng.

## Dự kiến

- Thêm kiểu tóc, món trang phục và dáng mặt cho cơ thể gốc; texture cho da và quần áo.
- Mẫu tư thế và góc máy cho ảnh card.

## Phát triển

Không cần build. Mở thư mục qua HTTP (`npm run serve`, rồi vào http://localhost:8000) và sửa các file trong `src/`. `npm test` chạy test định dạng card (Node 22).

three.js và three-vrm được đặt sẵn trong `vendor/` để trang chạy không cần CDN. Xem [THIRD_PARTY.md](THIRD_PARTY.md).

## Giấy phép

MIT. Xem [LICENSE](LICENSE).
