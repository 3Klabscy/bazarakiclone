// Daily at 03:17 UTC (05:17 / 06:17 in Cyprus, depending on daylight saving time).
// Scheduled functions are limited to 30 seconds, so this only starts the background import.
export default async (req, context) => {
  const secret = Netlify.env.get('IMPORT_SECRET');
  if (!secret || !Netlify.env.get('FEEDS')) {
    console.log('Feed import skipped: set FEEDS and IMPORT_SECRET to enable it');
    return;
  }
  const res = await fetch(new URL('/.netlify/functions/import-feeds-background', context.site.url), {
    method: 'POST',
    headers: { 'x-import-secret': secret },
  });
  console.log('Started feed import:', res.status);
};

export const config = { schedule: '17 3 * * *' };
