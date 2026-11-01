// The one Node API the tests use, typed here since the project doesn't depend on @types/node.
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
}
