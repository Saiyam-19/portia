export function stripPrivateProviderData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripPrivateProviderData(item)) as T;
  }
  if (!value || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const safe = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "providerMetadata" && key !== "providerOptions")
      .map(([key, item]) => [key, stripPrivateProviderData(item)]),
  );
  return safe as T;
}
