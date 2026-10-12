'use client'
import { createContext, useContext } from 'react'
const MemoryFeature = createContext(false)
export const useMemoryFeature = () => useContext(MemoryFeature)
export function MemoryFeatureProvider({enabled,children}:{enabled:boolean;children:React.ReactNode}) {
  return <MemoryFeature.Provider value={enabled}>{children}</MemoryFeature.Provider>
}
