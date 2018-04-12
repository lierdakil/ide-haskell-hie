import {
  BaseLanguageClient,
  Convert,
  LanguageClientConnection,
  ActiveServer,
} from 'atom-languageclient'
import { TextBuffer, TextEditor, Emitter, Range } from 'atom'
import * as cp from 'child_process'
import * as t from 'vscode-languageserver-types'
import * as UPI from 'atom-haskell-upi'
import * as ac from 'atom/autocomplete-plus'
import AutocompleteAdapter from 'atom-languageclient/build/lib/adapters/autocomplete-adapter'
import ApplyEditAdapter from 'atom-languageclient/build/lib/adapters/apply-edit-adapter'
import NotificationsAdapter from 'atom-languageclient/build/lib/adapters/notifications-adapter'
import DocumentSyncAdapter from 'atom-languageclient/build/lib/adapters/document-sync-adapter'

export type ReportBusy = <T>(
  msg: string,
  promiseGen: () => Promise<T>,
) => Promise<T>

export class HieLanguageClient extends BaseLanguageClient {
  private autoComplete?: AutocompleteAdapter
  private _lastAutocompleteRequest?: ac.SuggestionsRequestedEvent
  private emitter: Emitter<
    {
      destroyed: void
    },
    {
      error: any[]
      warn: any[]
      info: any[]
      log: any[]
      debug: any[]
      messages: UPI.IResultItem[]
    }
  > = new Emitter()
  // private disp = new CompositeDisposable()
  private stderrBuf = ''
  private messages = new Map<string, UPI.IResultItem[]>()
  private reportBusy?: ReportBusy

  constructor() {
    super()
    this.activate()
  }

  public onError(cb: (args: any[]) => void) {
    return this.emitter.on('error', cb)
  }

  public onWarning(cb: (args: any[]) => void) {
    return this.emitter.on('warn', cb)
  }

  public async getType(
    buffer: TextBuffer,
    range: Range,
  ): Promise<{ type: string; range: Range }> {
    const filePath = buffer.getPath()
    if (filePath === undefined) throw new Error('No editor URI')
    const res = await this.executeCommand(buffer, 'ghcmod:type', {
      file: Convert.pathToUri(filePath),
      include_constraints: true,
      pos: Convert.atomRangeToLSRange(range).start,
    })
    for (const [r, t] of res) {
      const rr = Convert.lsRangeToAtomRange(r)
      if (rr.containsRange(range)) return { type: t, range: rr }
    }
    throw new Error('No type found')
  }

  public async getInfo(buffer: TextBuffer, symbol: string) {
    const filePath = buffer.getPath()
    if (filePath === undefined) throw new Error('No editor URI')
    const res = await this.executeCommand(buffer, 'ghcmod:info', {
      file: Convert.pathToUri(filePath),
      expr: symbol,
    })
    return res
  }

  public async restart() {
    return this.restartAllServers()
  }

  public async deactivate() {
    const res = super.deactivate()
    this.emitter.emit('destroyed')
    this.emitter.dispose()
    return res
  }

  public onDidDestroy(cb: () => void) {
    return this.emitter.on('destroyed', cb)
  }

  public onMessages(cb: (msgs: UPI.IResultItem[]) => void) {
    return this.emitter.on('messages', cb)
  }

  public getMessages(): ReadonlyArray<Readonly<UPI.IResultItem>> {
    return flattenOne(this.messages.values())
  }

  public setReportBusy(f: ReportBusy) {
    this.reportBusy = f
  }

  // Autocomplete+ via LS completion---------------------------------------
  public provideAutocomplete(): ac.AutocompleteProvider {
    return {
      selector: this.getGrammarScopes()
        .map((g) => (g.includes('.') ? '.' + g : g))
        .join(', '),
      inclusionPriority: 1,
      suggestionPriority: 2,
      excludeLowerPriority: false,
      getSuggestions: this.getSuggestions.bind(this),
      getSuggestionDetailsOnSelect: this.getSuggestionDetailsOnSelect.bind(
        this,
      ),
    }
  }

  protected async getSuggestions(
    request: ac.SuggestionsRequestedEvent,
  ): Promise<ac.Suggestions> {
    const server = await this._serverManager.getServer(request.editor)
    if (server === null || !AutocompleteAdapter.canAdapt(server.capabilities)) {
      return []
    }

    this.autoComplete = this.autoComplete || new AutocompleteAdapter()
    this._lastAutocompleteRequest = request
    return this.autoComplete.getSuggestions(
      server,
      request,
      undefined,
      atom.config.get('autocomplete-plus.minimumWordLength'),
    ) as Promise<ac.Suggestions>
  }

  protected async getSuggestionDetailsOnSelect(
    suggestion: ac.TextSuggestion | ac.SnippetSuggestion,
  ): Promise<ac.TextSuggestion | ac.SnippetSuggestion | null> {
    const request = this._lastAutocompleteRequest
    if (!request) {
      // tslint:disable-next-line:no-null-keyword
      return null
    }
    const server = await this._serverManager.getServer(request.editor)
    if (
      !server ||
      !AutocompleteAdapter.canResolve(server.capabilities) ||
      !this.autoComplete
    ) {
      // tslint:disable-next-line:no-null-keyword
      return null
    }

    return this.autoComplete.completeSuggestion(
      server,
      suggestion,
      request,
    ) as Promise<ac.TextSuggestion | ac.SnippetSuggestion | null>
  }

