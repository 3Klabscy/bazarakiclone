-- Replace the publicly known demo password and sign out any existing demo sessions.
UPDATE users SET password_hash = '29fbbff6e094640fbf7bbe8d1daedec7:63bf1cb678f113518a7fcf88383da347ed1e5a4c3d938c27e413b30c55992d1bd1b0626311db78eceaab0d1f48c73243fbe08e43d88cc2a2dbbafbd381233e36' WHERE email = 'demo@example.com';
DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = 'demo@example.com');
