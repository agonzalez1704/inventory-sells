import type { MetadataRoute } from "next";

// Nothing here is meant to be crawled. The app behind /(app) needs a session
// anyway, and the two public routes are shared by link with a specific person:
// /tienda from a WhatsApp conversation, /cotizacion/<token> with the customer
// the quote belongs to.
//
// This exists for a second reason. /tienda is a catalogue with 21k products
// and a paginated URL space, so a crawler walking it is a crawler reading the
// database thousands of times over — that is what exhausted the egress quota.
// The page is far cheaper now, but a Disallow stops the traffic instead of
// making it affordable.
//
// Anything already indexed keeps its entry: a blocked page can't be re-read,
// so the noindex on /tienda never reaches the crawler. Use Search Console's
// removal tool if an old URL has to go now.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
