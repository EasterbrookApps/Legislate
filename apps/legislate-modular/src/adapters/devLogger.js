export function attachDevLogger(bus) {
  const enabled = new URL(location.href).searchParams.get('debug') === '1';
  if (!enabled) return;
  bus.on('*', (type, payload) => {
    // eslint-disable-next-line no-console
    console.log('[EVENT]', type, payload);
  });
}
