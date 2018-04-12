import { HieLanguageClient } from './hie'
import { CompositeDisposable } from 'atom'
import { UPIConsumer } from './upi-consumer'
import * as UPI from 'atom-haskell-upi'

let process: HieLanguageClient | undefined
let disposables: CompositeDisposable | undefined
let tempDisposables: CompositeDisposable | undefined

export { config } from './config'

export function activate(_state: never) {
  process = new HieLanguageClient()
  disposables = new CompositeDisposable()
  tempDisposables = new CompositeDisposable()
  disposables.add(tempDisposables)

  tempDisposables.add(
    process.onError((args: any[]) => {
      console.error(...args)
      atom.notifications.addError('HIE warning', {
        detail: args.map((x) => x.toString()).join('; '),
      })
    }),
    process.onWarning((args: any[]) => {
      console.warn(...args)
      atom.notifications.addWarning('HIE warning', {
        detail: args.map((x) => x.toString()).join('; '),
      })
    }),
  )

  disposables.add(
    atom.commands.add('atom-workspace', {
      'ide-haskell-hie:restart-backend': () => process && process.restart(),
    }),
  )
}

export function deactivate() {
  process && process.deactivate()
  process = undefined
  disposables && disposables.dispose()
  disposables = undefined
  tempDisposables = undefined
}

export function consumeUPI(service: UPI.IUPIRegistration) {
  if (!process || !disposables) {
    return undefined
  }
  tempDisposables && tempDisposables.dispose()
  tempDisposables = undefined
  const upiConsumer = new UPIConsumer(service, process)
  disposables.add(upiConsumer)
  return upiConsumer
}

export function autocompleteProvider_2_0_0() {
  if (!process) return undefined
  return process.provideAutocomplete()
}
