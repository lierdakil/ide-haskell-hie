import {
  CommandEvent,
  CompositeDisposable,
  Range,
  TextEditor,
  TextEditorElement,
} from 'atom'
import { HieLanguageClient } from './hie'
// import { importListView } from './views/import-list-view'
import * as Util from './util'
import * as UPI from 'atom-haskell-upi'
const { handleException } = Util

const messageTypes = {
  error: {},
  warning: {},
  lint: {},
}

const addMsgTypes = {
  HIE: {
    uriFilter: false,
    autoScroll: true,
  },
}

const contextScope = 'atom-text-editor[data-grammar~="haskell"]'

const mainMenu = {
  label: 'HIE',
  menu: [
    { label: 'Check', command: 'ide-haskell-hie:check-file' },
    { label: 'Lint', command: 'ide-haskell-hie:lint-file' },
    { label: 'Stop Backend', command: 'ide-haskell-hie:shutdown-backend' },
  ],
}

type TECommandEvent = CommandEvent<TextEditorElement>

export class UPIConsumer {
  public upi: UPI.IUPIInstance
  private disposables: CompositeDisposable = new CompositeDisposable()
  private processMessages: UPI.IResultItem[] = []
  private msgBackend = atom.config.get('ide-haskell-hie.ghcModMessages')

  private contextCommands = {
    'ide-haskell-hie:show-type': this.tooltipCommand(
      this.typeTooltip.bind(this),
    ),
    'ide-haskell-hie:show-info': this.tooltipCommand(
      this.infoTooltip.bind(this),
    ),
    // 'ide-haskell-hie:case-split': this.caseSplitCommand.bind(this),
    // 'ide-haskell-hie:sig-fill': this.sigFillCommand.bind(this),
    // 'ide-haskell-hie:go-to-declaration': this.goToDeclCommand.bind(this),
    'ide-haskell-hie:show-info-fallback-to-type': this.tooltipCommand(
      this.infoTypeTooltip.bind(this),
    ),
    'ide-haskell-hie:show-type-fallback-to-info': this.tooltipCommand(
      this.typeInfoTooltip.bind(this),
    ),
    'ide-haskell-hie:show-type-and-info': this.tooltipCommand(
      this.typeAndInfoTooltip.bind(this),
    ),
    'ide-haskell-hie:insert-type': this.insertTypeCommand.bind(this),
    // 'ide-haskell-hie:insert-import': this.insertImportCommand.bind(this),
  }

  private globalCommands = {
    // 'ide-haskell-hie:check-file': this.checkCommand.bind(this),
    // 'ide-haskell-hie:lint-file': this.lintCommand.bind(this),
    ...this.contextCommands,
  }

  private contextMenu: {
    label: string
    submenu: Array<{
      label: string
      command: keyof UPIConsumer['contextCommands']
    }>
  } = {
    label: 'ghc-mod',
    submenu: [
      { label: 'Show Type', command: 'ide-haskell-hie:show-type' },
      { label: 'Show Info', command: 'ide-haskell-hie:show-info' },
      {
        label: 'Show Type And Info',
        command: 'ide-haskell-hie:show-type-and-info',
      },
      // { label: 'Case Split', command: 'ide-haskell-hie:case-split' },
      // { label: 'Sig Fill', command: 'ide-haskell-hie:sig-fill' },
      { label: 'Insert Type', command: 'ide-haskell-hie:insert-type' },
      // { label: 'Insert Import', command: 'ide-haskell-hie:insert-import' },
      // {
      //   label: 'Go To Declaration',
      //   command: 'ide-haskell-hie:go-to-declaration',
      // },
    ],
  }

