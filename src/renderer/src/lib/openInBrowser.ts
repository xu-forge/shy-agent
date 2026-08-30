import { createContext, useContext } from 'react'

/** 在内置浏览器 Dock 打开 http(s) URL。未包 Provider 时为 no-op。 */
export const OpenInBrowserContext = createContext<(url: string) => void>(() => {})

export function useOpenInBrowser(): (url: string) => void {
  return useContext(OpenInBrowserContext)
}
