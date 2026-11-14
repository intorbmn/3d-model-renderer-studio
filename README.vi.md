# 3D Model Renderer Studio

[English](README.md)

Công cụ chạy trên trình duyệt để tạo **card model** cho mod Minecraft [3D Model Renderer](https://github.com/intorbmn/3d-model-renderer). Card là một ảnh PNG của nhân vật, bên trong chứa toàn bộ model (lưới, texture, thông số và vật lý), giống card nhân vật của Koikatsu. Chỉ cần chia sẻ một file, bỏ vào thư mục `3d-skin/Cards` của mod là dùng được.

**Mở studio:** https://intorbmn.github.io/3d-model-renderer-studio/

Mọi thứ chạy trong trình duyệt của bạn, không tải gì lên mạng.

## Cách dùng

1. **Mở model**: *Open model folder* (chọn cả thư mục để lấy kèm texture), *Open files*, hoặc kéo thả thư mục vào khung xem. Studio nhận các loại giống mod: **PMX, PMD, VRM, GLB, glTF**.
2. **Xem model cử động**: chọn động tác ở thanh dưới (đứng, đi, chạy, ngồi, bơi, bò, bay elytra, cưỡi, ngủ, vung tay của mod) hoặc tải file `.vmd` riêng. Với bộ xương không phải MMD, thanh trạng thái báo mod có nhận diện được không.
3. **Điền thông tin card** (tab *Card*): tên, tác giả model, điều khoản sử dụng, nguồn, ghi chú, kích thước.
4. Tab **Character**, cho model có xương hình dáng kiểu ILLGAMES (ví dụ nhân vật xuất bằng KKBP, xem bên dưới): thanh trượt cho cơ thể (đầu, cổ, vai, ngực, eo, hông, vòng một, tay, chân) và mặt (khuôn mặt, mắt, lông mày, mũi, miệng, tai), cùng danh sách **Parts** để ẩn/hiện từng phần (tóc, áo, quần, giày…) và **tự import** quần áo, tóc, giày, phụ kiện (GLB/glTF gắn cùng khung xương, ví dụ một bản KKBP khác xuất với `--only-outfit`). Mỗi thanh trượt có ô nhập số để nhập giá trị chính xác (giá trị nhập tay có thể vượt hai đầu thanh trượt); nhấp đúp để đặt lại. **Lưu mặc định** giữ các giá trị hiện tại (trong trình duyệt và trong card), **Về mặc định đã lưu** và **Về gốc** để hoàn tác khi thử nghiệm, **Dùng làm model gốc** biến cơ thể hiện tại thành điểm bắt đầu cho **Tạo nhân vật**. Card lưu thông số và mod áp dụng khi nạp model, nên mọi card làm theo cách này đều chạy giống nhau.
5. **Vật lý** (tab *Physics*), cho model VRM, GLB, glTF:
   - Các chuỗi spring bone được chia thành nhóm **tóc**, **quần áo**, **cơ thể**, **tuỳ chỉnh** theo tên xương, hoặc lấy từ spring bone có sẵn của VRM. *Detect again* để nhận diện lại.
   - Mỗi nhóm: bật/tắt, độ cứng, lực cản, trọng lực, bán kính va chạm, và chọn vùng va chạm mà nhóm đó va vào.
   - **Thêm nhóm tuỳ chỉnh** từ bất kỳ xương gốc nào (chuỗi đi theo các xương con).
   - **Va chạm**: các vùng va chạm ở đầu, cổ, thân, ngực, hông, tay, chân giữ tóc và quần áo không xuyên qua người. Chỉnh cỡ, thêm vùng ở bất kỳ xương nào, bật *Show colliders* để xem.
   - *Preview* chạy vật lý trực tiếp khi model đang cử động.
   - Model PMX/PMD giữ vật lý rigid body có sẵn trong file; mod chạy vật lý đó.
6. Tab **Colours**: màu theo từng material (mod áp dụng đúng màu này) và xem trước biểu cảm.
7. **Export card**. Muốn sửa thì mở lại bằng *Open card*.

**Export model** lưu model ra GLB, glTF, OBJ, STL hoặc PLY (OBJ/STL/PLY theo tư thế đang hiển thị), hoặc tải file gốc.

**Card ILLGAMES** (Koikatsu, Koikatsu Sunshine, AI Shoujo / Honey Select 2, Honey Come, Summer Vacation Scramble…) được nhận ra và đọc, nhưng chỉ chứa thông số cho trình tạo nhân vật của game, không có model 3D. Để đưa chính nhân vật vào, xuất theo hướng dẫn bên dưới.

## Model và trang phục từ game ILLGAMES

Nhân vật và trang phục từ game ILLGAMES có thể xuất ra rồi đưa vào studio: cơ thể thành model gốc, mỗi bộ trang phục thành một phần để mặc trong tab **Character**. Quy trình đi qua Blender với [KKBP (KK Blender Porter Pack)](https://github.com/FlailingFog/KK-Blender-Porter-Pack), hỗ trợ Koikatsu và Koikatsu Sunshine (xem trang KKBP để biết các game và phiên bản được hỗ trợ), cùng script trong repo này (Blender 4.x/5.x).

1. **Trong game**: xuất nhân vật bằng plugin exporter của KKBP (xem hướng dẫn của KKBP), mặc bộ trang phục bạn muốn.
2. **Trong Blender**: import bản xuất đó bằng KKBP rồi lưu file `.blend`.
3. **Xuất ra GLB** bằng script:

   ```
   # chỉ cơ thể (có mặt, không quần áo, không tóc): model gốc
   blender --background character.blend --python tools/blender/export_kkbp_glb.py -- body.glb --no-outfit
   # chỉ trang phục và tóc: một phần để import
   blender --background character.blend --python tools/blender/export_kkbp_glb.py -- outfit.glb --only-outfit
   # tất cả trong một file
   blender --background character.blend --python tools/blender/export_kkbp_glb.py -- character.glb
   ```

   Lặp lại bước 1–3 với các bộ trang phục khác (hoặc nhân vật khác dùng cùng cơ thể của game) để có thêm phần.
4. **Trong studio**: mở `body.glb`, bấm **Dùng làm model gốc** để **Tạo nhân vật** bắt đầu từ cơ thể này, rồi vào **Character → Parts**, chọn loại (tóc, áo, quần, giày, tất, phụ kiện) và **Nhập phần mới** với `outfit.glb`. Phần được gắn vào xương của cơ thể theo tên, nên đi theo cơ thể, thanh chỉnh hình dáng, động tác và vật lý.
5. **Xuất card**: cơ thể cùng các phần đang mặc được ghi thành một model, mod nạp như mọi model khác.

File GLB giữ lại các xương hình dáng mà tab Character dùng, biểu cảm và xương tóc/váy/ngực cho vật lý, đồng thời đặt tên khung xương để mod nhận diện. File xuất trước ngày 14/11/2026 có xương phụ của khuỷu tay và cẳng tay bị gắn vào ngực, làm tay biến dạng sai khi cử động: hãy xuất lại bằng script hiện tại.

File xuất ra chứa tài sản của game: chỉ dùng cho bản thân, không chia sẻ trừ khi điều khoản của game cho phép.

## Định dạng card

Xem [docs/CARD_FORMAT.md](docs/CARD_FORMAT.md). Tóm tắt: một ảnh PNG bình thường, nối sau là khối `3DMRCARD` gồm manifest JSON (thông tin, thông số, nhóm vật lý và vùng va chạm) và các file model (nén deflate, có SHA-256 cho từng file), cuối cùng là 16 byte kết thúc. Trình xem ảnh vẫn hiện bức ảnh như thường.

## Tôn trọng điều khoản của model

Card chứa toàn bộ model. Chỉ chia sẻ card của model cho phép phân phối lại, và điền đủ tác giả cùng điều khoản sử dụng.

## Dự kiến

- Trình tạo nhân vật trên model gốc mới (cơ thể và mặt, kèm tóc, quần áo, vật lý cơ thể dạng bộ phận), mẫu nữ và nam, dựng lại nhân vật từ card ILLGAMES. Bản đầu tiên đang tắt để chờ model đó.
- Trình tạo animation: tạo dáng trên khung xương cơ bản (tên xương MMD, nên động tác dùng được cho mọi model mod cử động được), đặt keyframe trên timeline, rồi lưu vào card hoặc xuất VMD riêng để bỏ vào `3d-skin/EntityPlayer/<model>/` hay `3d-skin/CustomAnim/`. Phần nền đã có trong `src/rig/` và `src/animation/` (khung xương chuẩn, dữ liệu keyframe, ghi file VMD); giao diện trình tạo chưa làm.
- Mẫu tư thế và góc máy cho ảnh card.

## Phát triển

Không cần build. Mở thư mục qua HTTP (`npm run serve`, rồi vào http://localhost:8000) và sửa các file trong `src/`. `npm test` chạy test định dạng card, card ILLGAMES và animation (Node 22). GitHub Pages tự đăng nhánh `main` sau khi test qua.

three.js và three-vrm được đặt sẵn trong `vendor/` để trang chạy không cần CDN. Xem [THIRD_PARTY.md](THIRD_PARTY.md).

## Giấy phép

MIT. Xem [LICENSE](LICENSE).