  constructor(
    register: UPI.IUPIRegistration,
    private process: HieLanguageClient,
  ) {
    this.disposables.add(
      this.process.onError(this.handleProcessError.bind(this)),
      this.process.onWarning(this.handleProcessWarning.bind(this)),
    )

    const msgTypes =
      this.msgBackend === 'upi'
        ? { ...messageTypes, ...addMsgTypes }
        : messageTypes

    this.upi = register({
      name: 'haskell-ide-engine',
      menu: mainMenu,
      messageTypes: msgTypes,
      tooltip: this.shouldShowTooltip.bind(this),
    })

    this.process.setReportBusy(async (title, f) => {
      this.upi.setStatus({ status: 'progress', detail: title })
      try {
        try {
          return await f()
        } finally {
          this.upi.setStatus({ status: 'ready', detail: '' })
        }
      } catch (e) {
        this.upi.setStatus({ status: 'error', detail: e.toString() })
        throw e
      }
    })

    this.disposables.add(
      this.upi,
      this.process.onMessages(this.sendMessages.bind(this)),
      atom.commands.add(contextScope, this.globalCommands),
    )
    const cm = {}
    cm[contextScope] = [this.contextMenu]
    this.disposables.add(atom.contextMenu.add(cm))
    // send out messages we already gathered
    this.sendMessages(this.process.getMessages())
  }

  public dispose() {
    this.disposables.dispose()
  }

  private async shouldShowTooltip(
    editor: TextEditor,
    crange: Range,
    type: UPI.TEventRangeType,
  ): Promise<UPI.ITooltipData | undefined> {
    const n =
      type === 'mouse'
        ? 'ide-haskell-hie.onMouseHoverShow'
        : type === 'selection'
          ? 'ide-haskell-hie.onSelectionShow'
          : undefined
    const t = n && atom.config.get(n)
    try {
      if (t) return await this[`${t}Tooltip`](editor, crange)
      else return undefined
    } catch (e) {
      Util.warn(e)
      return undefined
    }
  }

  private tooltipCommand(
    tooltipfun: (e: TextEditor, p: Range) => Promise<UPI.ITooltipData>,
  ) {
    return async ({ currentTarget, detail }: TECommandEvent) =>
      this.upi.showTooltip({
        editor: currentTarget.getModel(),
        detail: detail as Object,
        async tooltip(crange) {
          return tooltipfun(currentTarget.getModel(), crange)
        },
      })
  }

  @handleException
  private async insertTypeCommand({ currentTarget, detail }: TECommandEvent) {
    const editor = currentTarget.getModel()
    const er = this.upi.getEventRange(editor, detail as Object)
    if (er === undefined) {
      return
    }
    const { crange, pos } = er
    const symInfo = Util.getSymbolAtPoint(editor, pos)
    if (!symInfo) {
      return
    }
    const { scope, range, symbol } = symInfo
    if (scope.startsWith('keyword.operator.')) {
      return
    } // can't correctly handle infix notation
    const { type } = await this.process.getType(editor.getBuffer(), crange)
    if (
      editor
        .getTextInBufferRange([
          range.end,
          editor.getBuffer().rangeForRow(range.end.row, false).end,
        ])
        .match(/=/)
    ) {
      let indent = editor.getTextInBufferRange([
        [range.start.row, 0],
        range.start,
      ])
      let birdTrack = ''
      if (
        editor
          .scopeDescriptorForBufferPosition(pos)
          .getScopesArray()
          .includes('meta.embedded.haskell')
      ) {
        birdTrack = indent.slice(0, 2)
        indent = indent.slice(2)
      }
      if (indent.match(/\S/)) {
        indent = indent.replace(/\S/g, ' ')
      }
      editor.setTextInBufferRange(
        [range.start, range.start],
        `${symbol} :: ${type}\n${birdTrack}${indent}`,
      )
    } else {
      editor.setTextInBufferRange(
        range,
        `(${editor.getTextInBufferRange(range)} :: ${type})`,
      )
    }
  }

  // @handleException
  // private async caseSplitCommand({ currentTarget, detail }: TECommandEvent) {
  //   const editor = currentTarget.getModel()
  //   const evr = this.upi.getEventRange(editor, detail)
  //   if (!evr) {
  //     return
  //   }
  //   const { crange } = evr
  //   const res = await this.process.doCaseSplit(editor.getBuffer(), crange)
  //   for (const { range, replacement } of res) {
  //     editor.setTextInBufferRange(range, replacement)
  //   }
  // }

