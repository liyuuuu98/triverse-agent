export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && specifier.endsWith(".js")) {
    try {
      return await nextResolve(specifier.replace(/\.js$/, ".ts"), context);
    } catch {
      // The compiled specifier is used when no TypeScript source sits beside it.
    }
  }
  return nextResolve(specifier, context);
}
