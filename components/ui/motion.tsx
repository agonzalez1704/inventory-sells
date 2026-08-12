"use client";

import { LazyMotion, MotionConfig } from "framer-motion";
import type * as React from "react";

/**
 * Framer, loaded off the critical path.
 *
 * The register is opened on a shop phone over 4G, and the full `motion` import
 * is ~34KB gzipped in the first chunk — paid before the till can ring anything
 * up. LazyMotion ships a ~5KB shim and fetches the feature bundle after the
 * screen is interactive, so the animations arrive a beat late instead of the
 * screen arriving late.
 *
 * `domMax` rather than `domAnimation` because the cart uses layout animations:
 * when a line is removed the ones below it slide up instead of jumping.
 *
 * Components under this must use `m.div`, not `motion.div` — `strict` turns the
 * mistake into an error rather than silently pulling the whole library back in.
 */
const cargarFeatures = () => import("framer-motion").then((m) => m.domMax);

export function Motion({ children }: { children: React.ReactNode }) {
  return (
    // reducedMotion="user" honours the OS setting. Someone who has asked their
    // phone to stop moving things has asked this screen too.
    <MotionConfig reducedMotion="user">
      <LazyMotion features={cargarFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
