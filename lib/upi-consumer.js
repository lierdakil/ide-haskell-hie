"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const atom_1 = require("atom");
const Util = require("./util");
const { handleException } = Util;
const messageTypes = {
    error: {},
    warning: {},
    lint: {},
};
const addMsgTypes = {
    HIE: {
        uriFilter: false,
        autoScroll: true,
    },
};
const contextScope = 'atom-text-editor[data-grammar~="haskell"]';
const mainMenu = {
    label: 'HIE',
    menu: [
        { label: 'Check', command: 'ide-haskell-hie:check-file' },
        { label: 'Lint', command: 'ide-haskell-hie:lint-file' },
        { label: 'Stop Backend', command: 'ide-haskell-hie:shutdown-backend' },
    ],
};
class UPIConsumer {
    constructor(register, process) {
        this.process = process;
        this.disposables = new atom_1.CompositeDisposable();
        this.processMessages = [];
        this.msgBackend = atom.config.get('ide-haskell-hie.ghcModMessages');
        this.contextCommands = {
            'ide-haskell-hie:show-type': this.tooltipCommand(this.typeTooltip.bind(this)),
            'ide-haskell-hie:show-info': this.tooltipCommand(this.infoTooltip.bind(this)),
            'ide-haskell-hie:show-info-fallback-to-type': this.tooltipCommand(this.infoTypeTooltip.bind(this)),
            'ide-haskell-hie:show-type-fallback-to-info': this.tooltipCommand(this.typeInfoTooltip.bind(this)),
            'ide-haskell-hie:show-type-and-info': this.tooltipCommand(this.typeAndInfoTooltip.bind(this)),
            'ide-haskell-hie:insert-type': this.insertTypeCommand.bind(this),
        };
        this.globalCommands = Object.assign({}, this.contextCommands);
        this.contextMenu = {
            label: 'ghc-mod',
            submenu: [
                { label: 'Show Type', command: 'ide-haskell-hie:show-type' },
                { label: 'Show Info', command: 'ide-haskell-hie:show-info' },
                {
                    label: 'Show Type And Info',
                    command: 'ide-haskell-hie:show-type-and-info',
                },
                { label: 'Insert Type', command: 'ide-haskell-hie:insert-type' },
            ],
        };
        this.disposables.add(this.process.onError(this.handleProcessError.bind(this)), this.process.onWarning(this.handleProcessWarning.bind(this)));
        const msgTypes = this.msgBackend === 'upi'
            ? Object.assign({}, messageTypes, addMsgTypes) : messageTypes;
        this.upi = register({
            name: 'haskell-ide-engine',
            menu: mainMenu,
            messageTypes: msgTypes,
            tooltip: this.shouldShowTooltip.bind(this),
        });
        this.process.setReportBusy(async (title, f) => {
            this.upi.setStatus({ status: 'progress', detail: title });
            try {
                try {
                    return await f();
                }
                finally {
                    this.upi.setStatus({ status: 'ready', detail: '' });
                }
            }
            catch (e) {
                this.upi.setStatus({ status: 'error', detail: e.toString() });
                throw e;
            }
        });
        this.disposables.add(this.upi, this.process.onMessages(this.sendMessages.bind(this)), atom.commands.add(contextScope, this.globalCommands));
        const cm = {};
        cm[contextScope] = [this.contextMenu];
        this.disposables.add(atom.contextMenu.add(cm));
        this.sendMessages(this.process.getMessages());
    }
    dispose() {
        this.disposables.dispose();
    }
    async shouldShowTooltip(editor, crange, type) {
        const n = type === 'mouse'
            ? 'ide-haskell-hie.onMouseHoverShow'
            : type === 'selection'
                ? 'ide-haskell-hie.onSelectionShow'
                : undefined;
        const t = n && atom.config.get(n);
        try {
            if (t)
                return await this[`${t}Tooltip`](editor, crange);
            else
                return undefined;
        }
        catch (e) {
            Util.warn(e);
            return undefined;
        }
    }
    tooltipCommand(tooltipfun) {
        return async ({ currentTarget, detail }) => this.upi.showTooltip({
            editor: currentTarget.getModel(),
            detail: detail,
            async tooltip(crange) {
                return tooltipfun(currentTarget.getModel(), crange);
            },
        });
    }
    async insertTypeCommand({ currentTarget, detail }) {
        const editor = currentTarget.getModel();
        const er = this.upi.getEventRange(editor, detail);
        if (er === undefined) {
            return;
        }
        const { crange, pos } = er;
        const symInfo = Util.getSymbolAtPoint(editor, pos);
        if (!symInfo) {
            return;
        }
        const { scope, range, symbol } = symInfo;
        if (scope.startsWith('keyword.operator.')) {
            return;
        }
        const { type } = await this.process.getType(editor.getBuffer(), crange);
        if (editor
            .getTextInBufferRange([
            range.end,
            editor.getBuffer().rangeForRow(range.end.row, false).end,
        ])
            .match(/=/)) {
            let indent = editor.getTextInBufferRange([
                [range.start.row, 0],
                range.start,
            ]);
            let birdTrack = '';
            if (editor
                .scopeDescriptorForBufferPosition(pos)
                .getScopesArray()
                .includes('meta.embedded.haskell')) {
                birdTrack = indent.slice(0, 2);
                indent = indent.slice(2);
            }
            if (indent.match(/\S/)) {
                indent = indent.replace(/\S/g, ' ');
            }
            editor.setTextInBufferRange([range.start, range.start], `${symbol} :: ${type}\n${birdTrack}${indent}`);
        }
        else {
            editor.setTextInBufferRange(range, `(${editor.getTextInBufferRange(range)} :: ${type})`);
        }
    }
    async typeTooltip(e, p) {
        const { range, type } = await this.process.getType(e.getBuffer(), p);
        return {
            range,
            text: {
                text: type,
                highlighter: atom.config.get('ide-haskell-hie.highlightTooltips')
                    ? 'hint.type.haskell'
                    : undefined,
            },
        };
    }
    async infoTooltip(e, p) {
        const symInfo = Util.getSymbolInRange(e, p);
        if (!symInfo) {
            throw new Error("Couldn't get symbol for info");
        }
        const { symbol, range } = symInfo;
        const info = await this.process.getInfo(e.getBuffer(), symbol);
        return {
            range,
            text: {
                text: info,
                highlighter: atom.config.get('ide-haskell-hie.highlightTooltips')
                    ? 'source.haskell'
                    : undefined,
            },
        };
    }
    async infoTypeTooltip(e, p) {
        try {
            return await this.infoTooltip(e, p);
        }
        catch (_a) {
            return this.typeTooltip(e, p);
        }
    }
    async typeInfoTooltip(e, p) {
        try {
            return await this.typeTooltip(e, p);
        }
        catch (_a) {
            return this.infoTooltip(e, p);
        }
    }
    async typeAndInfoTooltip(e, p) {
        const typeP = this.typeTooltip(e, p).catch(() => undefined);
        const infoP = this.infoTooltip(e, p).catch(() => undefined);
        const [type, info] = await Promise.all([typeP, infoP]);
        let range;
        let text;
        if (type && info) {
            range = type.range.union(info.range);
            const sup = atom.config.get('ide-haskell-hie.suppressRedundantTypeInTypeAndInfoTooltips');
            if (sup && info.text.text.includes(`:: ${type.text.text}`)) {
                text = info.text.text;
            }
            else {
                text = `:: ${type.text.text}\n${info.text.text}`;
            }
        }
        else if (type) {
            range = type.range;
            text = `:: ${type.text.text}`;
        }
        else if (info) {
            range = info.range;
            text = info.text.text;
        }
        else {
            throw new Error('Got neither type nor info');
        }
        const highlighter = atom.config.get('ide-haskell-hie.highlightTooltips')
            ? 'source.haskell'
            : undefined;
        return { range, text: { text, highlighter } };
    }
    setHighlighter() {
        if (atom.config.get('ide-haskell-hie.highlightMessages')) {
            return (m) => {
                if (typeof m.message === 'string') {
                    const message = {
                        text: m.message,
                        highlighter: 'hint.message.haskell',
                    };
                    return Object.assign({}, m, { message });
                }
                else {
                    return m;
                }
            };
        }
        else {
            return (m) => m;
        }
    }
    consoleReport(arg) {
        console.error(...arg);
    }
    handleProcessError(arg) {
        switch (this.msgBackend) {
            case 'upi':
                this.processMessages.push({
                    message: `HIE reported an error: ${arg
                        .map((x) => x.toString())
                        .join('; ')}` +
                        '\n\nSee console (View → Developer → Toggle Developer Tools → Console tab) for details.',
                    severity: 'HIE',
                });
                this.consoleReport(arg);
                this.sendMessages(this.process.getMessages());
                break;
            case 'console':
                this.consoleReport(arg);
                break;
            case 'popup':
                this.consoleReport(arg);
                atom.notifications.addError('HIE reported an error', {
                    detail: arg.map((x) => x.toString()).join('; ') +
                        '\n\nSee console (View → Developer → Toggle Developer Tools → Console tab) for details.',
                    dismissable: true,
                });
                break;
        }
    }
    handleProcessWarning(arg) {
        switch (this.msgBackend) {
            case 'upi':
                this.processMessages.push({
                    message: `HIE reported a warning: ${arg
                        .map((x) => x.toString())
                        .join('; ')}` +
                        '\n\nSee console (View → Developer → Toggle Developer Tools → Console tab) for details.',
                    severity: 'HIE',
                });
                Util.warn(...arg);
                this.sendMessages(this.process.getMessages());
                break;
            case 'console':
                Util.warn(...arg);
                break;
            case 'popup':
                Util.warn(...arg);
                atom.notifications.addWarning('HIE reported a warning', {
                    detail: arg.map((x) => x.toString()).join('; ') +
                        '\n\nSee console (View → Developer → Toggle Developer Tools → Console tab) for details.',
                    dismissable: false,
                });
                break;
        }
    }
    sendMessages(msgs) {
        this.upi.setMessages(this.processMessages.concat(msgs.map(this.setHighlighter())));
    }
}
tslib_1.__decorate([
    handleException,
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Promise)
], UPIConsumer.prototype, "insertTypeCommand", null);
exports.UPIConsumer = UPIConsumer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBpLWNvbnN1bWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3VwaS1jb25zdW1lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSwrQkFNYTtBQUdiLCtCQUE4QjtBQUU5QixNQUFNLEVBQUUsZUFBZSxFQUFFLEdBQUcsSUFBSSxDQUFBO0FBRWhDLE1BQU0sWUFBWSxHQUFHO0lBQ25CLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFLEVBQUU7SUFDWCxJQUFJLEVBQUUsRUFBRTtDQUNULENBQUE7QUFFRCxNQUFNLFdBQVcsR0FBRztJQUNsQixHQUFHLEVBQUU7UUFDSCxTQUFTLEVBQUUsS0FBSztRQUNoQixVQUFVLEVBQUUsSUFBSTtLQUNqQjtDQUNGLENBQUE7QUFFRCxNQUFNLFlBQVksR0FBRywyQ0FBMkMsQ0FBQTtBQUVoRSxNQUFNLFFBQVEsR0FBRztJQUNmLEtBQUssRUFBRSxLQUFLO0lBQ1osSUFBSSxFQUFFO1FBQ0osRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRTtRQUN6RCxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLDJCQUEyQixFQUFFO1FBQ3ZELEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsa0NBQWtDLEVBQUU7S0FDdkU7Q0FDRixDQUFBO0FBSUQ7SUE2REUsWUFDRSxRQUE4QixFQUN0QixPQUEwQjtRQUExQixZQUFPLEdBQVAsT0FBTyxDQUFtQjtRQTdENUIsZ0JBQVcsR0FBd0IsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVELG9CQUFlLEdBQXNCLEVBQUUsQ0FBQTtRQUN2QyxlQUFVLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLENBQUMsQ0FBQTtRQUU5RCxvQkFBZSxHQUFHO1lBQ3hCLDJCQUEyQixFQUFFLElBQUksQ0FBQyxjQUFjLENBQzlDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFB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QUU7b0JBQ3RELE1BQU0sRUFDSixHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO3dCQUN2Qyx3RkFBd0Y7b0JBQzFGLFdBQVcsRUFBRSxLQUFLO2lCQUNuQixDQUFDLENBQUE7Z0JBQ0YsTUFBSztTQUNSO0lBQ0gsQ0FBQztJQUVPLFlBQVksQ0FBQyxJQUE4QztRQUNqRSxJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FDbEIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUM3RCxDQUFBO0lBQ0gsQ0FBQztDQUNGO0FBM1VDO0lBREMsZUFBZTs7OztvREFvRGY7QUF0TUgsa0NBOGRDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgQ29tbWFuZEV2ZW50LFxuICBDb21wb3NpdGVEaXNwb3NhYmxlLFxuICBSYW5nZSxcbiAgVGV4dEVkaXRvcixcbiAgVGV4dEVkaXRvckVsZW1lbnQsXG59IGZyb20gJ2F0b20nXG5pbXBvcnQgeyBIaWVMYW5ndWFnZUNsaWVudCB9IGZyb20gJy4vaGllJ1xuLy8gaW1wb3J0IHsgaW1wb3J0TGlzdFZpZXcgfSBmcm9tICcuL3ZpZXdzL2ltcG9ydC1saXN0LXZpZXcnXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4vdXRpbCdcbmltcG9ydCAqIGFzIFVQSSBmcm9tICdhdG9tLWhhc2tlbGwtdXBpJ1xuY29uc3QgeyBoYW5kbGVFeGNlcHRpb24gfSA9IFV0aWxcblxuY29uc3QgbWVzc2FnZVR5cGVzID0ge1xuICBlcnJvcjoge30sXG4gIHdhcm5pbmc6IHt9LFxuICBsaW50OiB7fSxcbn1cblxuY29uc3QgYWRkTXNnVHlwZXMgPSB7XG4gIEhJRToge1xuICAgIHVyaUZpbHRlcjogZmFsc2UsXG4gICAgYXV0b1Njcm9sbDogdHJ1ZSxcbiAgfSxcbn1cblxuY29uc3QgY29udGV4dFNjb3BlID0gJ2F0b20tdGV4dC1lZGl0b3JbZGF0YS1ncmFtbWFyfj1cImhhc2tlbGxcIl0nXG5cbmNvbnN0IG1haW5NZW51ID0ge1xuICBsYWJlbDogJ0hJRScsXG4gIG1lbnU6IFtcbiAgICB7IGxhYmVsOiAnQ2hlY2snLCBjb21tYW5kOiAnaWRlLWhhc2tlbGwtaGllOmNoZWNrLWZpbGUnIH0sXG4gICAgeyBsYWJlbDogJ0xpbnQnLCBjb21tYW5kOiAnaWRlLWhhc2tlbGwtaGllOmxpbnQtZmlsZScgfSxcbiAgICB7IGxhYmVsOiAnU3RvcCBCYWNrZW5kJywgY29tbWFuZDogJ2lkZS1oYXNrZWxsLWhpZTpzaHV0ZG93bi1iYWNrZW5kJyB9LFxuICBdLFxufVxuXG50eXBlIFRFQ29tbWFuZEV2ZW50ID0gQ29tbWFuZEV2ZW50PFRleHRFZGl0b3JFbGVtZW50PlxuXG5leHBvcnQgY2xhc3MgVVBJQ29uc3VtZXIge1xuICBwdWJsaWMgdXBpOiBVUEkuSVVQSUluc3RhbmNlXG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGUgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gIHByaXZhdGUgcHJvY2Vzc01lc3NhZ2VzOiBVUEkuSVJlc3VsdEl0ZW1bXSA9IFtdXG4gIHByaXZhdGUgbXNnQmFja2VuZCA9IGF0b20uY29uZmlnLmdldCgnaWRlLWhhc2tlbGwtaGllLmdoY01vZE1lc3NhZ2VzJylcblxuICBwcml2YXRlIGNvbnRleHRDb21tYW5kcyA9IHtcbiAgICAnaWRlLWhhc2tlbGwtaGllOnNob3ctdHlwZSc6IHRoaXMudG9vbHRpcENvbW1hbmQoXG4gICAgICB0aGlzLnR5cGVUb29sdGlwLmJpbmQodGhpcyksXG4gICAgKSxcbiAgICAnaWRlLWhhc2tlbGwtaGllOnNob3ctaW5mbyc6IHRoaXMudG9vbHRpcENvbW1hbmQoXG4gICAgICB0aGlzLmluZm9Ub29sdGlwLmJpbmQodGhpcyksXG4gICAgKSxcbiAgICAvLyAnaWRlLWhhc2tlbGwtaGllOmNhc2Utc3BsaXQnOiB0aGlzLmNhc2VTcGxpdENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAvLyAnaWRlLWhhc2tlbGwtaGllOnNpZy1maWxsJzogdGhpcy5zaWdGaWxsQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgIC8vICdpZGUtaGFza2VsbC1oaWU6Z28tdG8tZGVjbGFyYXRpb24nOiB0aGlzLmdvVG9EZWNsQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdpZGUtaGFza2VsbC1oaWU6c2hvdy1pbmZvLWZhbGxiYWNrLXRvLXR5cGUnOiB0aGlzLnRvb2x0aXBDb21tYW5kKFxuICAgICAgdGhpcy5pbmZvVHlwZVRvb2x0aXAuYmluZCh0aGlzKSxcbiAgICApLFxuICAgICdpZGUtaGFza2VsbC1oaWU6c2hvdy10eXBlLWZhbGxiYWNrLXRvLWluZm8nOiB0aGlzLnRvb2x0aXBDb21tYW5kKFxuICAgICAgdGhpcy50eXBlSW5mb1Rvb2x0aXAuYmluZCh0aGlzKSxcbiAgICApLFxuICAgICdpZGUtaGFza2VsbC1oaWU6c2hvdy10eXBlLWFuZC1pbmZvJzogdGhpcy50b29sdGlwQ29tbWFuZChcbiAgICAgIHRoaXMudHlwZUFuZEluZm9Ub29sdGlwLmJpbmQodGhpcyksXG4gICAgKSxcbiAgICAnaWRlLWhhc2tlbGwtaGllOmluc2VydC10eXBlJzogdGhpcy5pbnNlcnRUeXBlQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgIC8vICdpZGUtaGFza2VsbC1oaWU6aW5zZXJ0LWltcG9ydCc6IHRoaXMuaW5zZXJ0SW1wb3J0Q29tbWFuZC5iaW5kKHRoaXMpLFxuICB9XG5cbiAgcHJpdmF0ZSBnbG9iYWxDb21tYW5kcyA9IHtcbiAgICAvLyAnaWRlLWhhc2tlbGwtaGllOmNoZWNrLWZpbGUnOiB0aGlzLmNoZWNrQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgIC8vICdpZGUtaGFza2VsbC1oaWU6bGludC1maWxlJzogdGhpcy5saW50Q29tbWFuZC5iaW5kKHRoaXMpLFxuICAgIC4uLnRoaXMuY29udGV4dENvbW1hbmRzLFxuICB9XG5cbiAgcHJpdmF0ZSBjb250ZXh0TWVudToge1xuICAgIGxhYmVsOiBzdHJpbmdcbiAgICBzdWJtZW51OiBBcnJheTx7XG4gICAgICBsYWJlbDogc3RyaW5nXG4gICAgICBjb21tYW5kOiBrZXlvZiBVUElDb25zdW1lclsnY29udGV4dENvbW1hbmRzJ11cbiAgICB9PlxuICB9ID0ge1xuICAgIGxhYmVsOiAnZ2hjLW1vZCcsXG4gICAgc3VibWVudTogW1xuICAgICAgeyBsYWJlbDogJ1Nob3cgVHlwZScsIGNvbW1hbmQ6ICdpZGUtaGFza2VsbC1oaWU6c2hvdy10eXBlJyB9LFxuICAgICAgeyBsYWJlbDogJ1Nob3cgSW5mbycsIGNvbW1hbmQ6ICdpZGUtaGFza2VsbC1oaWU6c2hvdy1pbmZvJyB9LFxuICAgICAge1xuICAgICAgICBsYWJlbDogJ1Nob3cgVHlwZSBBbmQgSW5mbycsXG4gICAgICAgIGNvbW1hbmQ6ICdpZGUtaGFza2VsbC1oaWU6c2hvdy10eXBlLWFuZC1pbmZvJyxcbiAgICAgIH0sXG4gICAgICAvLyB7IGxhYmVsOiAnQ2FzZSBTcGxpdCcsIGNvbW1hbmQ6ICdpZGUtaGFza2VsbC1oaWU6Y2FzZS1zcGxpdCcgfSxcbiAgICAgIC8vIHsgbGFiZWw6ICdTaWcgRmlsbCcsIGNvbW1hbmQ6ICdpZGUtaGFza2VsbC1oaWU6c2lnLWZpbGwnIH0sXG4gICAgICB7IGxhYmVsOiAnSW5zZXJ0IFR5cGUnLCBjb21tYW5kOiAnaWRlLWhhc2tlbGwtaGllOmluc2VydC10eXBlJyB9LFxuICAgICAgLy8geyBsYWJlbDogJ0luc2VydCBJbXBvcnQnLCBjb21tYW5kOiAnaWRlLWhhc2tlbGwtaGllOmluc2VydC1pbXBvcnQnIH0sXG4gICAgICAvLyB7XG4gICAgICAvLyAgIGxhYmVsOiAnR28gVG8gRGVjbGFyYXRpb24nLFxuICAgICAgLy8gICBjb21tYW5kOiAnaWRlLWhhc2tlbGwtaGllOmdvLXRvLWRlY2xhcmF0aW9uJyxcbiAgICAgIC8vIH0sXG4gICAgXSxcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHJlZ2lzdGVyOiBVUEkuSVVQSVJlZ2lzdHJhdGlvbixcbiAgICBwcml2YXRlIHByb2Nlc3M6IEhpZUxhbmd1YWdlQ2xpZW50LFxuICApIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIHRoaXMucHJvY2Vzcy5vbkVycm9yKHRoaXMuaGFuZGxlUHJvY2Vzc0Vycm9yLmJpbmQodGhpcykpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uV2FybmluZyh0aGlzLmhhbmRsZVByb2Nlc3NXYXJuaW5nLmJpbmQodGhpcykpLFxuICAgIClcblxuICAgIGNvbnN0IG1zZ1R5cGVzID1cbiAgICAgIHRoaXMubXNnQmFja2VuZCA9PT0gJ3VwaSdcbiAgICAgICAgPyB7IC4uLm1lc3NhZ2VUeXBlcywgLi4uYWRkTXNnVHlwZXMgfVxuICAgICAgICA6IG1lc3NhZ2VUeXBlc1xuXG4gICAgdGhpcy51cGkgPSByZWdpc3Rlcih7XG4gICAgICBuYW1lOiAnaGFza2VsbC1pZGUtZW5naW5lJyxcbiAgICAgIG1lbnU6IG1haW5NZW51LFxuICAgICAgbWVzc2FnZVR5cGVzOiBtc2dUeXBlcyxcbiAgICAgIHRvb2x0aXA6IHRoaXMuc2hvdWxkU2hvd1Rvb2x0aXAuYmluZCh0aGlzKSxcbiAgICB9KVxuXG4gICAgdGhpcy5wcm9jZXNzLnNldFJlcG9ydEJ1c3koYXN5bmMgKHRpdGxlLCBmKSA9PiB7XG4gICAgICB0aGlzLnVwaS5zZXRTdGF0dXMoeyBzdGF0dXM6ICdwcm9ncmVzcycsIGRldGFpbDogdGl0bGUgfSlcbiAgICAgIHRyeSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIGF3YWl0IGYoKVxuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgIHRoaXMudXBpLnNldFN0YXR1cyh7IHN0YXR1czogJ3JlYWR5JywgZGV0YWlsOiAnJyB9KVxuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHRoaXMudXBpLnNldFN0YXR1cyh7IHN0YXR1czogJ2Vycm9yJywgZGV0YWlsOiBlLnRvU3RyaW5nKCkgfSlcbiAgICAgICAgdGhyb3cgZVxuICAgICAgfVxuICAgIH0pXG5cbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIHRoaXMudXBpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uTWVzc2FnZXModGhpcy5zZW5kTWVzc2FnZXMuYmluZCh0aGlzKSksXG4gICAgICBhdG9tLmNvbW1hbmRzLmFkZChjb250ZXh0U2NvcGUsIHRoaXMuZ2xvYmFsQ29tbWFuZHMpLFxuICAgIClcbiAgICBjb25zdCBjbSA9IHt9XG4gICAgY21bY29udGV4dFNjb3BlXSA9IFt0aGlzLmNvbnRleHRNZW51XVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKGF0b20uY29udGV4dE1lbnUuYWRkKGNtKSlcbiAgICAvLyBzZW5kIG91dCBtZXNzYWdlcyB3ZSBhbHJlYWR5IGdhdGhlcmVkXG4gICAgdGhpcy5zZW5kTWVzc2FnZXModGhpcy5wcm9jZXNzLmdldE1lc3NhZ2VzKCkpXG4gIH1cblxuICBwdWJsaWMgZGlzcG9zZSgpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzaG91bGRTaG93VG9vbHRpcChcbiAgICBlZGl0b3I6IFRleHRFZGl0b3IsXG4gICAgY3JhbmdlOiBSYW5nZSxcbiAgICB0eXBlOiBVUEkuVEV2ZW50UmFuZ2VUeXBlLFxuICApOiBQcm9taXNlPFVQSS5JVG9vbHRpcERhdGEgfCB1bmRlZmluZWQ+IHtcbiAgICBjb25zdCBuID1cbiAgICAgIHR5cGUgPT09ICdtb3VzZSdcbiAgICAgICAgPyAnaWRlLWhhc2tlbGwtaGllLm9uTW91c2VIb3ZlclNob3cnXG4gICAgICAgIDogdHlwZSA9PT0gJ3NlbGVjdGlvbidcbiAgICAgICAgICA/ICdpZGUtaGFza2VsbC1oaWUub25TZWxlY3Rpb25TaG93J1xuICAgICAgICAgIDogdW5kZWZpbmVkXG4gICAgY29uc3QgdCA9IG4gJiYgYXRvbS5jb25maWcuZ2V0KG4pXG4gICAgdHJ5IHtcbiAgICAgIGlmICh0KSByZXR1cm4gYXdhaXQgdGhpc1tgJHt0fVRvb2x0aXBgXShlZGl0b3IsIGNyYW5nZSlcbiAgICAgIGVsc2UgcmV0dXJuIHVuZGVmaW5lZFxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIFV0aWwud2FybihlKVxuICAgICAgcmV0dXJuIHVuZGVmaW5lZFxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgdG9vbHRpcENvbW1hbmQoXG4gICAgdG9vbHRpcGZ1bjogKGU6IFRleHRFZGl0b3IsIHA6IFJhbmdlKSA9PiBQcm9taXNlPFVQSS5JVG9vbHRpcERhdGE+LFxuICApIHtcbiAgICByZXR1cm4gYXN5bmMgKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSA9PlxuICAgICAgdGhpcy51cGkuc2hvd1Rvb2x0aXAoe1xuICAgICAgICBlZGl0b3I6IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKSxcbiAgICAgICAgZGV0YWlsOiBkZXRhaWwgYXMgT2JqZWN0LFxuICAgICAgICBhc3luYyB0b29sdGlwKGNyYW5nZSkge1xuICAgICAgICAgIHJldHVybiB0b29sdGlwZnVuKGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKSwgY3JhbmdlKVxuICAgICAgICB9LFxuICAgICAgfSlcbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBpbnNlcnRUeXBlQ29tbWFuZCh7IGN1cnJlbnRUYXJnZXQsIGRldGFpbCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGVyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbCBhcyBPYmplY3QpXG4gICAgaWYgKGVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCB7IGNyYW5nZSwgcG9zIH0gPSBlclxuICAgIGNvbnN0IHN5bUluZm8gPSBVdGlsLmdldFN5bWJvbEF0UG9pbnQoZWRpdG9yLCBwb3MpXG4gICAgaWYgKCFzeW1JbmZvKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgeyBzY29wZSwgcmFuZ2UsIHN5bWJvbCB9ID0gc3ltSW5mb1xuICAgIGlmIChzY29wZS5zdGFydHNXaXRoKCdrZXl3b3JkLm9wZXJhdG9yLicpKSB7XG4gICAgICByZXR1cm5cbiAgICB9IC8vIGNhbid0IGNvcnJlY3RseSBoYW5kbGUgaW5maXggbm90YXRpb25cbiAgICBjb25zdCB7IHR5cGUgfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRUeXBlKGVkaXRvci5nZXRCdWZmZXIoKSwgY3JhbmdlKVxuICAgIGlmIChcbiAgICAgIGVkaXRvclxuICAgICAgICAuZ2V0VGV4dEluQnVmZmVyUmFuZ2UoW1xuICAgICAgICAgIHJhbmdlLmVuZCxcbiAgICAgICAgICBlZGl0b3IuZ2V0QnVmZmVyKCkucmFuZ2VGb3JSb3cocmFuZ2UuZW5kLnJvdywgZmFsc2UpLmVuZCxcbiAgICAgICAgXSlcbiAgICAgICAgLm1hdGNoKC89LylcbiAgICApIHtcbiAgICAgIGxldCBpbmRlbnQgPSBlZGl0b3IuZ2V0VGV4dEluQnVmZmVyUmFuZ2UoW1xuICAgICAgICBbcmFuZ2Uuc3RhcnQucm93LCAwXSxcbiAgICAgICAgcmFuZ2Uuc3RhcnQsXG4gICAgICBdKVxuICAgICAgbGV0IGJpcmRUcmFjayA9ICcnXG4gICAgICBpZiAoXG4gICAgICAgIGVkaXRvclxuICAgICAgICAgIC5zY29wZURlc2NyaXB0b3JGb3JCdWZmZXJQb3NpdGlvbihwb3MpXG4gICAgICAgICAgLmdldFNjb3Blc0FycmF5KClcbiAgICAgICAgICAuaW5jbHVkZXMoJ21ldGEuZW1iZWRkZWQuaGFza2VsbCcpXG4gICAgICApIHtcbiAgICAgICAgYmlyZFRyYWNrID0gaW5kZW50LnNsaWNlKDAsIDIpXG4gICAgICAgIGluZGVudCA9IGluZGVudC5zbGljZSgyKVxuICAgICAgfVxuICAgICAgaWYgKGluZGVudC5tYXRjaCgvXFxTLykpIHtcbiAgICAgICAgaW5kZW50ID0gaW5kZW50LnJlcGxhY2UoL1xcUy9nLCAnICcpXG4gICAgICB9XG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoXG4gICAgICAgIFtyYW5nZS5zdGFydCwgcmFuZ2Uuc3RhcnRdLFxuICAgICAgICBgJHtzeW1ib2x9IDo6ICR7dHlwZX1cXG4ke2JpcmRUcmFja30ke2luZGVudH1gLFxuICAgICAgKVxuICAgIH0gZWxzZSB7XG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoXG4gICAgICAgIHJhbmdlLFxuICAgICAgICBgKCR7ZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKHJhbmdlKX0gOjogJHt0eXBlfSlgLFxuICAgICAgKVxuICAgIH1cbiAgfVxuXG4gIC8vIEBoYW5kbGVFeGNlcHRpb25cbiAgLy8gcHJpdmF0ZSBhc3luYyBjYXNlU3BsaXRDb21tYW5kKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSB7XG4gIC8vICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gIC8vICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgLy8gICBpZiAoIWV2cikge1xuICAvLyAgICAgcmV0dXJuXG4gIC8vICAgfVxuICAvLyAgIGNvbnN0IHsgY3JhbmdlIH0gPSBldnJcbiAgLy8gICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9DYXNlU3BsaXQoZWRpdG9yLmdldEJ1ZmZlcigpLCBjcmFuZ2UpXG4gIC8vICAgZm9yIChjb25zdCB7IHJhbmdlLCByZXBsYWNlbWVudCB9IG9mIHJlcykge1xuICAvLyAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKHJhbmdlLCByZXBsYWNlbWVudClcbiAgLy8gICB9XG4gIC8vIH1cblxuICAvLyBAaGFuZGxlRXhjZXB0aW9uXG4gIC8vIHByaXZhdGUgYXN5bmMgc2lnRmlsbENvbW1hbmQoeyBjdXJyZW50VGFyZ2V0LCBkZXRhaWwgfTogVEVDb21tYW5kRXZlbnQpIHtcbiAgLy8gICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgLy8gICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAvLyAgIGlmICghZXZyKSB7XG4gIC8vICAgICByZXR1cm5cbiAgLy8gICB9XG4gIC8vICAgY29uc3QgeyBjcmFuZ2UgfSA9IGV2clxuICAvLyAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb1NpZ0ZpbGwoZWRpdG9yLmdldEJ1ZmZlcigpLCBjcmFuZ2UpXG4gIC8vXG4gIC8vICAgZWRpdG9yLnRyYW5zYWN0KCgpID0+IHtcbiAgLy8gICAgIGNvbnN0IHsgdHlwZSwgcmFuZ2UsIGJvZHkgfSA9IHJlc1xuICAvLyAgICAgY29uc3Qgc2lnID0gZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKHJhbmdlKVxuICAvLyAgICAgbGV0IGluZGVudCA9IGVkaXRvci5pbmRlbnRMZXZlbEZvckxpbmUoc2lnKVxuICAvLyAgICAgY29uc3QgcG9zID0gcmFuZ2UuZW5kXG4gIC8vICAgICBjb25zdCB0ZXh0ID0gYFxcbiR7Ym9keX1gXG4gIC8vICAgICBpZiAodHlwZSA9PT0gJ2luc3RhbmNlJykge1xuICAvLyAgICAgICBpbmRlbnQgKz0gMVxuICAvLyAgICAgICBpZiAoIXNpZy5lbmRzV2l0aCgnIHdoZXJlJykpIHtcbiAgLy8gICAgICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoW3JhbmdlLmVuZCwgcmFuZ2UuZW5kXSwgJyB3aGVyZScpXG4gIC8vICAgICAgIH1cbiAgLy8gICAgIH1cbiAgLy8gICAgIGNvbnN0IG5ld3JhbmdlID0gZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFtwb3MsIHBvc10sIHRleHQpXG4gIC8vICAgICBuZXdyYW5nZVxuICAvLyAgICAgICAuZ2V0Um93cygpXG4gIC8vICAgICAgIC5zbGljZSgxKVxuICAvLyAgICAgICAubWFwKChyb3cpID0+IGVkaXRvci5zZXRJbmRlbnRhdGlvbkZvckJ1ZmZlclJvdyhyb3csIGluZGVudCkpXG4gIC8vICAgfSlcbiAgLy8gfVxuXG4gIC8vIEBoYW5kbGVFeGNlcHRpb25cbiAgLy8gcHJpdmF0ZSBhc3luYyBnb1RvRGVjbENvbW1hbmQoeyBjdXJyZW50VGFyZ2V0LCBkZXRhaWwgfTogVEVDb21tYW5kRXZlbnQpIHtcbiAgLy8gICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgLy8gICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAvLyAgIGlmICghZXZyKSB7XG4gIC8vICAgICByZXR1cm5cbiAgLy8gICB9XG4gIC8vICAgY29uc3QgeyBjcmFuZ2UgfSA9IGV2clxuICAvLyAgIGNvbnN0IHsgaW5mbyB9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldEluZm9JbkJ1ZmZlcihlZGl0b3IsIGNyYW5nZSlcbiAgLy8gICBjb25zdCByZXMgPSAvLiotLSBEZWZpbmVkIGF0ICguKyk6KFxcZCspOihcXGQrKS8uZXhlYyhpbmZvKVxuICAvLyAgIGlmICghcmVzKSB7XG4gIC8vICAgICByZXR1cm5cbiAgLy8gICB9XG4gIC8vICAgY29uc3QgW2ZuLCBsaW5lLCBjb2xdID0gcmVzLnNsaWNlKDEpXG4gIC8vICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRSb290RGlyKGVkaXRvci5nZXRCdWZmZXIoKSlcbiAgLy8gICBpZiAoIXJvb3REaXIpIHtcbiAgLy8gICAgIHJldHVyblxuICAvLyAgIH1cbiAgLy8gICBjb25zdCB1cmkgPSByb290RGlyLmdldEZpbGUoZm4pLmdldFBhdGgoKSB8fCBmblxuICAvLyAgIGF3YWl0IGF0b20ud29ya3NwYWNlLm9wZW4odXJpLCB7XG4gIC8vICAgICBpbml0aWFsTGluZTogcGFyc2VJbnQobGluZSwgMTApIC0gMSxcbiAgLy8gICAgIGluaXRpYWxDb2x1bW46IHBhcnNlSW50KGNvbCwgMTApIC0gMSxcbiAgLy8gICB9KVxuICAvLyB9XG5cbiAgLy8gQGhhbmRsZUV4Y2VwdGlvblxuICAvLyBwcml2YXRlIGFzeW5jIGluc2VydEltcG9ydENvbW1hbmQoeyBjdXJyZW50VGFyZ2V0LCBkZXRhaWwgfTogVEVDb21tYW5kRXZlbnQpIHtcbiAgLy8gICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgLy8gICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgLy8gICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAvLyAgIGlmICghZXZyKSB7XG4gIC8vICAgICByZXR1cm5cbiAgLy8gICB9XG4gIC8vICAgY29uc3QgeyBjcmFuZ2UgfSA9IGV2clxuICAvLyAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmZpbmRTeW1ib2xQcm92aWRlcnNJbkJ1ZmZlcihlZGl0b3IsIGNyYW5nZSlcbiAgLy8gICBjb25zdCBtb2QgPSBhd2FpdCBpbXBvcnRMaXN0VmlldyhsaW5lcylcbiAgLy8gICBpZiAobW9kKSB7XG4gIC8vICAgICBjb25zdCBwaSA9IGF3YWl0IG5ldyBQcm9taXNlPHsgcG9zOiBQb2ludDsgaW5kZW50OiBzdHJpbmc7IGVuZDogc3RyaW5nIH0+KFxuICAvLyAgICAgICAocmVzb2x2ZSkgPT4ge1xuICAvLyAgICAgICAgIGJ1ZmZlci5iYWNrd2FyZHNTY2FuKC9eKFxccyopKGltcG9ydHxtb2R1bGUpLywgKHsgbWF0Y2gsIHJhbmdlIH0pID0+IHtcbiAgLy8gICAgICAgICAgIGxldCBpbmRlbnQgPSAnJ1xuICAvLyAgICAgICAgICAgc3dpdGNoIChtYXRjaFsyXSkge1xuICAvLyAgICAgICAgICAgICBjYXNlICdpbXBvcnQnOlxuICAvLyAgICAgICAgICAgICAgIGluZGVudCA9IGBcXG4ke21hdGNoWzFdfWBcbiAgLy8gICAgICAgICAgICAgICBicmVha1xuICAvLyAgICAgICAgICAgICBjYXNlICdtb2R1bGUnOlxuICAvLyAgICAgICAgICAgICAgIGluZGVudCA9IGBcXG5cXG4ke21hdGNoWzFdfWBcbiAgLy8gICAgICAgICAgICAgICBicmVha1xuICAvLyAgICAgICAgICAgfVxuICAvLyAgICAgICAgICAgcmVzb2x2ZSh7XG4gIC8vICAgICAgICAgICAgIHBvczogYnVmZmVyLnJhbmdlRm9yUm93KHJhbmdlLnN0YXJ0LnJvdywgZmFsc2UpLmVuZCxcbiAgLy8gICAgICAgICAgICAgaW5kZW50LFxuICAvLyAgICAgICAgICAgICBlbmQ6ICcnLFxuICAvLyAgICAgICAgICAgfSlcbiAgLy8gICAgICAgICB9KVxuICAvLyAgICAgICAgIC8vIG5vdGhpbmcgZm91bmRcbiAgLy8gICAgICAgICByZXNvbHZlKHtcbiAgLy8gICAgICAgICAgIHBvczogYnVmZmVyLmdldEZpcnN0UG9zaXRpb24oKSxcbiAgLy8gICAgICAgICAgIGluZGVudDogJycsXG4gIC8vICAgICAgICAgICBlbmQ6ICdcXG4nLFxuICAvLyAgICAgICAgIH0pXG4gIC8vICAgICAgIH0sXG4gIC8vICAgICApXG4gIC8vICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoXG4gIC8vICAgICAgIFtwaS5wb3MsIHBpLnBvc10sXG4gIC8vICAgICAgIGAke3BpLmluZGVudH1pbXBvcnQgJHttb2R9JHtwaS5lbmR9YCxcbiAgLy8gICAgIClcbiAgLy8gICB9XG4gIC8vIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVUb29sdGlwKGU6IFRleHRFZGl0b3IsIHA6IFJhbmdlKSB7XG4gICAgY29uc3QgeyByYW5nZSwgdHlwZSB9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFR5cGUoZS5nZXRCdWZmZXIoKSwgcClcbiAgICByZXR1cm4ge1xuICAgICAgcmFuZ2UsXG4gICAgICB0ZXh0OiB7XG4gICAgICAgIHRleHQ6IHR5cGUsXG4gICAgICAgIGhpZ2hsaWdodGVyOiBhdG9tLmNvbmZpZy5nZXQoJ2lkZS1oYXNrZWxsLWhpZS5oaWdobGlnaHRUb29sdGlwcycpXG4gICAgICAgICAgPyAnaGludC50eXBlLmhhc2tlbGwnXG4gICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICB9LFxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5mb1Rvb2x0aXAoZTogVGV4dEVkaXRvciwgcDogUmFuZ2UpIHtcbiAgICBjb25zdCBzeW1JbmZvID0gVXRpbC5nZXRTeW1ib2xJblJhbmdlKGUsIHApXG4gICAgaWYgKCFzeW1JbmZvKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBnZXQgc3ltYm9sIGZvciBpbmZvXCIpXG4gICAgfVxuICAgIGNvbnN0IHsgc3ltYm9sLCByYW5nZSB9ID0gc3ltSW5mb1xuICAgIGNvbnN0IGluZm8gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0SW5mbyhlLmdldEJ1ZmZlcigpLCBzeW1ib2wpXG4gICAgcmV0dXJuIHtcbiAgICAgIHJhbmdlLFxuICAgICAgdGV4dDoge1xuICAgICAgICB0ZXh0OiBpbmZvLFxuICAgICAgICBoaWdobGlnaHRlcjogYXRvbS5jb25maWcuZ2V0KCdpZGUtaGFza2VsbC1oaWUuaGlnaGxpZ2h0VG9vbHRpcHMnKVxuICAgICAgICAgID8gJ3NvdXJjZS5oYXNrZWxsJ1xuICAgICAgICAgIDogdW5kZWZpbmVkLFxuICAgICAgfSxcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluZm9UeXBlVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5pbmZvVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHRoaXMudHlwZVRvb2x0aXAoZSwgcClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVJbmZvVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy50eXBlVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHRoaXMuaW5mb1Rvb2x0aXAoZSwgcClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVBbmRJbmZvVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIGNvbnN0IHR5cGVQID0gdGhpcy50eXBlVG9vbHRpcChlLCBwKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpXG4gICAgY29uc3QgaW5mb1AgPSB0aGlzLmluZm9Ub29sdGlwKGUsIHApLmNhdGNoKCgpID0+IHVuZGVmaW5lZClcbiAgICBjb25zdCBbdHlwZSwgaW5mb10gPSBhd2FpdCBQcm9taXNlLmFsbChbdHlwZVAsIGluZm9QXSlcbiAgICBsZXQgcmFuZ2U6IFJhbmdlXG4gICAgbGV0IHRleHQ6IHN0cmluZ1xuICAgIGlmICh0eXBlICYmIGluZm8pIHtcbiAgICAgIHJhbmdlID0gdHlwZS5yYW5nZS51bmlvbihpbmZvLnJhbmdlKVxuICAgICAgY29uc3Qgc3VwID0gYXRvbS5jb25maWcuZ2V0KFxuICAgICAgICAnaWRlLWhhc2tlbGwtaGllLnN1cHByZXNzUmVkdW5kYW50VHlwZUluVHlwZUFuZEluZm9Ub29sdGlwcycsXG4gICAgICApXG4gICAgICBpZiAoc3VwICYmIGluZm8udGV4dC50ZXh0LmluY2x1ZGVzKGA6OiAke3R5cGUudGV4dC50ZXh0fWApKSB7XG4gICAgICAgIHRleHQgPSBpbmZvLnRleHQudGV4dFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGV4dCA9IGA6OiAke3R5cGUudGV4dC50ZXh0fVxcbiR7aW5mby50ZXh0LnRleHR9YFxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZSkge1xuICAgICAgcmFuZ2UgPSB0eXBlLnJhbmdlXG4gICAgICB0ZXh0ID0gYDo6ICR7dHlwZS50ZXh0LnRleHR9YFxuICAgIH0gZWxzZSBpZiAoaW5mbykge1xuICAgICAgcmFuZ2UgPSBpbmZvLnJhbmdlXG4gICAgICB0ZXh0ID0gaW5mby50ZXh0LnRleHRcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdHb3QgbmVpdGhlciB0eXBlIG5vciBpbmZvJylcbiAgICB9XG4gICAgY29uc3QgaGlnaGxpZ2h0ZXIgPSBhdG9tLmNvbmZpZy5nZXQoJ2lkZS1oYXNrZWxsLWhpZS5oaWdobGlnaHRUb29sdGlwcycpXG4gICAgICA/ICdzb3VyY2UuaGFza2VsbCdcbiAgICAgIDogdW5kZWZpbmVkXG4gICAgcmV0dXJuIHsgcmFuZ2UsIHRleHQ6IHsgdGV4dCwgaGlnaGxpZ2h0ZXIgfSB9XG4gIH1cblxuICBwcml2YXRlIHNldEhpZ2hsaWdodGVyKCkge1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2lkZS1oYXNrZWxsLWhpZS5oaWdobGlnaHRNZXNzYWdlcycpKSB7XG4gICAgICByZXR1cm4gKG06IFVQSS5JUmVzdWx0SXRlbSk6IFVQSS5JUmVzdWx0SXRlbSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgbS5tZXNzYWdlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIGNvbnN0IG1lc3NhZ2U6IFVQSS5JTWVzc2FnZVRleHQgPSB7XG4gICAgICAgICAgICB0ZXh0OiBtLm1lc3NhZ2UsXG4gICAgICAgICAgICBoaWdobGlnaHRlcjogJ2hpbnQubWVzc2FnZS5oYXNrZWxsJyxcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsgLi4ubSwgbWVzc2FnZSB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIG1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gKG06IFVQSS5JUmVzdWx0SXRlbSkgPT4gbVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY29uc29sZVJlcG9ydChhcmc6IGFueVtdKSB7XG4gICAgLy8gdHNsaW50OmRpc2JhbGUtbmV4dC1saW5lOiBuby1jb25zb2xlXG4gICAgY29uc29sZS5lcnJvciguLi5hcmcpXG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVByb2Nlc3NFcnJvcihhcmc6IGFueVtdKSB7XG4gICAgc3dpdGNoICh0aGlzLm1zZ0JhY2tlbmQpIHtcbiAgICAgIGNhc2UgJ3VwaSc6XG4gICAgICAgIHRoaXMucHJvY2Vzc01lc3NhZ2VzLnB1c2goe1xuICAgICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgICBgSElFIHJlcG9ydGVkIGFuIGVycm9yOiAke2FyZ1xuICAgICAgICAgICAgICAubWFwKCh4KSA9PiB4LnRvU3RyaW5nKCkpXG4gICAgICAgICAgICAgIC5qb2luKCc7ICcpfWAgK1xuICAgICAgICAgICAgJ1xcblxcblNlZSBjb25zb2xlIChWaWV3IOKGkiBEZXZlbG9wZXIg4oaSIFRvZ2dsZSBEZXZlbG9wZXIgVG9vbHMg4oaSIENvbnNvbGUgdGFiKSBmb3IgZGV0YWlscy4nLFxuICAgICAgICAgIHNldmVyaXR5OiAnSElFJyxcbiAgICAgICAgfSlcbiAgICAgICAgdGhpcy5jb25zb2xlUmVwb3J0KGFyZylcbiAgICAgICAgdGhpcy5zZW5kTWVzc2FnZXModGhpcy5wcm9jZXNzLmdldE1lc3NhZ2VzKCkpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdjb25zb2xlJzpcbiAgICAgICAgdGhpcy5jb25zb2xlUmVwb3J0KGFyZylcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ3BvcHVwJzpcbiAgICAgICAgdGhpcy5jb25zb2xlUmVwb3J0KGFyZylcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKCdISUUgcmVwb3J0ZWQgYW4gZXJyb3InLCB7XG4gICAgICAgICAgZGV0YWlsOlxuICAgICAgICAgICAgYXJnLm1hcCgoeCkgPT4geC50b1N0cmluZygpKS5qb2luKCc7ICcpICtcbiAgICAgICAgICAgICdcXG5cXG5TZWUgY29uc29sZSAoVmlldyDihpIgRGV2ZWxvcGVyIOKGkiBUb2dnbGUgRGV2ZWxvcGVyIFRvb2xzIOKGkiBDb25zb2xlIHRhYikgZm9yIGRldGFpbHMuJyxcbiAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgICAgYnJlYWtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVByb2Nlc3NXYXJuaW5nKGFyZzogYW55W10pIHtcbiAgICBzd2l0Y2ggKHRoaXMubXNnQmFja2VuZCkge1xuICAgICAgY2FzZSAndXBpJzpcbiAgICAgICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMucHVzaCh7XG4gICAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICAgIGBISUUgcmVwb3J0ZWQgYSB3YXJuaW5nOiAke2FyZ1xuICAgICAgICAgICAgICAubWFwKCh4KSA9PiB4LnRvU3RyaW5nKCkpXG4gICAgICAgICAgICAgIC5qb2luKCc7ICcpfWAgK1xuICAgICAgICAgICAgJ1xcblxcblNlZSBjb25zb2xlIChWaWV3IOKGkiBEZXZlbG9wZXIg4oaSIFRvZ2dsZSBEZXZlbG9wZXIgVG9vbHMg4oaSIENvbnNvbGUgdGFiKSBmb3IgZGV0YWlscy4nLFxuICAgICAgICAgIHNldmVyaXR5OiAnSElFJyxcbiAgICAgICAgfSlcbiAgICAgICAgVXRpbC53YXJuKC4uLmFyZylcbiAgICAgICAgdGhpcy5zZW5kTWVzc2FnZXModGhpcy5wcm9jZXNzLmdldE1lc3NhZ2VzKCkpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdjb25zb2xlJzpcbiAgICAgICAgVXRpbC53YXJuKC4uLmFyZylcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ3BvcHVwJzpcbiAgICAgICAgVXRpbC53YXJuKC4uLmFyZylcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcoJ0hJRSByZXBvcnRlZCBhIHdhcm5pbmcnLCB7XG4gICAgICAgICAgZGV0YWlsOlxuICAgICAgICAgICAgYXJnLm1hcCgoeCkgPT4geC50b1N0cmluZygpKS5qb2luKCc7ICcpICtcbiAgICAgICAgICAgICdcXG5cXG5TZWUgY29uc29sZSAoVmlldyDihpIgRGV2ZWxvcGVyIOKGkiBUb2dnbGUgRGV2ZWxvcGVyIFRvb2xzIOKGkiBDb25zb2xlIHRhYikgZm9yIGRldGFpbHMuJyxcbiAgICAgICAgICBkaXNtaXNzYWJsZTogZmFsc2UsXG4gICAgICAgIH0pXG4gICAgICAgIGJyZWFrXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzZW5kTWVzc2FnZXMobXNnczogUmVhZG9ubHlBcnJheTxSZWFkb25seTxVUEkuSVJlc3VsdEl0ZW0+Pikge1xuICAgIHRoaXMudXBpLnNldE1lc3NhZ2VzKFxuICAgICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMuY29uY2F0KG1zZ3MubWFwKHRoaXMuc2V0SGlnaGxpZ2h0ZXIoKSkpLFxuICAgIClcbiAgfVxufVxuIl19