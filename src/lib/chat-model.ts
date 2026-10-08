export type ChatModel = 'model-1' | 'model-2'

export function isChatModel(value: unknown): value is ChatModel {
  return value === 'model-1' || value === 'model-2'
}
