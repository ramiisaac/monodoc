/**
 * Deep merge utility function that recursively merges objects
 * @param target The target object to merge into
 * @param source The source object to merge from
 * @returns A new object with merged properties
 */
export function deepMerge(target: any, source: any): any {
  // Handle null/undefined cases
  if (source === null || source === undefined) {
    return source;
  }
  
  if (target === null || target === undefined) {
    return source;
  }

  // Handle primitive types
  if (typeof source !== "object" || typeof target !== "object") {
    return source;
  }

  // Handle arrays - replace entirely
  if (Array.isArray(source)) {
    return [...source];
  }

  // Handle objects
  const result: any = {};
  
  // Copy all properties from target
  for (const key in target) {
    if (target.hasOwnProperty(key)) {
      result[key] = target[key];
    }
  }

  // Merge/override with source properties
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (
        result[key] &&
        typeof result[key] === "object" &&
        typeof source[key] === "object" &&
        !Array.isArray(result[key]) &&
        !Array.isArray(source[key])
      ) {
        // Recursively merge nested objects
        result[key] = deepMerge(result[key], source[key]);
      } else {
        // Override primitive values or arrays
        result[key] = source[key];
      }
    }
  }

  return result;
}