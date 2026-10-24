/** Escapes user- or source-supplied text before it is placed in Markdown. */
export const safe = (value: string) => value.replace(/\\/g, "\\\\").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/([|`*_[\]#!])/g, "\\$1").replace(/[\n\r]+/g, " ");
