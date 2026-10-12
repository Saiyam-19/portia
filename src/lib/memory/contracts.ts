export type MemoryFact = { key: string; value: string; sources: string[] };
export type MemoryOperation =
  | { kind: "remember"; key: string; value: string; source: string }
  | { kind: "forget"; key: string }
  | { kind: "delete_source"; source: string }
  | { kind: "clear" };
export type MemoryState = {
  epoch: number; revision: number; pending: boolean; blocked: boolean;
  image: string | null; scratchpad: string; scratchpadRevision: number;
};
export type MemoryClaim = {
  token: string; fence: number; epoch: number; baseRevision: number; through: number;
  image: string | null; operations: MemoryOperation[];
};
