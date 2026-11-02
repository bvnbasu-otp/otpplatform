export async function applyIntakeDraftResultForCurrentScope<T>(
  result: Promise<T>,
  scopeKeyRef: { current: string | null },
  expectedScopeKey: string | null,
  apply: (value: T) => void,
): Promise<boolean> {
  const value = await result;
  if (scopeKeyRef.current !== expectedScopeKey) return false;
  apply(value);
  return true;
}