  // @handleException
  // private async sigFillCommand({ currentTarget, detail }: TECommandEvent) {
  //   const editor = currentTarget.getModel()
  //   const evr = this.upi.getEventRange(editor, detail)
  //   if (!evr) {
  //     return
  //   }
  //   const { crange } = evr
  //   const res = await this.process.doSigFill(editor.getBuffer(), crange)
  //
  //   editor.transact(() => {
  //     const { type, range, body } = res
  //     const sig = editor.getTextInBufferRange(range)
  //     let indent = editor.indentLevelForLine(sig)
  //     const pos = range.end
  //     const text = `\n${body}`
  //     if (type === 'instance') {
  //       indent += 1
  //       if (!sig.endsWith(' where')) {
  //         editor.setTextInBufferRange([range.end, range.end], ' where')
  //       }
  //     }
  //     const newrange = editor.setTextInBufferRange([pos, pos], text)
  //     newrange
  //       .getRows()
  //       .slice(1)
  //       .map((row) => editor.setIndentationForBufferRow(row, indent))
  //   })
  // }

  // @handleException
  // private async goToDeclCommand({ currentTarget, detail }: TECommandEvent) {
  //   const editor = currentTarget.getModel()
  //   const evr = this.upi.getEventRange(editor, detail)
  //   if (!evr) {
  //     return
  //   }
  //   const { crange } = evr
  //   const { info } = await this.process.getInfoInBuffer(editor, crange)
  //   const res = /.*-- Defined at (.+):(\d+):(\d+)/.exec(info)
  //   if (!res) {
  //     return
  //   }
  //   const [fn, line, col] = res.slice(1)
  //   const rootDir = await this.process.getRootDir(editor.getBuffer())
  //   if (!rootDir) {
  //     return
  //   }
  //   const uri = rootDir.getFile(fn).getPath() || fn
  //   await atom.workspace.open(uri, {
  //     initialLine: parseInt(line, 10) - 1,
  //     initialColumn: parseInt(col, 10) - 1,
  //   })
  // }

  // @handleException
  // private async insertImportCommand({ currentTarget, detail }: TECommandEvent) {
  //   const editor = currentTarget.getModel()
  //   const buffer = editor.getBuffer()
  //   const evr = this.upi.getEventRange(editor, detail)
  //   if (!evr) {
  //     return
  //   }
  //   const { crange } = evr
  //   const lines = await this.process.findSymbolProvidersInBuffer(editor, crange)
  //   const mod = await importListView(lines)
  //   if (mod) {
  //     const pi = await new Promise<{ pos: Point; indent: string; end: string }>(
  //       (resolve) => {
  //         buffer.backwardsScan(/^(\s*)(import|module)/, ({ match, range }) => {
  //           let indent = ''
  //           switch (match[2]) {
  //             case 'import':
  //               indent = `\n${match[1]}`
  //               break
  //             case 'module':
  //               indent = `\n\n${match[1]}`
  //               break
  //           }
  //           resolve({
  //             pos: buffer.rangeForRow(range.start.row, false).end,
  //             indent,
  //             end: '',
  //           })
  //         })
  //         // nothing found
  //         resolve({
  //           pos: buffer.getFirstPosition(),
  //           indent: '',
  //           end: '\n',
  //         })
  //       },
  //     )
  //     editor.setTextInBufferRange(
  //       [pi.pos, pi.pos],
  //       `${pi.indent}import ${mod}${pi.end}`,
  //     )
  //   }
  // }

  private async typeTooltip(e: TextEditor, p: Range) {
    const { range, type } = await this.process.getType(e.getBuffer(), p)
    return {
      range,
      text: {
        text: type,
        highlighter: atom.config.get('ide-haskell-hie.highlightTooltips')
          ? 'hint.type.haskell'
          : undefined,
      },
    }
  }

  private async infoTooltip(e: TextEditor, p: Range) {
    const symInfo = Util.getSymbolInRange(e, p)
    if (!symInfo) {
      throw new Error("Couldn't get symbol for info")
    }
    const { symbol, range } = symInfo
    const info = await this.process.getInfo(e.getBuffer(), symbol)
    return {
      range,
      text: {
        text: info,
        highlighter: atom.config.get('ide-haskell-hie.highlightTooltips')
          ? 'source.haskell'
          : undefined,
      },
    }
  }

