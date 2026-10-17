const HEX = /^#[0-9a-fA-F]{6}$/;
const FRAMES = ['none', 'polaroid', 'stamp'];
const between = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
function validateThemes(themes = []) {
  if (!Array.isArray(themes) || themes.length > 30) throw new Error('저장한 테마는 최대 30개입니다.');
  const ids = new Set();
  return themes.map(t => {
    if (!t || typeof t.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(t.id) || ids.has(t.id) || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 60 || !['light', 'dark'].includes(t.mode) || !['classic', 'paper', 'glass'].includes(t.layout)) throw new Error('테마 형식이 올바르지 않습니다.');
    ids.add(t.id);
    for (const key of ['background', 'panel', 'text', 'accent', 'line']) if (typeof t[key] !== 'string' || !HEX.test(t[key])) throw new Error('테마 색상이 올바르지 않습니다.');
    if (!['none', 'paper'].includes(t.texture) || !between(t.textureStrength, 0, 100) || !FRAMES.includes(t.defaultFrame) || !between(t.radius, 0, 24) || !between(t.opacity, 0, 100) || typeof t.fontFamily !== 'string' || t.fontFamily.length > 200 || /[\x00-\x1f]/.test(t.fontFamily) || !Number.isInteger(t.fontSize) || !between(t.fontSize, 8, 48) || !between(t.lineWidth, 0, 6) || !Number.isInteger(t.lineWidth * 2)) throw new Error('테마 표시 설정이 올바르지 않습니다.');
    return Object.fromEntries(['id','name','mode','layout','background','panel','text','accent','line','texture','textureStrength','defaultFrame','radius','opacity','fontFamily','fontSize','lineWidth'].map(key => [key, key === 'name' ? t[key].trim() : t[key]]));
  });
}
function validatePhotoStyle(p) {
  if (p.frame !== undefined && !FRAMES.includes(p.frame)) throw new Error('사진 프레임이 올바르지 않습니다.');
  const position = p.placement;
  if (position !== undefined && (!position || !between(position.x, 0, 100) || !between(position.y, 0, 100) || !between(position.rotation, -30, 30))) throw new Error('사진 위치가 올바르지 않습니다.');
  return { ...(p.frame !== undefined ? { frame: p.frame } : {}), ...(position ? { placement: { x: position.x, y: position.y, rotation: position.rotation } } : {}) };
}
module.exports = { validateThemes, validatePhotoStyle };
