"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tooltipActions = [
    { value: '', description: 'Nothing' },
    { value: 'type', description: 'Type' },
    { value: 'info', description: 'Info' },
    { value: 'infoType', description: 'Info, fallback to Type' },
    { value: 'typeInfo', description: 'Type, fallback to Info' },
    { value: 'typeAndInfo', description: 'Type and Info' },
];
exports.config = {
    hiePath: {
        type: 'string',
        default: 'hie',
        description: 'Path to haskell-ide-engine executable',
        order: 0,
    },
    debug: {
        type: 'boolean',
        default: false,
        order: 999,
    },
    onMouseHoverShow: {
        type: 'string',
        description: 'Contents of tooltip on mouse hover',
        default: 'typeAndInfo',
        enum: tooltipActions,
        order: 30,
    },
    onSelectionShow: {
        type: 'string',
        description: 'Contents of tooltip on selection',
        default: '',
        enum: tooltipActions,
        order: 30,
    },
    highlightTooltips: {
        type: 'boolean',
        default: true,
        description: 'Show highlighting for type/info tooltips',
        order: 40,
    },
    suppressRedundantTypeInTypeAndInfoTooltips: {
        type: 'boolean',
        default: true,
        description: `In tooltips with type AND info, suppress type if \
it's the same as info`,
        order: 41,
    },
    highlightMessages: {
        type: 'boolean',
        default: true,
        description: 'Show highlighting for output panel messages',
        order: 40,
    },
    ghcModMessages: {
        type: 'string',
        description: 'How to show warnings/errors reported by ghc-mod (requires restart)',
        default: 'console',
        enum: [
            { value: 'console', description: 'Developer Console' },
            { value: 'upi', description: 'Output Panel' },
            { value: 'popup', description: 'Error/Warning Popups' },
        ],
        order: 42,
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLE1BQU0sY0FBYyxHQUFHO0lBQ3JCLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFO0lBQ3JDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFO0lBQ3RDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFO0lBQ3RDLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsd0JBQXdCLEVBQUU7SUFDNUQsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSx3QkFBd0IsRUFBRTtJQUM1RCxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRTtDQUN2RCxDQUFBO0FBRVksUUFBQSxNQUFNLEdBQUc7SUFDcEIsT0FBTyxFQUFFO1FBQ1AsSUFBSSxFQUFFLFFBQVE7UUFDZCxPQUFPLEVBQUUsS0FBSztRQUNkLFdBQVcsRUFBRSx1Q0FBdUM7UUFDcEQsS0FBSyxFQUFFLENBQUM7S0FDVDtJQUNELEtBQUssRUFBRTtRQUNMLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEtBQUs7UUFDZCxLQUFLLEVBQUUsR0FBRztLQUNYO0lBQ0QsZ0JBQWdCLEVBQUU7UUFDaEIsSUFBSSxFQUFFLFFBQVE7UUFDZCxXQUFXLEVBQUUsb0NBQW9DO1FBQ2pELE9BQU8sRUFBRSxhQUFhO1FBQ3RCLElBQUksRUFBRSxjQUFjO1FBQ3BCLEtBQUssRUFBRSxFQUFFO0tBQ1Y7SUFDRCxlQUFlLEVBQUU7UUFDZixJQUFJLEVBQUUsUUFBUTtRQUNkLFdBQVcsRUFBRSxrQ0FBa0M7UUFDL0MsT0FBTyxFQUFFLEVBQUU7UUFDWCxJQUFJLEVBQUUsY0FBYztRQUNwQixLQUFLLEVBQUUsRUFBRTtLQUNWO0lBQ0QsaUJBQWlCLEVBQUU7UUFDakIsSUFBSSxFQUFFLFNBQVM7UUFDZixPQUFPLEVBQUUsSUFBSTtRQUNiLFdBQVcsRUFBRSwwQ0FBMEM7UUFDdkQsS0FBSyxFQUFFLEVBQUU7S0FDVjtJQUNELDBDQUEwQyxFQUFFO1FBQzFDLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLElBQUk7UUFDYixXQUFXLEVBQUU7c0JBQ0s7UUFDbEIsS0FBSyxFQUFFLEVBQUU7S0FDVjtJQUNELGlCQUFpQixFQUFFO1FBQ2pCLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLElBQUk7UUFDYixXQUFXLEVBQUUsNkNBQTZDO1FBQzFELEtBQUssRUFBRSxFQUFFO0tBQ1Y7SUFDRCxjQUFjLEVBQUU7UUFDZCxJQUFJLEVBQUUsUUFBUTtRQUNkLFdBQVcsRUFDVCxvRUFBb0U7UUFDdEUsT0FBTyxFQUFFLFNBQVM7UUFDbEIsSUFBSSxFQUFFO1lBQ0osRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxtQkFBbUIsRUFBRTtZQUN0RCxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRTtZQUM3QyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLHNCQUFzQixFQUFFO1NBQ3hEO1FBQ0QsS0FBSyxFQUFFLEVBQUU7S0FDVjtDQUNGLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCB0b29sdGlwQWN0aW9ucyA9IFtcbiAgeyB2YWx1ZTogJycsIGRlc2NyaXB0aW9uOiAnTm90aGluZycgfSxcbiAgeyB2YWx1ZTogJ3R5cGUnLCBkZXNjcmlwdGlvbjogJ1R5cGUnIH0sXG4gIHsgdmFsdWU6ICdpbmZvJywgZGVzY3JpcHRpb246ICdJbmZvJyB9LFxuICB7IHZhbHVlOiAnaW5mb1R5cGUnLCBkZXNjcmlwdGlvbjogJ0luZm8sIGZhbGxiYWNrIHRvIFR5cGUnIH0sXG4gIHsgdmFsdWU6ICd0eXBlSW5mbycsIGRlc2NyaXB0aW9uOiAnVHlwZSwgZmFsbGJhY2sgdG8gSW5mbycgfSxcbiAgeyB2YWx1ZTogJ3R5cGVBbmRJbmZvJywgZGVzY3JpcHRpb246ICdUeXBlIGFuZCBJbmZvJyB9LFxuXVxuXG5leHBvcnQgY29uc3QgY29uZmlnID0ge1xuICBoaWVQYXRoOiB7XG4gICAgdHlwZTogJ3N0cmluZycsXG4gICAgZGVmYXVsdDogJ2hpZScsXG4gICAgZGVzY3JpcHRpb246ICdQYXRoIHRvIGhhc2tlbGwtaWRlLWVuZ2luZSBleGVjdXRhYmxlJyxcbiAgICBvcmRlcjogMCxcbiAgfSxcbiAgZGVidWc6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgb3JkZXI6IDk5OSxcbiAgfSxcbiAgb25Nb3VzZUhvdmVyU2hvdzoge1xuICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIGRlc2NyaXB0aW9uOiAnQ29udGVudHMgb2YgdG9vbHRpcCBvbiBtb3VzZSBob3ZlcicsXG4gICAgZGVmYXVsdDogJ3R5cGVBbmRJbmZvJyxcbiAgICBlbnVtOiB0b29sdGlwQWN0aW9ucyxcbiAgICBvcmRlcjogMzAsXG4gIH0sXG4gIG9uU2VsZWN0aW9uU2hvdzoge1xuICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIGRlc2NyaXB0aW9uOiAnQ29udGVudHMgb2YgdG9vbHRpcCBvbiBzZWxlY3Rpb24nLFxuICAgIGRlZmF1bHQ6ICcnLFxuICAgIGVudW06IHRvb2x0aXBBY3Rpb25zLFxuICAgIG9yZGVyOiAzMCxcbiAgfSxcbiAgaGlnaGxpZ2h0VG9vbHRpcHM6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjogJ1Nob3cgaGlnaGxpZ2h0aW5nIGZvciB0eXBlL2luZm8gdG9vbHRpcHMnLFxuICAgIG9yZGVyOiA0MCxcbiAgfSxcbiAgc3VwcHJlc3NSZWR1bmRhbnRUeXBlSW5UeXBlQW5kSW5mb1Rvb2x0aXBzOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgZGVzY3JpcHRpb246IGBJbiB0b29sdGlwcyB3aXRoIHR5cGUgQU5EIGluZm8sIHN1cHByZXNzIHR5cGUgaWYgXFxcbml0J3MgdGhlIHNhbWUgYXMgaW5mb2AsXG4gICAgb3JkZXI6IDQxLFxuICB9LFxuICBoaWdobGlnaHRNZXNzYWdlczoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnU2hvdyBoaWdobGlnaHRpbmcgZm9yIG91dHB1dCBwYW5lbCBtZXNzYWdlcycsXG4gICAgb3JkZXI6IDQwLFxuICB9LFxuICBnaGNNb2RNZXNzYWdlczoge1xuICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ0hvdyB0byBzaG93IHdhcm5pbmdzL2Vycm9ycyByZXBvcnRlZCBieSBnaGMtbW9kIChyZXF1aXJlcyByZXN0YXJ0KScsXG4gICAgZGVmYXVsdDogJ2NvbnNvbGUnLFxuICAgIGVudW06IFtcbiAgICAgIHsgdmFsdWU6ICdjb25zb2xlJywgZGVzY3JpcHRpb246ICdEZXZlbG9wZXIgQ29uc29sZScgfSxcbiAgICAgIHsgdmFsdWU6ICd1cGknLCBkZXNjcmlwdGlvbjogJ091dHB1dCBQYW5lbCcgfSxcbiAgICAgIHsgdmFsdWU6ICdwb3B1cCcsIGRlc2NyaXB0aW9uOiAnRXJyb3IvV2FybmluZyBQb3B1cHMnIH0sXG4gICAgXSxcbiAgICBvcmRlcjogNDIsXG4gIH0sXG59XG5cbi8vIGdlbmVyYXRlZCBieSB0eXBlZC1jb25maWcuanNcbmRlY2xhcmUgbW9kdWxlICdhdG9tJyB7XG4gIGludGVyZmFjZSBDb25maWdWYWx1ZXMge1xuICAgICdpZGUtaGFza2VsbC1oaWUuaGllUGF0aCc6IHN0cmluZ1xuICAgICdpZGUtaGFza2VsbC1oaWUuZGVidWcnOiBib29sZWFuXG4gICAgJ2lkZS1oYXNrZWxsLWhpZS5vbk1vdXNlSG92ZXJTaG93JzpcbiAgICAgIHwgJydcbiAgICAgIHwgJ3R5cGUnXG4gICAgICB8ICdpbmZvJ1xuICAgICAgfCAnaW5mb1R5cGUnXG4gICAgICB8ICd0eXBlSW5mbydcbiAgICAgIHwgJ3R5cGVBbmRJbmZvJ1xuICAgICdpZGUtaGFza2VsbC1oaWUub25TZWxlY3Rpb25TaG93JzpcbiAgICAgIHwgJydcbiAgICAgIHwgJ3R5cGUnXG4gICAgICB8ICdpbmZvJ1xuICAgICAgfCAnaW5mb1R5cGUnXG4gICAgICB8ICd0eXBlSW5mbydcbiAgICAgIHwgJ3R5cGVBbmRJbmZvJ1xuICAgICdpZGUtaGFza2VsbC1oaWUuaGlnaGxpZ2h0VG9vbHRpcHMnOiBib29sZWFuXG4gICAgJ2lkZS1oYXNrZWxsLWhpZS5zdXBwcmVzc1JlZHVuZGFudFR5cGVJblR5cGVBbmRJbmZvVG9vbHRpcHMnOiBib29sZWFuXG4gICAgJ2lkZS1oYXNrZWxsLWhpZS5oaWdobGlnaHRNZXNzYWdlcyc6IGJvb2xlYW5cbiAgICAnaWRlLWhhc2tlbGwtaGllLmdoY01vZE1lc3NhZ2VzJzogJ2NvbnNvbGUnIHwgJ3VwaScgfCAncG9wdXAnXG4gICAgJ2lkZS1oYXNrZWxsLWhpZSc6IHtcbiAgICAgIGhpZVBhdGg6IHN0cmluZ1xuICAgICAgZGVidWc6IGJvb2xlYW5cbiAgICAgIG9uTW91c2VIb3ZlclNob3c6XG4gICAgICAgIHwgJydcbiAgICAgICAgfCAndHlwZSdcbiAgICAgICAgfCAnaW5mbydcbiAgICAgICAgfCAnaW5mb1R5cGUnXG4gICAgICAgIHwgJ3R5cGVJbmZvJ1xuICAgICAgICB8ICd0eXBlQW5kSW5mbydcbiAgICAgIG9uU2VsZWN0aW9uU2hvdzpcbiAgICAgICAgfCAnJ1xuICAgICAgICB8ICd0eXBlJ1xuICAgICAgICB8ICdpbmZvJ1xuICAgICAgICB8ICdpbmZvVHlwZSdcbiAgICAgICAgfCAndHlwZUluZm8nXG4gICAgICAgIHwgJ3R5cGVBbmRJbmZvJ1xuICAgICAgaGlnaGxpZ2h0VG9vbHRpcHM6IGJvb2xlYW5cbiAgICAgIHN1cHByZXNzUmVkdW5kYW50VHlwZUluVHlwZUFuZEluZm9Ub29sdGlwczogYm9vbGVhblxuICAgICAgaGlnaGxpZ2h0TWVzc2FnZXM6IGJvb2xlYW5cbiAgICAgIGdoY01vZE1lc3NhZ2VzOiAnY29uc29sZScgfCAndXBpJyB8ICdwb3B1cCdcbiAgICB9XG4gIH1cbn1cbiJdfQ==