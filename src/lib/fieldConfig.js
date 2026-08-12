import fieldsCatalog from '../fields/fields.json';

const DEFAULT_WIDTH_M = 16.541;
const DEFAULT_HEIGHT_M = 8.211;

export function getFieldsCatalog(league) {
  const fields = fieldsCatalog.fields ?? [];
  if (!league) return fields;
  return fields.filter(f => (f.league ?? 'frc') === league);
}

export function resolveField(fieldId, league) {
  const fields = fieldsCatalog.fields ?? [];
  const found = fields.find(f => f.id === fieldId);
  if (found && (!league || (found.league ?? 'frc') === league)) return found;
  return fields.find(f => f.id === getDefaultFieldId(league)) ?? fields[0] ?? null;
}

let activeField = resolveField(fieldsCatalog.defaultFieldId);

export function getActiveField() {
  return activeField;
}

export function setActiveField(fieldId, league) {
  activeField = resolveField(fieldId, league);
  return activeField;
}

export function getFieldBounds(field = activeField) {
  if (field?.originMode === 'center') {
    const hx = field.halfExtentX ?? (field.width ?? 144) / 2;
    const hy = field.halfExtentY ?? (field.height ?? 144) / 2;
    return { xMin: -hx, xMax: hx, yMin: -hy, yMax: hy, unit: field.unit ?? 'in' };
  }
  const widthM = field?.widthM ?? DEFAULT_WIDTH_M;
  const heightM = field?.heightM ?? DEFAULT_HEIGHT_M;
  return { xMin: 0, xMax: widthM, yMin: 0, yMax: heightM, unit: field?.unit ?? 'm' };
}

export function getFieldDimensions(field = activeField) {
  const bounds = getFieldBounds(field);
  return {
    widthM: bounds.xMax - bounds.xMin,
    heightM: bounds.yMax - bounds.yMin,
    width: bounds.xMax - bounds.xMin,
    height: bounds.yMax - bounds.yMin,
    unit: bounds.unit,
    bounds,
    originMode: field?.originMode ?? 'bottomLeft',
    halfExtentX: field?.halfExtentX,
    halfExtentY: field?.halfExtentY,
  };
}

export function getFieldImageUrl(field = activeField) {
  const base = import.meta.env.BASE_URL;
  if (!field) return `${base}fields/frc/rebuilt_2026.png`;
  if (field.imageUrl) return field.imageUrl;
  return `${base}fields/${field.imageFile}`;
}

export function computeFieldPadding(field = activeField) {
  if (!field?.imageWidth || !field?.originPixel || !field?.endPixel) {
    return { paddingX: 0.033, paddingY: 0.033 };
  }
  const { imageWidth, imageHeight, originPixel, endPixel } = field;
  const padLeft = originPixel.x / imageWidth;
  const padRight = (imageWidth - endPixel.x) / imageWidth;
  const padTop = endPixel.y / imageHeight;
  const padBottom = (imageHeight - originPixel.y) / imageHeight;
  return {
    paddingX: (padLeft + padRight) / 2,
    paddingY: (padTop + padBottom) / 2,
    paddingLeft: padLeft,
    paddingRight: padRight,
    paddingTop: padTop,
    paddingBottom: padBottom,
  };
}

export function getDefaultFieldId(league) {
  if (league === 'ftc') return fieldsCatalog.defaultFtcFieldId ?? 'decode_2026';
  return fieldsCatalog.defaultFieldId;
}
