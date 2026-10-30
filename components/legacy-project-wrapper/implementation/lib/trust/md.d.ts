// Markdown files import as their text (next.config.ts turbopack rule "*.md": raw).
declare module "*.md" {
  const text: string;
  export default text;
}
