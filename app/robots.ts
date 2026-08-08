import type { MetadataRoute } from "next";
import { urlBase } from "@/lib/url";

// The storefront is meant to be found. Everything else is not: /(app) needs a
// session, and /cotizacion/<token> is shared with the one customer whose quote
// it is — a quote has no business turning up in a search result.
//
// The query strings are blocked deliberately, and it is the whole point of
// this file. /tienda takes marca, cat, cal and page, which multiply into a URL
// space with no natural end: every combination is a distinct page, each one a
// database read, and a crawler will happily walk all of them. That is the
// shape of the traffic that emptied the egress quota. Products are reachable
// through the sitemap by their own path instead, so blocking the filters costs
// no coverage.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/tienda", "/tienda/"],
        // "/*?" matches any URL carrying a query string. Order-independent,
        // which matters: ?cat=x&page=2 and ?page=2&cat=x are the same trap.
        disallow: ["/", "/*?"],
      },
    ],
    sitemap: `${urlBase()}/sitemap.xml`,
  };
}
