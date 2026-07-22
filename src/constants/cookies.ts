// Cookie names shared between client components and server (RSC) code. This module must NOT be
// "use client": a Server Component that imports a value from a client module receives a
// client-reference proxy, not the real value, so a cookie name defined in a client component would
// read back as a function on the server and silently break cookies().get(). Keep names dot-free too,
// since Next's server-side cookies().get() fails to look up a dotted cookie name.
export const NAV_PREF_COOKIE = "wd_nav_expanded";
