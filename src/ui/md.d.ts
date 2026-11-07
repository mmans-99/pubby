// Markdown files in src/content/ are bundled as plain text (build.mjs).
declare module '*.md' {
  const text: string;
  export default text;
}
