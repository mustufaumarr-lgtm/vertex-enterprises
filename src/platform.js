// Which build is this? __WEB__ is set by build.mjs (true = Vercel/Supabase build).
/* global __WEB__ */
export const IS_WEB = typeof __WEB__ !== 'undefined' && __WEB__ === true;
export const SAVED_WHERE = IS_WEB ? 'your Vertex database' : 'your Claude account';