  private async infoTypeTooltip(e: TextEditor, p: Range) {
    try {
      return await this.infoTooltip(e, p)
    } catch {
      return this.typeTooltip(e, p)
    }
  }

  private async typeInfoTooltip(e: TextEditor, p: Range) {
    try {
      return await this.typeTooltip(e, p)
    } catch {
      return this.infoTooltip(e, p)
    }
  }

  private async typeAndInfoTooltip(e: TextEditor, p: Range) {
    const typeP = this.typeTooltip(e, p).catch(() => undefined)
    const infoP = this.infoTooltip(e, p).catch(() => undefined)
    const [type, info] = await Promise.all([typeP, infoP])
    let range: Range
    let text: string
    if (type && info) {
      range = type.range.union(info.range)
      const sup = atom.config.get(
        'ide-haskell-hie.suppressRedundantTypeInTypeAndInfoTooltips',
      )
      if (sup && info.text.text.includes(`:: ${type.text.text}`)) {
        text = info.text.text
      } else {
        text = `:: ${type.text.text}\n${info.text.text}`
      }
    } else if (type) {
      range = type.range
      text = `:: ${type.text.text}`
    } else if (info) {
      range = info.range
      text = info.text.text
    } else {
      throw new Error('Got neither type nor info')
    }
    const highlighter = atom.config.get('ide-haskell-hie.highlightTooltips')
      ? 'source.haskell'
      : undefined
    return { range, text: { text, highlighter } }
  }

  private setHighlighter() {
    if (atom.config.get('ide-haskell-hie.highlightMessages')) {
      return (m: UPI.IResultItem): UPI.IResultItem => {
        if (typeof m.message === 'string') {
          const message: UPI.IMessageText = {
            text: m.message,
            highlighter: 'hint.message.haskell',
          }
          return { ...m, message }
        } else {
          return m
        }
      }
    } else {
      return (m: UPI.IResultItem) => m
    }
  }

  private consoleReport(arg: any[]) {
    // tslint:disbale-next-line: no-console
    console.error(...arg)
  }

  private handleProcessError(arg: any[]) {
    switch (this.msgBackend) {
      case 'upi':
        this.processMessages.push({
          message:
            `HIE reported an error: ${arg
              .map((x) => x.toString())
              .join('; ')}` +
            '\n\nSee console (View → Developer → Toggle Developer Tools → Console tab) for details.',
          severity: 'HIE',
        })
        this.consoleReport(arg)
        this.sendMessages(this.process.getMessages())
        break
      case 'console':
        this.consoleReport(arg)
        break
      case 'popup':
        this.consoleReport(arg)
        atom.notifications.addError('HIE reported an error', {
          detail:
            arg.map((x) => x.toString()).join('; ') +
            '\n\nSee console (View → Developer → Toggle Developer Tools → Console tab) for details.',
          dismissable: true,
        })
        break
    }
  }

  private handleProcessWarning(arg: any[]) {
    switch (this.msgBackend) {
      case 'upi':
        this.processMessages.push({
          message:
            `HIE reported a warning: ${arg
              .map((x) => x.toString())
              .join('; ')}` +
            '\n\nSee console (View → Developer → Toggle Developer Tools → Console tab) for details.',
          severity: 'HIE',
        })
        Util.warn(...arg)
        this.sendMessages(this.process.getMessages())
        break
      case 'console':
        Util.warn(...arg)
        break
      case 'popup':
        Util.warn(...arg)
        atom.notifications.addWarning('HIE reported a warning', {
          detail:
            arg.map((x) => x.toString()).join('; ') +
            '\n\nSee console (View → Developer → Toggle Developer Tools → Console tab) for details.',
          dismissable: false,
        })
        break
    }
  }

  private sendMessages(msgs: ReadonlyArray<Readonly<UPI.IResultItem>>) {
    this.upi.setMessages(
      this.processMessages.concat(msgs.map(this.setHighlighter())),
    )
  }
}
