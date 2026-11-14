const STRINGS = {
  vi: {
    shapeHint: 'Chỉnh bằng xương hình dáng như trình tạo nhân vật của game. Card lưu thông số; mod áp dụng khi nạp model.',
    makerParts: 'Bộ phận', shapeReset: 'Đặt lại tất cả', partsHint: 'Ẩn hoặc hiện từng phần (tóc, quần áo…). Phần bị ẩn cũng ẩn trong game.',
    sh_headSize: 'Cỡ đầu', sh_neckThickness: 'Độ dày cổ', sh_shoulderWidth: 'Độ rộng vai', sh_chestWidth: 'Độ rộng ngực',
    sh_chestDepth: 'Độ dày ngực', sh_waistWidth: 'Độ rộng eo', sh_waistDepth: 'Độ dày eo', sh_hipWidth: 'Độ rộng hông',
    sh_bustSize: 'Cỡ ngực', sh_bustLift: 'Độ cao ngực', sh_buttSize: 'Cỡ mông', sh_shoulderThickness: 'Độ dày vai',
    sh_upperArmThickness: 'Độ dày bắp tay', sh_forearmThickness: 'Độ dày cẳng tay', sh_handSize: 'Cỡ bàn tay',
    sh_thighThickness: 'Độ dày đùi', sh_calfThickness: 'Độ dày bắp chân', sh_ankleThickness: 'Độ dày cổ chân',
    sh_faceSize: 'Cỡ mặt', sh_lowerFaceWidth: 'Độ rộng mặt dưới', sh_upperFaceHeight: 'Độ cao mặt trên', sh_jawHeight: 'Độ cao hàm',
    sh_chinWidth: 'Độ rộng cằm', sh_chinDepth: 'Độ nhô cằm', sh_cheekUpper: 'Gò má trên', sh_cheekLower: 'Má dưới',
    sh_eyeSize: 'Cỡ mắt', sh_eyeWidth: 'Độ rộng mắt', sh_eyeOpen: 'Độ mở mắt', sh_eyeSpacing: 'Khoảng cách mắt',
    sh_eyeHeight: 'Vị trí mắt', sh_eyeDepth: 'Độ sâu mắt', sh_eyeAngle: 'Góc mắt', sh_browHeight: 'Độ cao lông mày',
    sh_browAngle: 'Góc lông mày', sh_noseHeight: 'Vị trí mũi', sh_noseSize: 'Cỡ mũi', sh_noseLength: 'Độ nhô mũi',
    sh_mouthHeight: 'Vị trí miệng', sh_mouthWidth: 'Độ rộng miệng', sh_earSize: 'Cỡ tai',

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
    illgamesInfo: 'Card nhân vật {game}{name}. Card ILLGAMES chỉ chứa thông số cho trình tạo nhân vật của game, không có model 3D. Studio sẽ dựng lại nhân vật từ card này khi có model gốc mới; trước mắt hãy xuất nhân vật ra PMX (với Koikatsu: KKBP exporter) rồi mở file đó ở đây.',
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
    shapeHint: 'Shape the character with its shape bones, like the games\' character makers. The card keeps the values; the mod applies them when it loads the model.',
    makerParts: 'Parts', shapeReset: 'Reset all', partsHint: 'Show or hide each part (hair, clothes, ...). Hidden parts are hidden in game too.',
    sh_headSize: 'Head size', sh_neckThickness: 'Neck thickness', sh_shoulderWidth: 'Shoulder width', sh_chestWidth: 'Chest width',
    sh_chestDepth: 'Chest depth', sh_waistWidth: 'Waist width', sh_waistDepth: 'Waist depth', sh_hipWidth: 'Hip width',
    sh_bustSize: 'Bust size', sh_bustLift: 'Bust height', sh_buttSize: 'Butt size', sh_shoulderThickness: 'Shoulder thickness',
    sh_upperArmThickness: 'Upper arm', sh_forearmThickness: 'Forearm', sh_handSize: 'Hand size',
    sh_thighThickness: 'Thighs', sh_calfThickness: 'Calves', sh_ankleThickness: 'Ankles',
    sh_faceSize: 'Face size', sh_lowerFaceWidth: 'Lower face width', sh_upperFaceHeight: 'Upper face height', sh_jawHeight: 'Jaw height',
    sh_chinWidth: 'Chin width', sh_chinDepth: 'Chin depth', sh_cheekUpper: 'Upper cheeks', sh_cheekLower: 'Lower cheeks',
    sh_eyeSize: 'Eye size', sh_eyeWidth: 'Eye width', sh_eyeOpen: 'Eye opening', sh_eyeSpacing: 'Eye spacing',
    sh_eyeHeight: 'Eye height', sh_eyeDepth: 'Eye depth', sh_eyeAngle: 'Eye angle', sh_browHeight: 'Brow height',
    sh_browAngle: 'Brow angle', sh_noseHeight: 'Nose height', sh_noseSize: 'Nose size', sh_noseLength: 'Nose length',
    sh_mouthHeight: 'Mouth height', sh_mouthWidth: 'Mouth width', sh_earSize: 'Ear size',

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
    illgamesInfo: '{game} character card{name}. ILLGAMES cards only hold settings for the game\'s character maker, not a 3D model. The studio will rebuild characters from these cards once it has its new base model; for now, export the character to PMX (for Koikatsu: the KKBP exporter) and open that file here.',
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
