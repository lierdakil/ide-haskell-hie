import { Range, Point, TextEditor } from 'atom'
import * as CP from 'child_process'
import { EOL } from 'os'
import { getRootDirFallback, getRootDir, isDirectory } from 'atom-haskell-utils'
import * as UPI from 'atom-haskell-upi'

type ExecOpts = CP.ExecFileOptionsWithStringEncoding
export { getRootDirFallback, getRootDir, isDirectory, ExecOpts }

let debuglog: Array<{ timestamp: number; messages: string[] }> = []
const logKeep = 30000 // ms

function savelog(...messages: string[]) {
  const ts = Date.now()
  debuglog.push({
    timestamp: ts,
    messages,
  })
  let ks = 0
  for (const v of debuglog) {
    if (ts - v.timestamp >= logKeep) {
      break
    }
    ks++
  }
  debuglog.splice(0, ks)
}

export function debug(...messages: any[]) {
  if (atom.config.get('haskell-ghc-mod.debug')) {
    // tslint:disable-next-line: no-console
    console.log('haskell-ghc-mod debug:', ...messages)
  }
  savelog(...messages.map((v) => JSON.stringify(v)))
}

export function warn(...messages: any[]) {
  // tslint:disable-next-line: no-console
  console.warn('haskell-ghc-mod warning:', ...messages)
  savelog(...messages.map((v) => JSON.stringify(v)))
}

export function error(...messages: any[]) {
  // tslint:disable-next-line: no-console
  console.error('haskell-ghc-mod error:', ...messages)
  savelog(...messages.map((v) => JSON.stringify(v)))
}

export function getDebugLog() {
  const ts = Date.now()
  debuglog = debuglog.filter(({ timestamp }) => ts - timestamp < logKeep)
  return debuglog
    .map(
      ({ timestamp, messages }) =>
        `${(timestamp - ts) / 1000}s: ${messages.join(',')}`,
    )
    .join(EOL)
}

export function getSymbolAtPoint(editor: TextEditor, point: Point) {
  const [scope] = editor
    .scopeDescriptorForBufferPosition(point)
    .getScopesArray()
    .slice(-1)
  if (scope) {
    const range = editor.bufferRangeForScopeAtPosition(scope, point)
    if (range && !range.isEmpty()) {
      const symbol = editor.getTextInBufferRange(range)
      return { scope, range, symbol }
    }
  }
  return undefined
}

export function getSymbolInRange(editor: TextEditor, crange: Range) {
  const buffer = editor.getBuffer()
  if (crange.isEmpty()) {
    return getSymbolAtPoint(editor, crange.start)
  } else {
    return {
      symbol: buffer.getTextInRange(crange),
      range: crange,
    }
  }
}

export function handleException<T>(
  _target: { upi: UPI.IUPIInstance | Promise<UPI.IUPIInstance> },
  _key: string,
  desc: TypedPropertyDescriptor<(...args: any[]) => Promise<T>>,
): TypedPropertyDescriptor<(...args: any[]) => Promise<T>> {
  return {
    ...desc,
    async value(...args: any[]) {
      try {
        // tslint:disable-next-line: no-non-null-assertion
        return await desc.value!.call(this, ...args)
      } catch (e) {
        debug(e)
        const upi: UPI.IUPIInstance = await (this as any).upi
        upi.setStatus({
          status: 'warning',
          detail: e.toString(),
        })
        // TODO: returning a promise that never resolves... ugly, but works?
        return new Promise(() => {
          /* noop */
        })
      }
    },
  }
}
