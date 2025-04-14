/**
 * Safely gets a nested value from an object using a path string
 * Example: getNestedValue(obj, 'user.profile.name')
 *
 * @param obj The object to get the value from
 * @param path The path to the value, using dot notation
 * @param defaultValue Optional default value if the path doesn't exist
 * @returns The value at the path, or defaultValue if not found
 */
export function getNestedValue<T = any>(
  obj: Record<string, any> | null | undefined,
  path: string,
  defaultValue?: T
): T {
  if (!obj || typeof obj !== "object") {
    return defaultValue as T;
  }

  const pathArray = path.split(".");
  let current: any = obj;

  for (const key of pathArray) {
    if (current === null || current === undefined || typeof current !== "object") {
      return defaultValue as T;
    }
    current = current[key];
  }

  return (current !== undefined ? current : defaultValue) as T;
}

/**
 * Checks if a value is empty (null, undefined, empty string, empty array, or empty object)
 *
 * @param value The value to check
 * @returns True if the value is empty, false otherwise
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string" && value.trim() === "") {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  if (typeof value === "object" && Object.keys(value as object).length === 0) {
    return true;
  }
  return false;
}

/**
 * Creates a fallback object by merging default values with provided values
 *
 * @param defaults The default values
 * @param values The provided values
 * @returns A merged object with fallbacks applied
 */
export function createWithFallbacks<T extends Record<string, any>>(
  defaults: T,
  values?: Partial<T>
): T {
  if (!values) {
    return { ...defaults };
  }

  return Object.keys(defaults).reduce((result, key) => {
    (result as Record<string, any>)[key] = !isEmpty(values[key]) ? values[key] : defaults[key];
    return result;
  }, { ...defaults }) as T;
}