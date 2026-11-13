const STRINGS = {
  vi: {
    openFolder: 'Mở thư mục model', openFolderHint: 'Chọn thư mục chứa model và texture',
    openFiles: 'Mở file', openCard: 'Mở card', exportCard: 'Xuất card',
    cardInfo: 'Thông tin card', name: 'Tên', author: 'Tác giả model', license: 'Điều khoản sử dụng',
    source: 'Nguồn', notes: 'Ghi chú', adjust: 'Chỉnh model', scale: 'Kích thước',
    colors: 'Màu theo material', colorsHint: 'Nhân màu cho từng phần (da, tóc, mắt...). Mod áp dụng đúng các màu này.',
    expressions: 'Biểu cảm (xem trước)', noExpressions: 'Model không có biểu cảm.',
    dropTitle: 'Kéo thả thư mục model hoặc card vào đây', dropFormats: 'PMX · PMD · VRM · GLB · glTF · card PNG',
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
    openFolder: 'Open model folder', openFolderHint: 'Pick the folder that holds the model and its textures',
    openFiles: 'Open files', openCard: 'Open card', exportCard: 'Export card',
    cardInfo: 'Card details', name: 'Name', author: 'Model author', license: 'Terms of use',
    source: 'Source', notes: 'Notes', adjust: 'Adjust model', scale: 'Size',
    colors: 'Colour per material', colorsHint: 'Tint each part (skin, hair, eyes…). The mod applies the same tints.',
    expressions: 'Expressions (preview)', noExpressions: 'This model has no expressions.',
    dropTitle: 'Drop a model folder or a card here', dropFormats: 'PMX · PMD · VRM · GLB · glTF · PNG card',
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
  return navigator.language?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
})();

export const currentLanguage = () => language;

export function setLanguage(value) {
  if (!STRINGS[value]) return;
  language = value;
  try { localStorage.setItem('studio.language', value); } catch { /* storage unavailable */ }
}

export function t(key) {
  return STRINGS[language][key] ?? STRINGS.en[key] ?? key;
}

export function applyTranslations(root = document) {
  document.documentElement.lang = language;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}
