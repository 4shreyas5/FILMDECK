// Minimal JSON Schema subset checker (no dependencies). Supported keywords:
// type (string|number|integer|boolean|object|array|null, or an array of these), enum, const, properties, required,
// additionalProperties (false only), items, minItems, maxItems, minLength, maxLength, pattern, minimum, maximum, uniqueItems.
// Anything else in a schema is ignored (descriptions, titles, $schema, $id).
const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
export function checkSchema(schema, value, path = '$', errors = []) {
  const t = typeOf(value);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = types.some(x => x === t || (x === 'integer' && t === 'number' && Number.isInteger(value)));
    if (!ok) { errors.push(`${path}: expected ${types.join('|')}, got ${t}`); return errors; }
  }
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some(e => JSON.stringify(e) === JSON.stringify(value))) errors.push(`${path}: must be one of ${schema.enum.join(', ')}`);
  if (t === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push(`${path}: longer than ${schema.maxLength} (${value.length})`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
  }
  if (t === 'number') {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${path}: below ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${path}: above ${schema.maximum}`);
  }
  if (t === 'array') {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${path}: needs at least ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${path}: allows at most ${schema.maxItems} items`);
    if (schema.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) errors.push(`${path}: items must be unique`);
    if (schema.items) value.forEach((v, i) => checkSchema(schema.items, v, `${path}[${i}]`, errors));
  }
  if (t === 'object') {
    for (const k of schema.required || []) if (!(k in value)) errors.push(`${path}: missing required "${k}"`);
    const props = schema.properties || {};
    for (const k of Object.keys(value)) {
      if (k in props) checkSchema(props[k], value[k], `${path}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}: unknown property "${k}"`);
    }
  }
  return errors;
}
