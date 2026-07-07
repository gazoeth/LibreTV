import { sha256 } from '../js/sha256.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  const response = await next();
  const contentType = response.headers.get("content-type") || "";
  
  if (contentType.includes("text/html")) {
    let html = await response.text();
    
    const password = env.PASSWORD || "";
    let passwordHash = "";
    if (password) {
      passwordHash = await sha256(password);
    }

    const country = (
      request.headers.get('x-vercel-ip-country')
      || request.headers.get('cf-ipcountry')
      || request.headers.get('x-country-code')
      || request.headers.get('x-country')
      || ""
    ).trim().toUpperCase();
    const region = (
      request.headers.get('x-vercel-ip-country-region')
      || request.headers.get('cf-region-code')
      || request.headers.get('x-region-code')
      || request.headers.get('x-region')
      || ""
    ).trim().toUpperCase();
    const geoSource = country ? 'ip' : '';
    html = html.replace('window.__ENV__.PASSWORD = "{{PASSWORD}}";', 
      [
        `window.__ENV__.PASSWORD = "${passwordHash}";`,
        `window.__ENV__.GEO_COUNTRY = "${country}";`,
        `window.__ENV__.GEO_REGION = "${region}";`,
        `window.__ENV__.GEO_SOURCE = "${geoSource}";`
      ].join('\n        '));
    
    return new Response(html, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  }
  
  return response;
}