  protected preInitialization(conn: LanguageClientConnection) {
    super.preInitialization(conn)
    conn.onPublishDiagnostics((params) => {
      const filePath = Convert.uriToPath(params.uri)
      this.messages.set(
        params.uri,
        diagnosticsToResultItems(filePath, params.diagnostics),
      )
      this.emitter.emit('messages', flattenOne(this.messages.values()))
    })
  }

  protected getLogger() {
    return {
      warn: (...args: any[]) => {
        console.warn(...args)
        this.emitter.emit('warn', args)
      },
      error: (...args: any[]) => {
        console.error(...args)
        this.emitter.emit('error', args)
      },
      info: (...args: any[]) => {
        console.info(...args)
        this.emitter.emit('info', args)
      },
      log: (...args: any[]) => {
        console.log(...args)
        this.emitter.emit('log', args)
      },
      debug: (...args: any[]) => {
        console.debug(...args)
        this.emitter.emit('debug', args)
      },
    }
  }

  protected getGrammarScopes() {
    return ['source.haskell']
  }
  protected getLanguageName() {
    return 'Haskell'
  }
  protected getServerName() {
    return 'haskell-ide-engine'
  }

  protected startServerProcess(projectPath: string) {
    // TODO: builder selection
    // TODO: hide debug under flag
    return cp.spawn(
      'stack',
      [
        'exec',
        '--',
        atom.config.get('ide-haskell-hie.hiePath'),
        '--lsp',
        '--debug',
      ],
      { cwd: projectPath },
    )
  }

  protected handleServerStderr(stderr: string, projectPath: string) {
    const [first, ...lines] = stderr.split('\n')
    this.stderrBuf += first
    if (lines.length > 0) {
      this.logger.warn(`stderr[${projectPath}]: ${this.stderrBuf}`)
      lines.slice(0, -1).forEach((x) => {
        this.logger.warn(`stderr[${projectPath}]: ${x}`)
      })
      this.stderrBuf = lines[lines.length - 1]
    }
  }

  protected startExclusiveAdapters(server: ActiveServer): void {
    ApplyEditAdapter.attach(server.connection)
    NotificationsAdapter.attach(
      server.connection,
      this.name,
      server.projectPath,
    )

    if (DocumentSyncAdapter.canAdapt(server.capabilities)) {
      server.disposable.add(
        new DocumentSyncAdapter(
          server.connection,
          (editor) => this.shouldSyncForEditor(editor, server.projectPath),
          server.capabilities.textDocumentSync,
          this.reportBusyWhile.bind(this),
        ),
      )
    }
  }

  protected async reportBusyWhile<T>(
    message: string,
    promiseGenerator: () => Promise<T>,
  ): Promise<T> {
    if (this.reportBusy) {
      return this.reportBusy(message, promiseGenerator)
    } else {
      this.logger.info(message)
      return promiseGenerator()
    }
  }

  private async executeCommand(
    buffer: TextBuffer,
    command: 'ghcmod:type',
    args: {
      include_constraints: boolean
      file: string
      pos: t.Position
    },
  ): Promise<[t.Range, string][]>
  private async executeCommand(
    buffer: TextBuffer,
    command: 'ghcmod:info',
    args: {
      file: string
      expr: string
    },
  ): Promise<string>
  private async executeCommand(
    buffer: TextBuffer,
    command: string,
    ...args: any[]
  ) {
    const conn = await this.getConnectionForBuffer(buffer)
    return conn.executeCommand({
      command,
      arguments: args,
    })
  }
  private async getConnectionForBuffer(buffer: TextBuffer) {
    const conn = await this.getConnectionForEditor(editorForBuffer(buffer))
    if (!conn) throw new Error('No HIE connection')
    return conn
  }
}

function editorForBuffer(buffer: TextBuffer): TextEditor {
  const editor = atom.workspace
    .getTextEditors()
    .find((ed) => ed.getBuffer() === buffer)
  if (!editor) {
    throw new Error(
      `No editor for a buffer ${buffer.getId()} with path ${buffer.getPath()}`,
    )
  }
  return editor
}

function severityLSToUPI(severity?: t.DiagnosticSeverity): UPI.TSeverity {
  switch (severity) {
    case 1:
      return 'error'
    case 2:
      return 'warning'
    case 3:
      return 'lint'
    case 4:
      return 'lint'
    default:
      return 'HIE'
  }
}

function diagnosticsToResultItems(
  filePath: string,
  ds: t.Diagnostic[],
): UPI.IResultItem[] {
  return ds.map((x): UPI.IResultItem => ({
    message: x.message,
    uri: filePath,
    context: x.source,
    severity: severityLSToUPI(x.severity),
    position: Convert.lsRangeToAtomRange(x.range).start,
  }))
}

function flattenOne<T>(arr: IterableIterator<T[]>): T[] {
  return ([] as T[]).concat(...arr)
}
