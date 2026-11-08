interface ImportMeta {
  glob: (
    pattern: string,
    options: { eager: true; query: "?raw"; import: "default" },
  ) => Record<string, string>;
}
