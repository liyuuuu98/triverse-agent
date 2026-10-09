/** Validate the JSON Schema vocabulary used by Triverse's current MCP contracts.
 * Unknown assertions fail closed instead of silently weakening paid approvals. */
export function validateSchema(value: unknown, schema: any, root=schema, location="arguments"): void {
  if (schema === true) return;
  if (schema === false) throw new Error(`${location} is forbidden`);
  if (schema.$ref) {
    if (!schema.$ref.startsWith("#/")) throw new Error("Only local schema references are supported");
    const target=schema.$ref.slice(2).split("/").reduce((node: any,key: string)=>node?.[key.replace(/~1/g,"/").replace(/~0/g,"~")],root);
    if (!target) throw new Error("Missing schema reference");
    validateSchema(value,target,root,location); return;
  }
  const known=new Set(["$schema","$id","$defs","definitions","title","description","default","examples","deprecated","readOnly","writeOnly","type","enum","const","anyOf","oneOf","allOf","properties","required","additionalProperties","items","minItems","maxItems","uniqueItems","minLength","maxLength","pattern","format","minimum","maximum","exclusiveMinimum","exclusiveMaximum","multipleOf"]);
  for (const key of Object.keys(schema)) if (!known.has(key)) throw new Error(`Unsupported MCP schema assertion: ${key}`);
  if (schema.allOf) for (const child of schema.allOf) validateSchema(value,child,root,location);
  if (schema.anyOf || schema.oneOf) {
    const valid=(schema.anyOf ?? schema.oneOf).filter((child: any)=>{ try { validateSchema(value,child,root,location); return true; } catch {return false;} }).length;
    if (valid === 0 || (schema.oneOf && valid !== 1)) throw new Error(`${location} does not match its schema`);
  }
  if (schema.enum && !schema.enum.some((item: unknown)=>JSON.stringify(item)===JSON.stringify(value))) throw new Error(`${location} is not an allowed value`);
  if ("const" in schema && JSON.stringify(schema.const)!==JSON.stringify(value)) throw new Error(`${location} differs from its required value`);
  const actual=value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const types=schema.type ? [schema.type].flat() : [];
  if (types.length && !types.some((type: string)=>type===actual || (type==="integer" && Number.isSafeInteger(value)))) throw new Error(`${location} has an invalid type`);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (schema.minimum!==undefined && value<schema.minimum) || (schema.maximum!==undefined && value>schema.maximum) || (schema.exclusiveMinimum!==undefined && value<=schema.exclusiveMinimum) || (schema.exclusiveMaximum!==undefined && value>=schema.exclusiveMaximum) || (schema.multipleOf!==undefined && Math.abs(value/schema.multipleOf-Math.round(value/schema.multipleOf))>1e-8)) throw new Error(`${location} is outside its allowed range`);
  }
  if (typeof value === "string") {
    if ((schema.minLength!==undefined && value.length<schema.minLength) || (schema.maxLength!==undefined && value.length>schema.maxLength) || (schema.pattern && !new RegExp(schema.pattern,"u").test(value))) throw new Error(`${location} has invalid length or pattern`);
    if (schema.format === "uuid" && !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) throw new Error(`${location} must be a UUID`);
    if (schema.format && schema.format !== "uuid") throw new Error(`Unsupported schema format ${schema.format}`);
  }
  if (Array.isArray(value)) {
    if ((schema.minItems!==undefined && value.length<schema.minItems) || (schema.maxItems!==undefined && value.length>schema.maxItems) || (schema.uniqueItems && new Set(value.map(item=>JSON.stringify(item))).size!==value.length)) throw new Error(`${location} has invalid items`);
    if (schema.items) value.forEach((item,index)=>validateSchema(item,schema.items,root,`${location}[${index}]`));
  } else if (value && typeof value === "object") {
    const record=value as Record<string,unknown>;
    for (const key of schema.required ?? []) if (!(key in record) || record[key] === undefined) throw new Error(`${location}.${key} is required`);
    for (const [key,item] of Object.entries(record)) {
      const property=schema.properties?.[key];
      if (property) validateSchema(item,property,root,`${location}.${key}`);
      else if (schema.additionalProperties === false) throw new Error(`${location}.${key} is unknown`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") validateSchema(item,schema.additionalProperties,root,`${location}.${key}`);
    }
  }
}
