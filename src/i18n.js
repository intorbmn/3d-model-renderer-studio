const STRINGS = {
  vi: {
    newCharacter: 'Tạo nhân vật', newHint: 'Bắt đầu từ cơ thể gốc (chưa có quần áo, chỉ có mặt), rồi chỉnh trong tab Nhân vật.',
    female: 'Nữ', male: 'Nam', cancel: 'Huỷ', preset: 'Mẫu',
    exportModel: 'Xuất model', exported: 'Đã xuất', exportFailed: 'Không xuất được:',
    fmt_original: 'File gốc', fmt_glb: 'GLB', fmt_gltf: 'glTF', fmt_obj: 'OBJ (tư thế hiện tại)', fmt_stl: 'STL (tư thế hiện tại)', fmt_ply: 'PLY (tư thế hiện tại)',
    tabMaker: 'Nhân vật', tabInfo: 'Card', tabPhysics: 'Vật lý', tabLook: 'Màu',
    makerBody: 'Cơ thể', makerFace: 'Mặt', makerHair: 'Tóc', makerClothing: 'Trang phục',
    s_height: 'Chiều cao', s_headSize: 'Cỡ đầu', s_neckLength: 'Độ dài cổ', s_shoulderWidth: 'Độ rộng vai',
    s_bustSize: 'Cỡ ngực', s_bustSoftness: 'Độ mềm ngực', s_waist: 'Vòng eo', s_hipWidth: 'Độ rộng hông',
    s_armThickness: 'Độ dày tay', s_thighThickness: 'Độ dày đùi', s_legLength: 'Độ dài chân',
    s_eyeSize: 'Cỡ mắt', s_eyeHeight: 'Vị trí mắt', s_eyeSpacing: 'Khoảng cách mắt',
    s_hairLength: 'Độ dài tóc', s_hairVolume: 'Độ dày tóc', s_hairSoftness: 'Độ mềm tóc',
    s_topLength: 'Độ dài áo', s_bottomLength: 'Độ dài váy/quần', s_clothingSoftness: 'Độ mềm vải',
    c_skinColor: 'Màu da', c_eyeColor: 'Màu mắt', c_hairColor: 'Màu tóc', c_topColor: 'Màu áo', c_bottomColor: 'Màu váy/quần',
    hairStyle: 'Kiểu tóc', top: 'Áo', bottom: 'Phần dưới',
    o_none: 'Không', o_short: 'Ngắn', o_bob: 'Bob', o_long: 'Dài', o_ponytail: 'Đuôi ngựa', o_twintails: 'Hai bím',
    o_shirt: 'Áo', o_skirt: 'Váy', o_shorts: 'Quần đùi', o_pants: 'Quần dài',
    physicsHint: 'Các nhóm vật lý được ghi vào card; mod tự nhận diện từng nhóm (tóc, quần áo, cơ thể, tuỳ chỉnh).',
    physicsDetect: 'Tự nhận diện lại', physicsPreview: 'Xem trước', physicsAdd: 'Thêm nhóm tuỳ chỉnh', physicsRoot: 'Xương gốc',
    physicsKind: 'Loại', physicsName: 'Tên nhóm', physicsAddButton: 'Thêm', physicsNone: 'Chưa có nhóm vật lý nào.',
    physicsPmx: 'Model PMX dùng vật lý rigid body có sẵn trong file; mod chạy vật lý đó.', physicsChains: 'chuỗi',
    kind_hair: 'Tóc', kind_clothing: 'Quần áo', kind_body: 'Cơ thể', kind_custom: 'Tuỳ chỉnh',
    p_stiffness: 'Độ cứng', p_drag: 'Lực cản', p_gravity: 'Trọng lực', p_radius: 'Bán kính va chạm', remove: 'xoá',
    physicsChainFailed: 'Xương này không có xương con để tạo chuỗi vật lý.',
    collidersTitle: 'Va chạm', collidersHint: 'Vùng va chạm giữ tóc, quần áo không xuyên qua người. Mỗi nhóm chọn vùng nó va vào.',
    collidersShow: 'Hiện vùng va chạm', colliderBone: 'Thêm vùng va chạm ở xương', groupColliders: 'Va vào',
    illgamesCard: 'Card nhân vật {game}{name}. Card ILLGAMES chỉ chứa thông số cho trình tạo nhân vật của game, không có model 3D, nên studio dựng lại trên cơ thể gốc: dáng người, màu da, tóc và mắt. Kiểu tóc, mặt và trang phục chọn lại trong tab Nhân vật.',
    illgamesFailed: 'Không đọc được card ILLGAMES:',
    openFolder: 'Mở thư mục model', openFolderHint: 'Chọn thư mục chứa model và texture',
    openFiles: 'Mở file', openCard: 'Mở card', exportCard: 'Xuất card',
    cardInfo: 'Thông tin card', name: 'Tên', author: 'Tác giả model', license: 'Điều khoản sử dụng',
    source: 'Nguồn', notes: 'Ghi chú', adjust: 'Chỉnh model', scale: 'Kích thước',
    colors: 'Màu theo material', colorsHint: 'Nhân màu cho từng phần (da, tóc, mắt...). Mod áp dụng đúng các màu này.',
    expressions: 'Biểu cảm (xem trước)', noExpressions: 'Model không có biểu cảm.',
    dropTitle: 'Kéo thả thư mục model hoặc card vào đây', dropFormats: 'PMX · PMD · VRM · GLB · glTF · card PNG · card ILLGAMES',
    dropNow: 'Thả để mở', ready: 'Sẵn sàng', loading: 'Đang nạp model…', loadFailed: 'Không nạp được model:',
    motion: 'Động tác', loadVmd: 'Tải VMD', pause: 'Tạm dừng', play: 'Phát', reframe: 'Căn khung',
    preview: 'Card', retake: 'Chụp lại ảnh card', reset: 'đặt lại',
    motionNone: '(đứng yên)', motionCustom: 'VMD đã tải', motionFailed: 'Không phát được động tác:',
    motion_idle: 'Đứng chờ', motion_walk: 'Đi bộ', motion_sprint: 'Chạy', motion_sneak: 'Ngồi xổm',
    motion_swim: 'Bơi', motion_crawl: 'Bò', motion_elytraFly: 'Bay elytra', motion_ride: 'Cưỡi',
    motion_sleep: 'Ngủ', motion_swingRight: 'Vung tay phải',
    rigRecognised: 'Nhận diện được bộ xương: có animation trong mod',
    rigNotRecognised: 'Không nhận diện được bộ xương: model sẽ đứng yên trong mod (thêm bones.json để chỉ định)',
    missingFiles: 'Thiếu file:', format: 'Định dạng', vertices: 'Số đỉnh', materials: 'Material', files: 'Số file',
    animation: 'Animation', yes: 'có', no: 'không',
    noModel: 'Không tìm thấy file model (PMX, PMD, VRM, GLB, glTF) trong các file đã chọn.',
    notACard: 'Ảnh này không phải card model của 3D Model Renderer.',
    badCard: 'Card bị hỏng hoặc không hợp lệ:',
    koikatsuCard: 'Đây là card Koikatsu. Card Koikatsu chỉ chứa thông số cho trình tạo nhân vật của game, không chứa model 3D, nên không chuyển trực tiếp được. Hãy xuất nhân vật ra PMX bằng KKBP exporter trong game, rồi mở file PMX đó ở đây.',
  },
  en: {
    newCharacter: 'New character', newHint: 'Start from the base body (no clothes, only a face), then shape it in the Character tab.',
    female: 'Female', male: 'Male', cancel: 'Cancel', preset: 'Preset',
    exportModel: 'Export model', exported: 'Exported', exportFailed: 'Export failed:',
    fmt_original: 'Original file', fmt_glb: 'GLB', fmt_gltf: 'glTF', fmt_obj: 'OBJ (current pose)', fmt_stl: 'STL (current pose)', fmt_ply: 'PLY (current pose)',
    tabMaker: 'Character', tabInfo: 'Card', tabPhysics: 'Physics', tabLook: 'Colours',
    makerBody: 'Body', makerFace: 'Face', makerHair: 'Hair', makerClothing: 'Clothing',
    s_height: 'Height', s_headSize: 'Head size', s_neckLength: 'Neck length', s_shoulderWidth: 'Shoulder width',
    s_bustSize: 'Bust size', s_bustSoftness: 'Bust softness', s_waist: 'Waist', s_hipWidth: 'Hip width',
    s_armThickness: 'Arm thickness', s_thighThickness: 'Thigh thickness', s_legLength: 'Leg length',
    s_eyeSize: 'Eye size', s_eyeHeight: 'Eye height', s_eyeSpacing: 'Eye spacing',
    s_hairLength: 'Hair length', s_hairVolume: 'Hair volume', s_hairSoftness: 'Hair softness',
    s_topLength: 'Top length', s_bottomLength: 'Skirt/trouser length', s_clothingSoftness: 'Cloth softness',
    c_skinColor: 'Skin', c_eyeColor: 'Eyes', c_hairColor: 'Hair', c_topColor: 'Top colour', c_bottomColor: 'Bottom colour',
    hairStyle: 'Hair style', top: 'Top', bottom: 'Bottom',
    o_none: 'None', o_short: 'Short', o_bob: 'Bob', o_long: 'Long', o_ponytail: 'Ponytail', o_twintails: 'Twin tails',
    o_shirt: 'Shirt', o_skirt: 'Skirt', o_shorts: 'Shorts', o_pants: 'Trousers',
    physicsHint: 'Physics groups are written into the card; the mod recognises each group (hair, clothing, body, custom).',
    physicsDetect: 'Detect again', physicsPreview: 'Preview', physicsAdd: 'Add a custom group', physicsRoot: 'Root bone',
    physicsKind: 'Kind', physicsName: 'Group name', physicsAddButton: 'Add', physicsNone: 'No physics groups yet.',
    physicsPmx: 'PMX models use the rigid-body physics in the file; the mod runs that.', physicsChains: 'chains',
    kind_hair: 'Hair', kind_clothing: 'Clothing', kind_body: 'Body', kind_custom: 'Custom',
    p_stiffness: 'Stiffness', p_drag: 'Drag', p_gravity: 'Gravity', p_radius: 'Hit radius', remove: 'remove',
    physicsChainFailed: 'That bone has no child bone to make a physics chain.',
    collidersTitle: 'Collision', collidersHint: 'Colliders keep hair and clothes from passing through the body. Each group picks the colliders it bumps into.',
    collidersShow: 'Show colliders', colliderBone: 'Add a collider on bone', groupColliders: 'Collides with',
    illgamesCard: '{game} character card{name}. ILLGAMES cards only hold settings for the game\'s character maker, not a 3D model, so the studio rebuilds the character on the base body: proportions, skin, hair and eye colour. Pick hair style, face and clothing again in the Character tab.',
    illgamesFailed: 'Could not read the ILLGAMES card:',
    openFolder: 'Open model folder', openFolderHint: 'Pick the folder that holds the model and its textures',
    openFiles: 'Open files', openCard: 'Open card', exportCard: 'Export card',
    cardInfo: 'Card details', name: 'Name', author: 'Model author', license: 'Terms of use',
    source: 'Source', notes: 'Notes', adjust: 'Adjust model', scale: 'Size',
    colors: 'Colour per material', colorsHint: 'Tint each part (skin, hair, eyes…). The mod applies the same tints.',
    expressions: 'Expressions (preview)', noExpressions: 'This model has no expressions.',
    dropTitle: 'Drop a model folder or a card here', dropFormats: 'PMX · PMD · VRM · GLB · glTF · PNG card · ILLGAMES card',
    dropNow: 'Drop to open', ready: 'Ready', loading: 'Loading model…', loadFailed: 'Could not load the model:',
    motion: 'Motion', loadVmd: 'Load VMD', pause: 'Pause', play: 'Play', reframe: 'Frame model',
    preview: 'Card', retake: 'Retake card picture', reset: 'reset',
    motionNone: '(still)', motionCustom: 'Loaded VMD', motionFailed: 'Could not play the motion:',
    motion_idle: 'Idle', motion_walk: 'Walk', motion_sprint: 'Sprint', motion_sneak: 'Sneak',
    motion_swim: 'Swim', motion_crawl: 'Crawl', motion_elytraFly: 'Elytra flight', motion_ride: 'Ride',
    motion_sleep: 'Sleep', motion_swingRight: 'Right-hand swing',
    rigRecognised: 'Skeleton recognised: animated in the mod',
    rigNotRecognised: 'Skeleton not recognised: the model will stand still in the mod (add a bones.json)',
    missingFiles: 'Missing files:', format: 'Format', vertices: 'Vertices', materials: 'Materials', files: 'Files',
    animation: 'Animation', yes: 'yes', no: 'no',
    noModel: 'No model file (PMX, PMD, VRM, GLB, glTF) among the selected files.',
    notACard: 'This image is not a 3D Model Renderer card.',
    badCard: 'The card is damaged or invalid:',
    koikatsuCard: 'This is a Koikatsu card. Koikatsu cards only hold settings for the game\'s character maker, not a 3D model, so they cannot be converted directly. Export the character to PMX with the KKBP exporter in the game, then open that PMX here.',
  },
};

let language = (() => {
  try {
    const saved = localStorage.getItem('studio.language');
    if (saved && STRINGS[saved]) return saved;
  } catch { /* storage unavailable */ }
  return 'en';
})();

export const currentLanguage = () => language;

export function setLanguage(value) {
  if (!STRINGS[value]) return;
  language = value;
  try { localStorage.setItem('studio.language', value); } catch { /* storage unavailable */ }
}

export function t(key, vars) {
  let text = STRINGS[language][key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, v);
  return text;
}

export function applyTranslations(root = document) {
  document.documentElement.lang = language;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}
