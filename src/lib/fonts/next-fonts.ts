import type { CSSProperties } from "react";
import localFont from "next/font/local";
import { sharedFontCssVariables } from "./registry";

// Editor chrome faces are bundled so startup never depends on a Google Fonts
// response: a malformed css2 answer cached by the Google font loader once failed the
// root layout and returned 500 for every route. Both files are the OFL-licensed
// latin subsets from Google Fonts; licenses sit beside them in ./files.
const dmSans = localFont({
  src: "./files/dm-sans-latin-variable.woff2",
  weight: "100 1000",
  variable: "--font-ui",
  fallback: ["Arial", "sans-serif"],
});
const libreCaslonDisplay = localFont({
  src: "./files/libre-caslon-display-latin-400.woff2",
  weight: "400",
  variable: "--font-display",
  fallback: ["Georgia", "serif"],
});

const BUNDLED_FONT_VARIABLES = new Set(["--font-ui", "--font-display"]);

/** Caption and title faces resolve by family name; the runtime Google Fonts loader supplies them. */
const runtimeFontVariables = Object.fromEntries(
  Object.entries(sharedFontCssVariables()).filter(([variable]) => !BUNDLED_FONT_VARIABLES.has(variable)),
);

export const timelineFontVariablesClassName = [dmSans.variable, libreCaslonDisplay.variable].join(" ");
export const timelineFontVariablesStyle = runtimeFontVariables as CSSProperties;
