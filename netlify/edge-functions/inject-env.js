// Netlify Edge Function to inject environment variables into HTML
export default async (request, context) => {
  const url = new URL(request.url);
  
  // Only process HTML pages
  const isHtmlPage = url.pathname.endsWith('.html') || url.pathname === '/';
  if (!isHtmlPage) {
    return; // Let the request pass through unchanged
  }

  // Get the original response
  const response = await context.next();
  
  // Check if it's an HTML response
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response; // Return the original response if not HTML
  }

  // Get the HTML content
  const originalHtml = await response.text();
  
  // Simple SHA-256 implementation for Netlify Edge Functions
  async function sha256(message) {
    const msgUint8 = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  const password = Netlify.env.get('PASSWORD') || '';
  let passwordHash = '';
  if (password) {
    passwordHash = await sha256(password);
  }

  const country = (
    request.headers.get('x-nf-country')
    || request.headers.get('x-country-code')
    || request.headers.get('cf-ipcountry')
    || ''
  ).trim().toUpperCase();
  const region = (
    request.headers.get('x-nf-subdivision-code')
    || request.headers.get('x-region-code')
    || ''
  ).trim().toUpperCase();
  const geoSource = country ? 'ip' : '';
  
  const modifiedHtml = originalHtml.replace(
    'window.__ENV__.PASSWORD = "{{PASSWORD}}";',
    [
      `window.__ENV__.PASSWORD = "${passwordHash}";`,
      `window.__ENV__.GEO_COUNTRY = "${country}";`,
      `window.__ENV__.GEO_REGION = "${region}";`,
      `window.__ENV__.GEO_SOURCE = "${geoSource}";`
    ].join('\n        ')
  );
  
  // Create a new response with the modified HTML
  return new Response(modifiedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
};

export const config = {
  path: ["/*"]
};
