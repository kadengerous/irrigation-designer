/** Never cache a missing module while CDN edges switch between releases. */
export default async function assetCache(
  event: { url: URL }, next: () => Promise<unknown>,
) {
  if (!event.url.pathname.startsWith('/assets/')) return next();
  try {
    const result = await next();
    if (result instanceof Response && result.status >= 400) {
      const headers = new Headers(result.headers);
      headers.set('cache-control', 'no-store');
      return new Response(result.body, {status:result.status,headers});
    }
    return result;
  } catch (error) {
    const status = (error as {status?:number;statusCode?:number})?.status ?? (error as {statusCode?:number})?.statusCode;
    if (status !== 404) throw error;
    return new Response('Module unavailable during update. Please reload.', {
      status:404, headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'},
    });
  }
}
