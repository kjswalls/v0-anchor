const wp = require('web-push');
require('dotenv').config({ path: '.env.local' });

wp.setVapidDetails(
  'mailto:test@example.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// We will fetch the sub from supabase later
console.log('Ready to test when sub arrives');
