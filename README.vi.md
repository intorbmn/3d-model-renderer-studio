# 3D Model Renderer Studio

[English](README.md)

Công cụ chạy trên trình duyệt để làm **card nhân vật** cho mod Minecraft [3D Model Renderer](https://github.com/intorbmn/3d-model-renderer) từ nhân vật của các game ILLGAMES. Card là một ảnh PNG của nhân vật, bên trong chứa toàn bộ model (cơ thể, outfit, texture, hình dáng, thông số và vật lý), giống ý tưởng card nhân vật của Koikatsu. Chia sẻ một file, thả vào thư mục `3d-skin/Cards` của mod là xong.

**Mở studio:** https://intorbmn.github.io/3d-model-renderer-studio/

Mọi thứ chạy trong trình duyệt. Không có gì được tải lên.

## Studio hỗ trợ gì

Studio chính thức hỗ trợ **nhân vật xuất từ game ILLGAMES** (xem bên dưới): model có khung xương và xương hình dáng của game, giống model mẫu. Chỉ những model này mới có phần chỉnh nhân vật, outfit, vật lý, màu và xuất card.

Các model khác (GLB, VRM, PMX/PMD…) chỉ mở để **xem động tác**. Trong mod, chúng dùng như MMD Skin: đặt thư mục model vào `3d-skin`. Trình chỉnh animation cho các model này đang được lên kế hoạch.

## Cách dùng

1. **Mở nhân vật**: *Open files* (hoặc kéo thả file vào khung xem) với file GLB xuất theo hướng dẫn bên dưới, hoặc *Open card* với card làm từ studio.
2. **Xem nhân vật cử động**: chọn động tác ở dưới (idle, walk, sprint, sneak, swim, crawl, elytra, ride, sleep, swing của mod) hoặc tải file `.vmd` của bạn.
3. **Điền thông tin card** (tab *Card*): tên, tác giả, điều khoản sử dụng, nguồn, ghi chú, kích thước.
4. Tab **Nhân vật**: thanh trượt **Cơ thể** và **Mặt** như trình tạo nhân vật của game, chia theo từng phần (đầu và cổ, thân, ngực và mông, tay, chân; khuôn mặt, mắt, lông mày, mũi, miệng, tai). Mỗi thanh có ô nhập số để nhập giá trị chính xác (giá trị nhập tay có thể vượt hai đầu thanh trượt); nhấp đúp để đặt lại.
5. Tab **Outfit**:
   - **Các món**: mỗi loại là một ô, gồm **tóc, áo, áo trong, quần/váy, quần trong, tất, giày, phụ kiện** (và các phần của cơ thể). Bấm vào ô để mở: ẩn/hiện từng món, xoá món đã nhập, hoặc nhập món mới vào ô đó. **Nhập outfit** nhận cả một file outfit (ví dụ KKBP xuất với `--only-outfit`), tự tách ra từng món và đặt vào đúng ô; món cũ trong ô vẫn nằm trong card (bị ẩn), nên một card chứa được nhiều bộ đồ. Tóc để riêng: tóc trong file outfit chỉ được dùng khi nhân vật chưa có tóc.
   - **Preset**: lưu bộ đồ đang mặc thành preset có tên, mặc lại, cập nhật, xoá và chọn preset mặc định. Trong game, mục **Trang phục** trong vòng cấu hình đổi giữa các preset của card.
6. Tab **Vật lý**: nhóm tóc, quần áo, cơ thể (ngực, mông) được nhận ra từ tên xương, kể cả xương của outfit. Mở một nhóm để chỉnh: kiểu **Lò xo** cho tóc, quần áo (độ cứng, lực cản, trọng lực), kiểu **Nảy** cho ngực, mông (tốc độ nảy, độ nhanh dừng, độ chảy xuống), bán kính va chạm, **góc tối đa** và các vùng va chạm. Thêm nhóm tuỳ chỉnh từ xương bất kỳ; vùng va chạm trên cơ thể. *Xem trước* chạy đúng bộ giải vật lý của mod khi động tác đang phát.
7. Tab **Màu**: màu theo từng material (mod áp dụng đúng các màu này) và xem trước biểu cảm.
8. Thanh **Giá trị** ở dưới cùng: **Lưu** giữ các giá trị hiện tại (trong trình duyệt và trong card); **Về đã lưu** và **Về gốc** để hoàn tác khi thử nghiệm.
9. **Xuất card**. Nhân vật, các bộ outfit, preset và mọi thông số đã chỉnh đều được lưu trong card; *Open card* mở lại tất cả, kể cả các ô outfit, để chỉnh tiếp.

**Export model** lưu nhân vật cùng outfit ra GLB, glTF, OBJ, STL hoặc PLY (OBJ/STL/PLY theo tư thế đang hiện), hoặc file gốc.

**Card ILLGAMES** (Koikatsu, Koikatsu Sunshine, AI Shoujo / Honey Select 2, Honey Come, Summer Vacation Scramble…) được nhận ra và đọc, nhưng chỉ chứa thông số cho trình tạo nhân vật của game, không có model 3D. Để đưa chính nhân vật vào, xuất theo hướng dẫn bên dưới.

## Model và trang phục từ game ILLGAMES

Nhân vật và trang phục từ game ILLGAMES có thể xuất ra rồi đưa vào studio: cơ thể (kèm mặt) là nhân vật, còn mỗi bộ trang phục được nhập vào trong tab **Outfit**. Quy trình đi qua Blender với [KKBP (KK Blender Porter Pack)](https://github.com/FlailingFog/KK-Blender-Porter-Pack), hỗ trợ Koikatsu và Koikatsu Sunshine (xem trang KKBP để biết các game và phiên bản được hỗ trợ), cùng script trong repo này (Blender 4.x/5.x).

1. **Trong game**: xuất nhân vật bằng plugin exporter của KKBP (xem hướng dẫn của KKBP), mặc bộ trang phục bạn muốn.
2. **Trong Blender**: import bản xuất đó bằng KKBP rồi lưu file `.blend`.
3. **Xuất ra GLB** bằng script:

   ```
   # chỉ cơ thể (có mặt, không quần áo, không tóc): nhân vật
   blender --background character.blend --python tools/blender/export_kkbp_glb.py -- body.glb --no-outfit
   # chỉ trang phục và tóc: outfit để nhập
   blender --background character.blend --python tools/blender/export_kkbp_glb.py -- outfit.glb --only-outfit
   # tất cả trong một file
   blender --background character.blend --python tools/blender/export_kkbp_glb.py -- character.glb
   ```

   Không cần dòng lệnh: cài `tools/blender/export_kkbp_glb.py` làm add-on Blender (Edit → Preferences → Add-ons → Install from Disk) rồi dùng **File → Export → Body + outfit for 3D Model Renderer Studio**, hoặc trên Windows kéo file `.blend` thả lên `tools/blender/kkbp_to_studio.bat` (để cạnh script). Cả hai cách đều ghi `<tên>_body.glb` và `<tên>_outfitNN.glb (mỗi bộ đồ một file)` cạnh file `.blend`. Nút **.blend → GLB** trong studio có link tải và các bước này.

   Lặp lại bước 1–3 với các bộ trang phục khác (hoặc nhân vật khác của cùng game) để có thêm outfit.
4. **Trong studio**: mở `body.glb`, rồi vào **Outfit → Các món**, bấm **Nhập outfit** với `outfit.glb`. Các món tự vào đúng ô và gắn vào xương của cơ thể, nên đi theo cơ thể, thanh chỉnh hình dáng, động tác và vật lý.
5. **Xuất card**: cơ thể và outfit được ghi thành một model với một khung xương, mod nạp như mọi model khác, outfit chuyển động theo xương và vật lý của cơ thể.

File GLB giữ lại các xương hình dáng mà tab Character dùng, biểu cảm và xương tóc/váy/ngực cho vật lý, đồng thời đặt tên khung xương để mod nhận diện. File xuất trước ngày 14/11/2026 có xương phụ của khuỷu tay và cẳng tay bị gắn vào ngực, làm tay biến dạng sai khi cử động: hãy xuất lại bằng script hiện tại.

File xuất ra chứa tài sản của game: chỉ dùng cho bản thân, không chia sẻ trừ khi điều khoản của game cho phép.

## Định dạng card

Xem [docs/CARD_FORMAT.md](docs/CARD_FORMAT.md). Tóm tắt: một ảnh PNG bình thường, nối sau là khối `3DMRCARD` gồm manifest JSON (thông tin, thông số, nhóm vật lý và vùng va chạm) và các file model (nén deflate, có SHA-256 cho từng file), cuối cùng là 16 byte kết thúc. Trình xem ảnh vẫn hiện bức ảnh như thường.

## Tôn trọng điều khoản của model

Card chứa toàn bộ model. Chỉ chia sẻ card của model cho phép phân phối lại, và điền đủ tác giả cùng điều khoản sử dụng.

## Dự kiến

- Trình tạo animation: tạo dáng trên khung xương cơ bản (tên xương MMD, nên động tác dùng được cho mọi model mod cử động được), đặt keyframe trên timeline, rồi lưu vào card hoặc xuất VMD riêng để bỏ vào `3d-skin/EntityPlayer/<model>/` hay `3d-skin/CustomAnim/`. Phần nền đã có trong `src/rig/` và `src/animation/` (khung xương chuẩn, dữ liệu keyframe, ghi file VMD); giao diện trình tạo chưa làm.
- Mẫu tư thế và góc máy cho ảnh card.

## Phát triển

Không cần build. Mở thư mục qua HTTP (`npm run serve`, rồi vào http://localhost:8000) và sửa các file trong `src/`. `npm test` chạy test định dạng card, card ILLGAMES và animation (Node 22). GitHub Pages tự đăng nhánh `main` sau khi test qua.

three.js và three-vrm được đặt sẵn trong `vendor/` để trang chạy không cần CDN. Xem [THIRD_PARTY.md](THIRD_PARTY.md).

## Giấy phép

MIT. Xem [LICENSE](LICENSE).
